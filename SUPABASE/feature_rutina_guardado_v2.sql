-- Rutinas de mantenimiento v2:
-- tareas vinculadas al catalogo real via jsonb, base inicial automatica desde la unidad,
-- validacion de intervalo, alta masiva con reporte detallado de omitidas,
-- bloqueo de edicion si hay cumplimiento programado en curso.

drop function if exists guardar_rutina(uuid, uuid, text, tipo_trigger_preventivo, numeric, text[]);

alter table rutinas_mantenimiento add column if not exists editado_por uuid references usuarios(id);
alter table rutinas_mantenimiento add column if not exists editado_en timestamptz;

create or replace function guardar_rutina(
  p_id uuid default null,
  p_id_unidad uuid default null,
  p_descripcion text default null,
  p_tipo_trigger tipo_trigger_preventivo default null,
  p_intervalo numeric default null,
  p_tareas jsonb default '[]'::jsonb  -- array de { "id_catalogo": uuid }
)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_id_rutina uuid;
  v_item jsonb;
  v_id_catalogo uuid;
  v_desc_catalogo text;
  v_orden int;
  v_ids_catalogo uuid[] := '{}';
  v_rutina_actual rutinas_mantenimiento%rowtype;
  v_unidad unidades%rowtype;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para gestionar rutinas de mantenimiento');
  end if;

  if p_id_unidad is null or p_descripcion is null or trim(p_descripcion) = '' or p_tipo_trigger is null or p_intervalo is null then
    return jsonb_build_object('ok', false, 'msg', 'Faltan campos obligatorios');
  end if;

  if p_intervalo <= 0 then
    return jsonb_build_object('ok', false, 'msg', 'El intervalo debe ser mayor a cero');
  end if;

  if p_tipo_trigger = 'dias' and p_intervalo <> floor(p_intervalo) then
    return jsonb_build_object('ok', false, 'msg', 'El intervalo en días debe ser un número entero');
  end if;

  if p_tareas is null or jsonb_typeof(p_tareas) <> 'array' or jsonb_array_length(p_tareas) = 0 then
    return jsonb_build_object('ok', false, 'msg', 'La rutina debe tener al menos una tarea');
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
    select * into v_unidad from unidades where id = p_id_unidad and empresa_id = v_empresa;
    if not found then
      return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
    end if;

    insert into rutinas_mantenimiento (empresa_id, id_unidad, descripcion, tipo_trigger, intervalo, km_hs_ultimo, fecha_ultimo)
    values (
      v_empresa, p_id_unidad, trim(p_descripcion), p_tipo_trigger, p_intervalo,
      case when p_tipo_trigger in ('km','hs') then coalesce(v_unidad.km_actuales, v_unidad.hs_actuales) else null end,
      case when p_tipo_trigger = 'dias' then current_date else null end
    )
    returning id into v_id_rutina;
  else
    select * into v_rutina_actual from rutinas_mantenimiento where id = p_id and empresa_id = v_empresa for update;
    if not found then
      return jsonb_build_object('ok', false, 'msg', 'Rutina no encontrada');
    end if;

    if exists (select 1 from rutina_cumplimientos where id_rutina = p_id and estado = 'Programada') then
      return jsonb_build_object('ok', false, 'msg', 'No se puede editar: hay un cumplimiento programado en curso para esta rutina');
    end if;

    select * into v_unidad from unidades where id = v_rutina_actual.id_unidad;

    update rutinas_mantenimiento
       set descripcion = trim(p_descripcion),
           tipo_trigger = p_tipo_trigger,
           intervalo = p_intervalo,
           -- si cambia el tipo de disparador, la base anterior queda incompatible:
           -- se reinicia desde el valor actual de la unidad, mismo criterio que al crear.
           km_hs_ultimo = case
             when p_tipo_trigger <> v_rutina_actual.tipo_trigger then
               case when p_tipo_trigger in ('km','hs') then coalesce(v_unidad.km_actuales, v_unidad.hs_actuales) else null end
             else km_hs_ultimo
           end,
           fecha_ultimo = case
             when p_tipo_trigger <> v_rutina_actual.tipo_trigger then
               case when p_tipo_trigger = 'dias' then current_date else null end
             else fecha_ultimo
           end,
           editado_por = (select id from usuarios where auth_user_id = auth.uid()),
           editado_en = now()
     where id = p_id
     returning id into v_id_rutina;
  end if;

  delete from rutina_tareas where id_rutina = v_id_rutina;

  v_orden := 0;
  for v_item in select * from jsonb_array_elements(p_tareas) loop
    v_id_catalogo := (v_item->>'id_catalogo')::uuid;
    select descripcion into v_desc_catalogo from catalogo_trabajos where id = v_id_catalogo;
    v_orden := v_orden + 1;
    insert into rutina_tareas (id_rutina, orden, descripcion, id_catalogo) values (v_id_rutina, v_orden, v_desc_catalogo, v_id_catalogo);
  end loop;

  return jsonb_build_object('ok', true, 'id_rutina', v_id_rutina);
end;
$$;

grant execute on function guardar_rutina(uuid, uuid, text, tipo_trigger_preventivo, numeric, jsonb) to authenticated;

drop function if exists aplicar_rutina_a_unidades(text, tipo_trigger_preventivo, numeric, text[], uuid[]);

create or replace function aplicar_rutina_a_unidades(
  p_descripcion text,
  p_tipo_trigger tipo_trigger_preventivo,
  p_intervalo numeric,
  p_tareas jsonb,
  p_unidades uuid[]
)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_id_unidad uuid;
  v_id_rutina uuid;
  v_item jsonb;
  v_id_catalogo uuid;
  v_desc_catalogo text;
  v_orden int;
  v_ids_catalogo uuid[] := '{}';
  v_unidad unidades%rowtype;
  v_creadas int := 0;
  v_omitidas jsonb := '[]'::jsonb;
  v_unidades_unicas uuid[];
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para gestionar rutinas de mantenimiento');
  end if;

  if p_descripcion is null or trim(p_descripcion) = '' or p_tipo_trigger is null or p_intervalo is null then
    return jsonb_build_object('ok', false, 'msg', 'Faltan campos obligatorios');
  end if;

  if p_intervalo <= 0 then
    return jsonb_build_object('ok', false, 'msg', 'El intervalo debe ser mayor a cero');
  end if;

  if p_tipo_trigger = 'dias' and p_intervalo <> floor(p_intervalo) then
    return jsonb_build_object('ok', false, 'msg', 'El intervalo en días debe ser un número entero');
  end if;

  if p_unidades is null or array_length(p_unidades, 1) is null then
    return jsonb_build_object('ok', false, 'msg', 'Seleccioná al menos una unidad');
  end if;

  if p_tareas is null or jsonb_typeof(p_tareas) <> 'array' or jsonb_array_length(p_tareas) = 0 then
    return jsonb_build_object('ok', false, 'msg', 'La rutina debe tener al menos una tarea');
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

  -- de-duplicar unidades repetidas en la seleccion (evita crear la misma rutina 2 veces para la misma unidad)
  select array_agg(distinct x) into v_unidades_unicas from unnest(p_unidades) as x;

  foreach v_id_unidad in array v_unidades_unicas loop
    select * into v_unidad from unidades where id = v_id_unidad and empresa_id = v_empresa and activo = true;
    if not found then
      v_omitidas := v_omitidas || jsonb_build_object('id_unidad', v_id_unidad, 'motivo', 'Unidad no encontrada o inactiva');
      continue;
    end if;

    insert into rutinas_mantenimiento (empresa_id, id_unidad, descripcion, tipo_trigger, intervalo, km_hs_ultimo, fecha_ultimo)
    values (
      v_empresa, v_id_unidad, trim(p_descripcion), p_tipo_trigger, p_intervalo,
      case when p_tipo_trigger in ('km','hs') then coalesce(v_unidad.km_actuales, v_unidad.hs_actuales) else null end,
      case when p_tipo_trigger = 'dias' then current_date else null end
    )
    returning id into v_id_rutina;

    v_orden := 0;
    for v_item in select * from jsonb_array_elements(p_tareas) loop
      v_id_catalogo := (v_item->>'id_catalogo')::uuid;
      select descripcion into v_desc_catalogo from catalogo_trabajos where id = v_id_catalogo;
      v_orden := v_orden + 1;
      insert into rutina_tareas (id_rutina, orden, descripcion, id_catalogo) values (v_id_rutina, v_orden, v_desc_catalogo, v_id_catalogo);
    end loop;

    v_creadas := v_creadas + 1;
  end loop;

  return jsonb_build_object('ok', true, 'creadas', v_creadas, 'omitidas', v_omitidas);
end;
$$;

grant execute on function aplicar_rutina_a_unidades(text, tipo_trigger_preventivo, numeric, jsonb, uuid[]) to authenticated;
