-- =====================================================================
-- Permite sumar una carga adicional de viáticos a un viaje que ya está
-- en curso (ej: se le terminó la plata al chofer a mitad de viaje).
-- Solo administrador/supervisor, igual que la carga inicial del viaje.
-- Queda un registro por cada carga (monto, método, quién y cuándo) para
-- trazabilidad, y el total se refleja en bitacora_viajes.viaticos_monto.
-- =====================================================================

create table if not exists bitacora_viaticos_adicionales (
  id uuid primary key default gen_random_uuid(),
  id_viaje uuid not null references bitacora_viajes(id) on delete cascade,
  monto numeric(12,2) not null check (monto > 0),
  metodo text check (metodo in ('Transferencia','Cheque','Efectivo')),
  usuario_alta uuid references usuarios(id),
  fecha_alta timestamptz not null default now()
);

alter table bitacora_viaticos_adicionales enable row level security;

drop policy if exists lectura_bitacora_viaticos_adicionales on bitacora_viaticos_adicionales;
create policy lectura_bitacora_viaticos_adicionales on bitacora_viaticos_adicionales for select
  using (exists (
    select 1 from bitacora_viajes bv
    where bv.id = bitacora_viaticos_adicionales.id_viaje
      and bv.empresa_id = empresa_actual()
      and (rol_actual() in ('administrador','supervisor') or bv.id_chofer = (select id from usuarios where auth_user_id = auth.uid()))
  ));

create or replace function agregar_viaticos_bitacora(p_id_viaje uuid, p_monto numeric, p_metodo text)
returns jsonb language plpgsql security definer as $$
declare
  v_viaje bitacora_viajes%rowtype;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para cargar viáticos');
  end if;

  select * into v_viaje from bitacora_viajes where id = p_id_viaje and empresa_id = empresa_actual();
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Viaje no encontrado');
  end if;

  if v_viaje.estado <> 'En_curso' then
    return jsonb_build_object('ok', false, 'msg', 'El viaje ya no está en curso');
  end if;

  if p_monto is null or p_monto <= 0 then
    return jsonb_build_object('ok', false, 'msg', 'El monto debe ser mayor a cero');
  end if;

  insert into bitacora_viaticos_adicionales (id_viaje, monto, metodo, usuario_alta)
  values (p_id_viaje, p_monto, p_metodo, (select id from usuarios where auth_user_id = auth.uid()));

  update bitacora_viajes set viaticos_monto = viaticos_monto + p_monto where id = p_id_viaje;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function agregar_viaticos_bitacora(uuid, numeric, text) to authenticated;
