-- ==== Planes de Mantenimiento v2: niveles + auditoría + cascada en caliente ====
-- Reemplaza el modelo "1 plan = 1 intervalo" por "1 plan = varios niveles"
-- (M1/M2/M3/etc, cada uno con su propio trigger+intervalo+tareas), con
-- historial de cambios y propagación en caliente a las unidades que ya
-- tienen rutinas generadas desde ese nivel.
--
-- Se borra toda la data de prueba de planes_mantenimiento — confirmado con
-- el usuario que no hay nada real cargado ahí todavía.

delete from plan_tareas;
delete from rutina_tareas where id_rutina in (select id from rutinas_mantenimiento where id_plan_origen is not null);
delete from rutina_cumplimientos where id_rutina in (select id from rutinas_mantenimiento where id_plan_origen is not null);
delete from rutinas_mantenimiento where id_plan_origen is not null;
delete from planes_mantenimiento;

-- El intervalo/tipo_trigger ya no viven en el plan — cada nivel tiene el suyo.
alter table planes_mantenimiento drop column if exists tipo_trigger;
alter table planes_mantenimiento drop column if exists intervalo;

create table if not exists plan_niveles (
  id uuid primary key default gen_random_uuid(),
  id_plan uuid not null references planes_mantenimiento(id) on delete cascade,
  nombre text not null,
  tipo_trigger tipo_trigger_preventivo not null,
  intervalo numeric(12,2) not null,
  orden int not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create index if not exists idx_plan_niveles_plan on plan_niveles(id_plan);

alter table plan_niveles enable row level security;
create policy "lectura_plan_niveles" on plan_niveles for select using (
  exists (select 1 from planes_mantenimiento p where p.id = plan_niveles.id_plan and p.empresa_id = empresa_actual())
);
grant select on plan_niveles to authenticated;

-- plan_tareas ahora cuelga de un nivel, no directo del plan.
alter table plan_tareas add column if not exists id_nivel uuid references plan_niveles(id) on delete cascade;
alter table plan_tareas alter column id_plan drop not null;

create table if not exists plan_historial (
  id uuid primary key default gen_random_uuid(),
  id_plan uuid not null references planes_mantenimiento(id) on delete cascade,
  id_nivel uuid references plan_niveles(id),
  campo text not null,
  valor_anterior text,
  valor_nuevo text,
  usuario uuid references usuarios(id),
  fecha timestamptz not null default now()
);
create index if not exists idx_plan_historial_plan on plan_historial(id_plan);

alter table plan_historial enable row level security;
create policy "lectura_plan_historial" on plan_historial for select using (
  exists (select 1 from planes_mantenimiento p where p.id = plan_historial.id_plan and p.empresa_id = empresa_actual())
);
grant select on plan_historial to authenticated;

-- Cada rutina materializada sabe de qué nivel específico del plan viene
-- (antes solo sabía de qué plan, no de qué nivel dentro de él).
alter table rutinas_mantenimiento add column if not exists id_nivel_origen uuid references plan_niveles(id);

-- ---------------------------------------------------------------------
-- guardar_plan_mantenimiento: ahora solo gestiona el encabezado del plan
-- (descripción + alcance). Los niveles se manejan aparte.
-- IMPORTANTE: la firma vieja tenía 7 parámetros (con tipo_trigger, intervalo
-- y tareas); hay que borrarla explícitamente o queda como una función
-- ambigua superpuesta (mismo bug que ya pasó con crear_ot).
-- ---------------------------------------------------------------------
drop function if exists guardar_plan_mantenimiento(uuid, text, tipo_trigger_preventivo, numeric, text, text, jsonb);

create or replace function guardar_plan_mantenimiento(
  p_id uuid default null,
  p_descripcion text default null,
  p_alcance text default null,
  p_alcance_valor text default null
)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_id_plan uuid;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para gestionar planes de mantenimiento');
  end if;

  if p_descripcion is null or trim(p_descripcion) = '' then
    return jsonb_build_object('ok', false, 'msg', 'Faltan campos obligatorios');
  end if;

  if p_alcance not in ('tipo_unidad','mision','componente_tipo') then
    return jsonb_build_object('ok', false, 'msg', 'Alcance inválido');
  end if;

  if p_alcance_valor is null or trim(p_alcance_valor) = '' then
    return jsonb_build_object('ok', false, 'msg', 'Falta indicar a qué tipo/misión aplica el plan');
  end if;

  if p_id is null then
    insert into planes_mantenimiento (empresa_id, descripcion, alcance, alcance_valor)
    values (v_empresa, trim(p_descripcion), p_alcance, trim(p_alcance_valor))
    returning id into v_id_plan;
  else
    update planes_mantenimiento
       set descripcion = trim(p_descripcion), alcance = p_alcance, alcance_valor = trim(p_alcance_valor)
     where id = p_id and empresa_id = v_empresa
     returning id into v_id_plan;

    if v_id_plan is null then
      return jsonb_build_object('ok', false, 'msg', 'Plan no encontrado');
    end if;
  end if;

  return jsonb_build_object('ok', true, 'id_plan', v_id_plan);
end;
$$;

grant execute on function guardar_plan_mantenimiento(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- guardar_nivel_plan: crea o edita un nivel dentro de un plan. Si edita uno
-- que ya tiene rutinas activas materializadas, propaga el cambio de
-- inmediato a esas rutinas (intervalo/tipo_trigger/tareas), sin tocar el
-- progreso ya acumulado (km_hs_ultimo/fecha_ultimo). Todo cambio queda en
-- plan_historial.
-- ---------------------------------------------------------------------
create or replace function guardar_nivel_plan(
  p_id uuid default null,
  p_id_plan uuid default null,
  p_nombre text default null,
  p_tipo_trigger tipo_trigger_preventivo default null,
  p_intervalo numeric default null,
  p_tareas jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_plan planes_mantenimiento%rowtype;
  v_nivel_anterior plan_niveles%rowtype;
  v_id_nivel uuid;
  v_id_usuario uuid;
  v_item jsonb;
  v_id_catalogo uuid;
  v_desc_catalogo text;
  v_orden int;
  v_ids_catalogo uuid[] := '{}';
  v_tareas_desc_anterior text;
  v_tareas_desc_nueva text;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para gestionar planes de mantenimiento');
  end if;

  if p_nombre is null or trim(p_nombre) = '' or p_tipo_trigger is null or p_intervalo is null then
    return jsonb_build_object('ok', false, 'msg', 'Faltan campos obligatorios');
  end if;

  if p_intervalo <= 0 then
    return jsonb_build_object('ok', false, 'msg', 'El intervalo debe ser mayor a cero');
  end if;

  if p_tareas is null or jsonb_typeof(p_tareas) <> 'array' or jsonb_array_length(p_tareas) = 0 then
    return jsonb_build_object('ok', false, 'msg', 'El nivel debe tener al menos una tarea');
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

  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();

  if p_id is null then
    select * into v_plan from planes_mantenimiento where id = p_id_plan and empresa_id = v_empresa;
    if not found then
      return jsonb_build_object('ok', false, 'msg', 'Plan no encontrado');
    end if;

    select coalesce(max(orden), 0) + 1 into v_orden from plan_niveles where id_plan = p_id_plan;

    insert into plan_niveles (id_plan, nombre, tipo_trigger, intervalo, orden)
    values (p_id_plan, trim(p_nombre), p_tipo_trigger, p_intervalo, v_orden)
    returning id into v_id_nivel;

    insert into plan_historial (id_plan, id_nivel, campo, valor_anterior, valor_nuevo, usuario)
    values (p_id_plan, v_id_nivel, 'nivel_creado', null, trim(p_nombre) || ' — ' || p_intervalo || ' ' || p_tipo_trigger, v_id_usuario);
  else
    select * into v_nivel_anterior from plan_niveles where id = p_id;
    if not found then
      return jsonb_build_object('ok', false, 'msg', 'Nivel no encontrado');
    end if;

    select p.* into v_plan from planes_mantenimiento p where p.id = v_nivel_anterior.id_plan and p.empresa_id = v_empresa;
    if not found then
      return jsonb_build_object('ok', false, 'msg', 'Plan no encontrado');
    end if;

    v_id_nivel := p_id;

    if v_nivel_anterior.nombre <> trim(p_nombre) then
      insert into plan_historial (id_plan, id_nivel, campo, valor_anterior, valor_nuevo, usuario)
      values (v_plan.id, v_id_nivel, 'nombre', v_nivel_anterior.nombre, trim(p_nombre), v_id_usuario);
    end if;
    if v_nivel_anterior.tipo_trigger <> p_tipo_trigger or v_nivel_anterior.intervalo <> p_intervalo then
      insert into plan_historial (id_plan, id_nivel, campo, valor_anterior, valor_nuevo, usuario)
      values (v_plan.id, v_id_nivel, 'intervalo',
              v_nivel_anterior.intervalo || ' ' || v_nivel_anterior.tipo_trigger,
              p_intervalo || ' ' || p_tipo_trigger, v_id_usuario);
    end if;

    select string_agg(descripcion, ', ' order by orden) into v_tareas_desc_anterior from plan_tareas where id_nivel = p_id;

    update plan_niveles
       set nombre = trim(p_nombre), tipo_trigger = p_tipo_trigger, intervalo = p_intervalo
     where id = p_id;
  end if;

  delete from plan_tareas where id_nivel = v_id_nivel;

  v_orden := 0;
  for v_item in select * from jsonb_array_elements(p_tareas) loop
    v_id_catalogo := (v_item->>'id_catalogo')::uuid;
    select descripcion into v_desc_catalogo from catalogo_trabajos where id = v_id_catalogo;
    v_orden := v_orden + 1;
    insert into plan_tareas (id_nivel, orden, id_catalogo, descripcion) values (v_id_nivel, v_orden, v_id_catalogo, v_desc_catalogo);
  end loop;

  if p_id is not null then
    select string_agg(descripcion, ', ' order by orden) into v_tareas_desc_nueva from plan_tareas where id_nivel = v_id_nivel;
    if coalesce(v_tareas_desc_anterior, '') <> coalesce(v_tareas_desc_nueva, '') then
      insert into plan_historial (id_plan, id_nivel, campo, valor_anterior, valor_nuevo, usuario)
      values (v_plan.id, v_id_nivel, 'tareas', v_tareas_desc_anterior, v_tareas_desc_nueva, v_id_usuario);
    end if;

    -- Cascada en caliente: todas las rutinas activas que ya vienen de este
    -- nivel se actualizan ya mismo (intervalo/trigger/tareas), sin tocar
    -- km_hs_ultimo/fecha_ultimo (el progreso ya recorrido no se pierde).
    update rutinas_mantenimiento
       set tipo_trigger = p_tipo_trigger, intervalo = p_intervalo, descripcion = v_plan.descripcion || ' — ' || trim(p_nombre)
     where id_nivel_origen = v_id_nivel and activo = true;

    delete from rutina_tareas where id_rutina in (
      select id from rutinas_mantenimiento where id_nivel_origen = v_id_nivel and activo = true
    );

    insert into rutina_tareas (id_rutina, orden, id_catalogo, descripcion)
    select r.id, pt.orden, pt.id_catalogo, pt.descripcion
    from rutinas_mantenimiento r
    cross join plan_tareas pt
    where r.id_nivel_origen = v_id_nivel and r.activo = true and pt.id_nivel = v_id_nivel;
  end if;

  return jsonb_build_object('ok', true, 'id_nivel', v_id_nivel);
end;
$$;

grant execute on function guardar_nivel_plan(uuid, uuid, text, tipo_trigger_preventivo, numeric, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- aplicar_plan_a_unidad: ahora crea UNA rutina POR CADA NIVEL del plan
-- (antes era una sola rutina por plan). Salta los niveles que la unidad
-- ya tiene activos.
-- ---------------------------------------------------------------------
create or replace function aplicar_plan_a_unidad(p_id_plan uuid, p_id_unidad uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_plan planes_mantenimiento%rowtype;
  v_unidad unidades%rowtype;
  v_nivel record;
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

  for v_nivel in select * from plan_niveles where id_plan = p_id_plan and activo = true order by orden loop
    if exists (select 1 from rutinas_mantenimiento where id_nivel_origen = v_nivel.id and id_unidad = p_id_unidad and activo = true) then
      continue;
    end if;

    if v_plan.alcance = 'componente_tipo' then
      for v_componente in
        select c.id from componentes_asignaciones ca
        join componentes_mantenibles c on c.id = ca.id_componente
        where ca.id_unidad = p_id_unidad and ca.hasta is null and c.tipo = v_plan.alcance_valor and c.activo = true
      loop
        insert into rutinas_mantenimiento (empresa_id, id_unidad, id_componente, id_plan_origen, id_nivel_origen, descripcion, tipo_trigger, intervalo, km_hs_ultimo, fecha_ultimo)
        values (
          v_empresa, p_id_unidad, v_componente.id, p_id_plan, v_nivel.id, v_plan.descripcion || ' — ' || v_nivel.nombre, v_nivel.tipo_trigger, v_nivel.intervalo,
          case when v_nivel.tipo_trigger in ('km','hs') then coalesce(v_unidad.km_actuales, v_unidad.hs_actuales) else null end,
          case when v_nivel.tipo_trigger = 'dias' then current_date else null end
        )
        returning id into v_id_rutina;

        v_orden := 0;
        for v_tarea in select orden, id_catalogo, descripcion from plan_tareas where id_nivel = v_nivel.id order by orden loop
          v_orden := v_orden + 1;
          insert into rutina_tareas (id_rutina, orden, id_catalogo, descripcion) values (v_id_rutina, v_orden, v_tarea.id_catalogo, v_tarea.descripcion);
        end loop;

        v_creadas := v_creadas + 1;
      end loop;
    else
      insert into rutinas_mantenimiento (empresa_id, id_unidad, id_plan_origen, id_nivel_origen, descripcion, tipo_trigger, intervalo, km_hs_ultimo, fecha_ultimo)
      values (
        v_empresa, p_id_unidad, p_id_plan, v_nivel.id, v_plan.descripcion || ' — ' || v_nivel.nombre, v_nivel.tipo_trigger, v_nivel.intervalo,
        case when v_nivel.tipo_trigger in ('km','hs') then coalesce(v_unidad.km_actuales, v_unidad.hs_actuales) else null end,
        case when v_nivel.tipo_trigger = 'dias' then current_date else null end
      )
      returning id into v_id_rutina;

      v_orden := 0;
      for v_tarea in select orden, id_catalogo, descripcion from plan_tareas where id_nivel = v_nivel.id order by orden loop
        v_orden := v_orden + 1;
        insert into rutina_tareas (id_rutina, orden, id_catalogo, descripcion) values (v_id_rutina, v_orden, v_tarea.id_catalogo, v_tarea.descripcion);
      end loop;

      v_creadas := v_creadas + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'creadas', v_creadas);
end;
$$;

grant execute on function aplicar_plan_a_unidad(uuid, uuid) to authenticated;

-- sugerir_planes_para_unidad: con el modelo de niveles, "ya lo tiene" pasa a
-- ser "tiene TODOS los niveles activos del plan" — si falta alguno (plan
-- aplicado parcialmente, o un nivel nuevo agregado después), el plan se
-- sigue sugiriendo.
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
        'id', p.id, 'descripcion', p.descripcion, 'alcance', p.alcance, 'alcance_valor', p.alcance_valor
      ))
      from planes_mantenimiento p
      where p.empresa_id = v_empresa and p.activo = true
        and exists (select 1 from plan_niveles pn where pn.id_plan = p.id and pn.activo = true)
        and exists (
          select 1 from plan_niveles pn
          where pn.id_plan = p.id and pn.activo = true
            and not exists (
              select 1 from rutinas_mantenimiento r
              where r.id_nivel_origen = pn.id and r.id_unidad = p_id_unidad and r.activo = true
            )
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

create or replace function get_historial_plan(p_id_plan uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  if not exists (select 1 from planes_mantenimiento where id = p_id_plan and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Plan no encontrado');
  end if;

  return jsonb_build_object('ok', true, 'historial', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', h.id,
      'id_nivel', h.id_nivel,
      'nivel_nombre', n.nombre,
      'campo', h.campo,
      'valor_anterior', h.valor_anterior,
      'valor_nuevo', h.valor_nuevo,
      'usuario_nombre', u.nombre,
      'fecha', h.fecha
    ) order by h.fecha desc)
    from plan_historial h
    left join plan_niveles n on n.id = h.id_nivel
    left join usuarios u on u.id = h.usuario
    where h.id_plan = p_id_plan
  ), '[]'::jsonb));
end;
$$;

grant execute on function get_historial_plan(uuid) to authenticated;

-- aplicar_plan_a_todas_las_unidades: ya NO filtra unidades que "ya tienen
-- algo" del plan a nivel plan completo (eso dejaba afuera unidades con
-- niveles aplicados parcialmente) — recorre TODAS las unidades que matchean
-- el alcance y deja que aplicar_plan_a_unidad se encargue de saltar,
-- nivel por nivel, lo que ya existe.
create or replace function aplicar_plan_a_todas_las_unidades(p_id_plan uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_plan planes_mantenimiento%rowtype;
  v_unidad record;
  v_resultado jsonb;
  v_creadas int := 0;
  v_afectadas int := 0;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para gestionar rutinas de mantenimiento');
  end if;

  select * into v_plan from planes_mantenimiento where id = p_id_plan and empresa_id = v_empresa and activo = true;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Plan no encontrado');
  end if;

  for v_unidad in
    select u.id from unidades u
    where u.empresa_id = v_empresa and u.activo = true
      and (
        (v_plan.alcance = 'tipo_unidad' and u.tipo = v_plan.alcance_valor)
        or (v_plan.alcance = 'mision' and u.tipo_mision = v_plan.alcance_valor)
        or (v_plan.alcance = 'componente_tipo' and exists (
          select 1 from componentes_asignaciones ca
          join componentes_mantenibles c on c.id = ca.id_componente
          where ca.id_unidad = u.id and ca.hasta is null and c.tipo = v_plan.alcance_valor and c.activo = true
        ))
      )
  loop
    v_resultado := aplicar_plan_a_unidad(p_id_plan, v_unidad.id);
    if (v_resultado->>'ok')::boolean then
      v_creadas := v_creadas + coalesce((v_resultado->>'creadas')::int, 0);
      v_afectadas := v_afectadas + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'creadas', v_creadas, 'unidades_recorridas', v_afectadas);
end;
$$;

grant execute on function aplicar_plan_a_todas_las_unidades(uuid) to authenticated;
