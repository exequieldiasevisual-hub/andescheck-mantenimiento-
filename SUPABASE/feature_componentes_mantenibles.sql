-- ==== Componentes mantenibles: bombas, equipos hidraulicos, accesorios intercambiables ====
-- El componente es una entidad real con historial propio.
-- Puede instalarse, retirarse y reasignarse entre unidades sin perder ese historial.
-- Su contador de mantenimiento se conserva al reasignarlo y no vuelve a cero.

create table if not exists componentes_mantenibles (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  tipo text not null,
  marca text,
  modelo text,
  numero_serie text,
  lectura_actual numeric(12,2),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create index if not exists idx_componentes_mantenibles_empresa on componentes_mantenibles(empresa_id);

alter table componentes_mantenibles enable row level security;

create policy "lectura_componentes_mantenibles" on componentes_mantenibles for select using (
  empresa_id = empresa_actual()
);
grant select on componentes_mantenibles to authenticated;
-- Sin policy de insert/update directo: todo pasa por RPCs (guardar_componente, etc).

create table if not exists componentes_asignaciones (
  id uuid primary key default gen_random_uuid(),
  id_componente uuid not null references componentes_mantenibles(id) on delete cascade,
  id_unidad uuid not null references unidades(id),
  desde timestamptz not null default now(),
  hasta timestamptz,
  motivo_retiro text,
  usuario uuid references usuarios(id)
);
create index if not exists idx_componentes_asignaciones_componente on componentes_asignaciones(id_componente);
create index if not exists idx_componentes_asignaciones_unidad on componentes_asignaciones(id_unidad);

-- Solo puede haber UNA asignacion activa (hasta is null) por componente a la vez.
create unique index if not exists idx_componentes_asignaciones_una_activa
  on componentes_asignaciones(id_componente) where hasta is null;

alter table componentes_asignaciones enable row level security;

create policy "lectura_componentes_asignaciones" on componentes_asignaciones for select using (
  exists (select 1 from componentes_mantenibles c where c.id = componentes_asignaciones.id_componente and c.empresa_id = empresa_actual())
);
grant select on componentes_asignaciones to authenticated;

create or replace function guardar_componente(
  p_id uuid default null,
  p_tipo text default null,
  p_marca text default null,
  p_modelo text default null,
  p_numero_serie text default null,
  p_lectura_actual numeric default null
)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_id_componente uuid;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para gestionar componentes');
  end if;

  if p_tipo is null or trim(p_tipo) = '' then
    return jsonb_build_object('ok', false, 'msg', 'El tipo de componente es obligatorio');
  end if;

  if p_id is null then
    insert into componentes_mantenibles (empresa_id, tipo, marca, modelo, numero_serie, lectura_actual)
    values (v_empresa, trim(p_tipo), nullif(trim(coalesce(p_marca,'')),''), nullif(trim(coalesce(p_modelo,'')),''), nullif(trim(coalesce(p_numero_serie,'')),''), p_lectura_actual)
    returning id into v_id_componente;
  else
    update componentes_mantenibles
       set tipo = trim(p_tipo),
           marca = nullif(trim(coalesce(p_marca,'')),''),
           modelo = nullif(trim(coalesce(p_modelo,'')),''),
           numero_serie = nullif(trim(coalesce(p_numero_serie,'')),''),
           lectura_actual = p_lectura_actual
     where id = p_id and empresa_id = v_empresa
     returning id into v_id_componente;

    if v_id_componente is null then
      return jsonb_build_object('ok', false, 'msg', 'Componente no encontrado');
    end if;
  end if;

  return jsonb_build_object('ok', true, 'id_componente', v_id_componente);
end;
$$;

grant execute on function guardar_componente(uuid, text, text, text, text, numeric) to authenticated;

create or replace function asignar_componente(p_id_componente uuid, p_id_unidad uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para gestionar componentes');
  end if;

  if not exists (select 1 from componentes_mantenibles where id = p_id_componente and empresa_id = v_empresa and activo = true) then
    return jsonb_build_object('ok', false, 'msg', 'Componente no encontrado');
  end if;

  if not exists (select 1 from unidades where id = p_id_unidad and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  -- si el componente ya estaba asignado a otra unidad, cerrar esa asignacion (el traslado es implicito)
  update componentes_asignaciones
     set hasta = now(), motivo_retiro = coalesce(motivo_retiro, 'Trasladado a otra unidad')
   where id_componente = p_id_componente and hasta is null;

  insert into componentes_asignaciones (id_componente, id_unidad, usuario)
  values (p_id_componente, p_id_unidad, (select id from usuarios where auth_user_id = auth.uid()));

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function asignar_componente(uuid, uuid) to authenticated;

create or replace function retirar_componente(p_id_componente uuid, p_motivo text)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para gestionar componentes');
  end if;

  if p_motivo is null or trim(p_motivo) = '' then
    return jsonb_build_object('ok', false, 'msg', 'El motivo del retiro es obligatorio');
  end if;

  if not exists (select 1 from componentes_mantenibles where id = p_id_componente and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Componente no encontrado');
  end if;

  update componentes_asignaciones
     set hasta = now(), motivo_retiro = trim(p_motivo)
   where id_componente = p_id_componente and hasta is null;

  if not found then
    return jsonb_build_object('ok', false, 'msg', 'El componente no tiene una asignación activa');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function retirar_componente(uuid, text) to authenticated;

create or replace function get_componentes_unidad(p_id_unidad uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  if not exists (select 1 from unidades where id = p_id_unidad and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  return jsonb_build_object(
    'ok', true,
    'componentes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'tipo', c.tipo, 'marca', c.marca, 'modelo', c.modelo,
        'numero_serie', c.numero_serie, 'lectura_actual', c.lectura_actual,
        'desde', a.desde
      ) order by a.desde)
      from componentes_asignaciones a
      join componentes_mantenibles c on c.id = a.id_componente
      where a.id_unidad = p_id_unidad and a.hasta is null and c.activo = true
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function get_componentes_unidad(uuid) to authenticated;

create or replace function get_historial_componente(p_id_componente uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  if not exists (select 1 from componentes_mantenibles where id = p_id_componente and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Componente no encontrado');
  end if;

  return jsonb_build_object(
    'ok', true,
    'asignaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id_unidad', a.id_unidad, 'unidad_descripcion', u.descripcion, 'unidad_patente', u.patente_serie,
        'desde', a.desde, 'hasta', a.hasta, 'motivo_retiro', a.motivo_retiro
      ) order by a.desde desc)
      from componentes_asignaciones a
      join unidades u on u.id = a.id_unidad
      where a.id_componente = p_id_componente
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function get_historial_componente(uuid) to authenticated;
