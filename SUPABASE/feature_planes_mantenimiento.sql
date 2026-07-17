-- Rutinas vinculadas a componentes que los siguen al trasladarse y planes reutilizables
-- por tipo de unidad, misión o componente, materializados como rutinas reales de la unidad.

alter table rutinas_mantenimiento add column if not exists id_componente uuid references componentes_mantenibles(id);
alter table rutinas_mantenimiento add column if not exists id_plan_origen uuid;

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

  update componentes_asignaciones
     set hasta = now(), motivo_retiro = coalesce(motivo_retiro, 'Trasladado a otra unidad')
   where id_componente = p_id_componente and hasta is null;

  insert into componentes_asignaciones (id_componente, id_unidad, usuario)
  values (p_id_componente, p_id_unidad, (select id from usuarios where auth_user_id = auth.uid()));

  -- las rutinas de este componente lo siguen: se actualiza la unidad de la rutina,
  -- el historial de cumplimientos ya generado (rutina_cumplimientos / OTs pasadas) no se toca,
  -- asi que las OT viejas siguen mostrando en que unidad estaba instalado en su momento.
  update rutinas_mantenimiento
     set id_unidad = p_id_unidad
   where id_componente = p_id_componente and activo = true;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function asignar_componente(uuid, uuid) to authenticated;

create table if not exists planes_mantenimiento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  descripcion text not null,
  tipo_trigger tipo_trigger_preventivo not null,
  intervalo numeric(12,2) not null,
  alcance text not null check (alcance in ('tipo_unidad','mision','componente_tipo')),
  alcance_valor text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create index if not exists idx_planes_mantenimiento_empresa on planes_mantenimiento(empresa_id);

create table if not exists plan_tareas (
  id uuid primary key default gen_random_uuid(),
  id_plan uuid not null references planes_mantenimiento(id) on delete cascade,
  orden int not null,
  id_catalogo uuid not null references catalogo_trabajos(id),
  descripcion text not null
);
create index if not exists idx_plan_tareas_plan on plan_tareas(id_plan);

alter table planes_mantenimiento enable row level security;
alter table plan_tareas enable row level security;

create policy "lectura_planes_mantenimiento" on planes_mantenimiento for select using (empresa_id = empresa_actual());
grant select on planes_mantenimiento to authenticated;

create policy "lectura_plan_tareas" on plan_tareas for select using (
  exists (select 1 from planes_mantenimiento p where p.id = plan_tareas.id_plan and p.empresa_id = empresa_actual())
);
grant select on plan_tareas to authenticated;
-- Sin policy de insert/update directo en ninguna de las 2: todo pasa por guardar_plan_mantenimiento.

create or replace function guardar_plan_mantenimiento(
  p_id uuid default null,
  p_descripcion text default null,
  p_tipo_trigger tipo_trigger_preventivo default null,
  p_intervalo numeric default null,
  p_alcance text default null,
  p_alcance_valor text default null,
  p_tareas jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_id_plan uuid;
  v_item jsonb;
  v_id_catalogo uuid;
  v_desc_catalogo text;
  v_orden int;
  v_ids_catalogo uuid[] := '{}';
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para gestionar planes de mantenimiento');
  end if;

  if p_descripcion is null or trim(p_descripcion) = '' or p_tipo_trigger is null or p_intervalo is null then
    return jsonb_build_object('ok', false, 'msg', 'Faltan campos obligatorios');
  end if;

  if p_intervalo <= 0 then
    return jsonb_build_object('ok', false, 'msg', 'El intervalo debe ser mayor a cero');
  end if;

  if p_alcance not in ('tipo_unidad','mision','componente_tipo') then
    return jsonb_build_object('ok', false, 'msg', 'Alcance inválido');
  end if;

  if p_alcance_valor is null or trim(p_alcance_valor) = '' then
    return jsonb_build_object('ok', false, 'msg', 'Falta indicar a qué tipo/misión aplica el plan');
  end if;

  if p_tareas is null or jsonb_typeof(p_tareas) <> 'array' or jsonb_array_length(p_tareas) = 0 then
    return jsonb_build_object('ok', false, 'msg', 'El plan debe tener al menos una tarea');
  end if;

  for v_item in select * from jsonb_array_elements(p_tareas) loop
    v_id_catalogo := (v_item->>'id_catalogo')::uuid;
    if v_id_catalogo = any(v_ids_catalogo) then
      return jsonb_build_object('ok', false, 'msg', 'Hay trabajos repetidos en la lista de tareas');
    end if;
    v_ids_catalogo := array_append(v_ids_catalogo, v_id_catalogo);
    if not exists (select 1 from catalogo_trabajos where id = v_id_catalogo and empresa_id = v_empresa and activo = true) then
      return jsonb_build_object('ok', false, 'msg', 'Uno de los trabajos seleccionados no existe en el catálogo');
    end if;
  end loop;

  if p_id is null then
    insert into planes_mantenimiento (empresa_id, descripcion, tipo_trigger, intervalo, alcance, alcance_valor)
    values (v_empresa, trim(p_descripcion), p_tipo_trigger, p_intervalo, p_alcance, trim(p_alcance_valor))
    returning id into v_id_plan;
  else
    update planes_mantenimiento
       set descripcion = trim(p_descripcion), tipo_trigger = p_tipo_trigger, intervalo = p_intervalo,
           alcance = p_alcance, alcance_valor = trim(p_alcance_valor)
     where id = p_id and empresa_id = v_empresa
     returning id into v_id_plan;

    if v_id_plan is null then
      return jsonb_build_object('ok', false, 'msg', 'Plan no encontrado');
    end if;
  end if;

  delete from plan_tareas where id_plan = v_id_plan;

  v_orden := 0;
  for v_item in select * from jsonb_array_elements(p_tareas) loop
    v_id_catalogo := (v_item->>'id_catalogo')::uuid;
    select descripcion into v_desc_catalogo from catalogo_trabajos where id = v_id_catalogo;
    v_orden := v_orden + 1;
    insert into plan_tareas (id_plan, orden, id_catalogo, descripcion) values (v_id_plan, v_orden, v_id_catalogo, v_desc_catalogo);
  end loop;

  return jsonb_build_object('ok', true, 'id_plan', v_id_plan);
end;
$$;

grant execute on function guardar_plan_mantenimiento(uuid, text, tipo_trigger_preventivo, numeric, text, text, jsonb) to authenticated;

create or replace function sugerir_planes_para_unidad(p_id_unidad uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_unidad unidades%rowtype;
begin
  select * into v_unidad from unidades where id = p_id_unidad and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  return jsonb_build_object(
    'ok', true,
    'planes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'descripcion', p.descripcion, 'alcance', p.alcance, 'alcance_valor', p.alcance_valor,
        'tipo_trigger', p.tipo_trigger, 'intervalo', p.intervalo
      ))
      from planes_mantenimiento p
      where p.empresa_id = v_empresa and p.activo = true
        and not exists (
          select 1 from rutinas_mantenimiento r
          where r.id_plan_origen = p.id and r.id_unidad = p_id_unidad and r.activo = true
        )
        and (
          (p.alcance = 'tipo_unidad' and p.alcance_valor = v_unidad.tipo)
          or (p.alcance = 'mision' and p.alcance_valor = v_unidad.tipo_mision)
          or (p.alcance = 'componente_tipo' and exists (
            select 1 from componentes_asignaciones ca
            join componentes_mantenibles c on c.id = ca.id_componente
            where ca.id_unidad = p_id_unidad and ca.hasta is null and c.tipo = p.alcance_valor and c.activo = true
          ))
        )
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function sugerir_planes_para_unidad(uuid) to authenticated;

create or replace function aplicar_plan_a_unidad(p_id_plan uuid, p_id_unidad uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_plan planes_mantenimiento%rowtype;
  v_unidad unidades%rowtype;
  v_id_rutina uuid;
  v_orden int;
  v_tarea record;
  v_componente record;
  v_creadas int := 0;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para gestionar rutinas de mantenimiento');
  end if;

  select * into v_plan from planes_mantenimiento where id = p_id_plan and empresa_id = v_empresa and activo = true;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Plan no encontrado');
  end if;

  select * into v_unidad from unidades where id = p_id_unidad and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  if v_plan.alcance = 'componente_tipo' then
    -- una rutina por cada componente de ese tipo actualmente instalado en la unidad
    for v_componente in
      select c.id from componentes_asignaciones ca
      join componentes_mantenibles c on c.id = ca.id_componente
      where ca.id_unidad = p_id_unidad and ca.hasta is null and c.tipo = v_plan.alcance_valor and c.activo = true
    loop
      insert into rutinas_mantenimiento (empresa_id, id_unidad, id_componente, id_plan_origen, descripcion, tipo_trigger, intervalo, km_hs_ultimo, fecha_ultimo)
      values (
        v_empresa, p_id_unidad, v_componente.id, p_id_plan, v_plan.descripcion, v_plan.tipo_trigger, v_plan.intervalo,
        case when v_plan.tipo_trigger in ('km','hs') then coalesce(v_unidad.km_actuales, v_unidad.hs_actuales) else null end,
        case when v_plan.tipo_trigger = 'dias' then current_date else null end
      )
      returning id into v_id_rutina;

      v_orden := 0;
      for v_tarea in select orden, id_catalogo, descripcion from plan_tareas where id_plan = p_id_plan order by orden loop
        v_orden := v_orden + 1;
        insert into rutina_tareas (id_rutina, orden, id_catalogo, descripcion) values (v_id_rutina, v_orden, v_tarea.id_catalogo, v_tarea.descripcion);
      end loop;

      v_creadas := v_creadas + 1;
    end loop;
  else
    insert into rutinas_mantenimiento (empresa_id, id_unidad, id_plan_origen, descripcion, tipo_trigger, intervalo, km_hs_ultimo, fecha_ultimo)
    values (
      v_empresa, p_id_unidad, p_id_plan, v_plan.descripcion, v_plan.tipo_trigger, v_plan.intervalo,
      case when v_plan.tipo_trigger in ('km','hs') then coalesce(v_unidad.km_actuales, v_unidad.hs_actuales) else null end,
      case when v_plan.tipo_trigger = 'dias' then current_date else null end
    )
    returning id into v_id_rutina;

    v_orden := 0;
    for v_tarea in select orden, id_catalogo, descripcion from plan_tareas where id_plan = p_id_plan order by orden loop
      v_orden := v_orden + 1;
      insert into rutina_tareas (id_rutina, orden, id_catalogo, descripcion) values (v_id_rutina, v_orden, v_tarea.id_catalogo, v_tarea.descripcion);
    end loop;

    v_creadas := 1;
  end if;

  return jsonb_build_object('ok', true, 'creadas', v_creadas);
end;
$$;

grant execute on function aplicar_plan_a_unidad(uuid, uuid) to authenticated;
