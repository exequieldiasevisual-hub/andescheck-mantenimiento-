-- =====================================================================
-- Feature: Pañol — herramientas especiales con certificación y reserva
-- La superposición de reservas para la misma herramienta se garantiza a
-- nivel de base con un EXCLUDE constraint (btree_gist) sobre el rango de
-- fechas — no se resuelve "a mano" comparando fechas en el frontend,
-- porque eso es una condición de carrera bajo uso concurrente.
--
-- Nota de alcance: este módulo no existía en el sistema original (gs.js).
-- Antes de invertir en la UI completa, confirmar con el cliente que
-- realmente gestiona herramientas calibradas — si no, esto queda de más.
-- =====================================================================

create extension if not exists btree_gist;

create type estado_herramienta as enum ('Disponible','En_Uso','Reparacion');

create table herramientas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  codigo text not null,
  descripcion text not null,
  estado estado_herramienta not null default 'Disponible',
  fecha_vencimiento_certificacion date,
  doc_certificacion_url text,
  activo boolean not null default true,
  unique (empresa_id, codigo)
);
create index idx_herramientas_empresa on herramientas(empresa_id);

-- Estado real (No_Apta si venció la certificación) calculado al leer,
-- igual que preventivos_calculado / unidad_docs_calculado.
create view herramientas_calculado as
  select *,
    case
      when fecha_vencimiento_certificacion is not null and fecha_vencimiento_certificacion < current_date
        then 'No_Apta'
      else estado::text
    end as estado_real
  from herramientas;

create table ot_herramientas (
  id uuid primary key default gen_random_uuid(),
  id_ot uuid not null references ot_cabecera(id) on delete cascade,
  id_herramienta uuid not null references herramientas(id),
  fecha_reserva timestamptz not null,
  fecha_devolucion timestamptz not null,
  constraint chk_rango_valido check (fecha_devolucion > fecha_reserva),
  exclude using gist (
    id_herramienta with =,
    tstzrange(fecha_reserva, fecha_devolucion) with &&
  )
);
create index idx_ot_herramientas_ot on ot_herramientas(id_ot);

alter table herramientas enable row level security;
alter table ot_herramientas enable row level security;

create policy "lectura_herramientas" on herramientas for select using (empresa_id = empresa_actual());
create policy "escritura_herramientas" on herramientas for all using (
  empresa_id = empresa_actual() and rol_actual() in ('administrador','supervisor')
);

create policy "lectura_ot_herramientas" on ot_herramientas for select using (
  exists (select 1 from ot_cabecera o where o.id = ot_herramientas.id_ot and o.empresa_id = empresa_actual())
);
-- Sin policy de insert directo: toda reserva pasa por reservar_herramienta()
-- para que la validación de vigencia de certificación no se pueda saltear.

-- ---------------------------------------------------------------------
-- reservar_herramienta
-- Roles permitidos: administrador, supervisor
-- Regla 1: no se puede reservar una herramienta No_Apta (certificación vencida).
-- Regla 2: no se puede reservar si se superpone con otra reserva — lo
-- garantiza el EXCLUDE constraint de la tabla, acá solo se traduce la
-- excepción a un mensaje entendible.
-- ---------------------------------------------------------------------
create or replace function reservar_herramienta(
  p_id_ot uuid,
  p_id_herramienta uuid,
  p_fecha_reserva timestamptz,
  p_fecha_devolucion timestamptz
)
returns jsonb language plpgsql security definer as $$
declare
  v_rol rol_usuario;
  v_empresa uuid;
  v_herramienta herramientas_calculado%rowtype;
begin
  v_rol := rol_actual();
  v_empresa := empresa_actual();

  if v_rol not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para reservar herramientas');
  end if;

  if not exists (select 1 from ot_cabecera where id = p_id_ot and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'OT no encontrada');
  end if;

  select * into v_herramienta from herramientas_calculado
   where id = p_id_herramienta and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Herramienta no encontrada');
  end if;

  if v_herramienta.estado_real = 'No_Apta' then
    return jsonb_build_object('ok', false, 'msg', 'La herramienta tiene la certificación vencida y no puede reservarse');
  end if;

  begin
    insert into ot_herramientas (id_ot, id_herramienta, fecha_reserva, fecha_devolucion)
    values (p_id_ot, p_id_herramienta, p_fecha_reserva, p_fecha_devolucion);
  exception when exclusion_violation then
    return jsonb_build_object('ok', false, 'msg', 'La herramienta ya está reservada en ese rango de fechas');
  end;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function reservar_herramienta(uuid, uuid, timestamptz, timestamptz) to authenticated;

insert into storage.buckets (id, name, public)
values ('certificados-herramientas', 'certificados-herramientas', true)
on conflict (id) do nothing;

create policy "lectura_publica_certificados_herramientas" on storage.objects
  for select using (bucket_id = 'certificados-herramientas');
create policy "escritura_propia_empresa_certificados_herramientas" on storage.objects
  for insert with check (bucket_id = 'certificados-herramientas' and (storage.foldername(name))[1] = empresa_actual()::text);
