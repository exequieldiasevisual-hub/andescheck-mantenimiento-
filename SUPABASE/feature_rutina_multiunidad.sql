-- ==== Rutinas plantilla — aplicar una rutina a varias unidades ====
-- Crea la misma rutina (con sus tareas) para N unidades en una transaccion.

create or replace function aplicar_rutina_a_unidades(
  p_descripcion text,
  p_tipo_trigger tipo_trigger_preventivo,
  p_intervalo numeric,
  p_tareas text[],
  p_unidades uuid[]
)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_id_unidad uuid;
  v_id_rutina uuid;
  v_tarea text;
  v_orden int;
  v_tareas_limpias text[] := '{}';
  v_creadas int := 0;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para gestionar rutinas de mantenimiento');
  end if;

  if p_descripcion is null or trim(p_descripcion) = '' or p_tipo_trigger is null or p_intervalo is null then
    return jsonb_build_object('ok', false, 'msg', 'Faltan campos obligatorios');
  end if;

  if p_unidades is null or array_length(p_unidades, 1) is null then
    return jsonb_build_object('ok', false, 'msg', 'Seleccioná al menos una unidad');
  end if;

  foreach v_tarea in array p_tareas loop
    if v_tarea is not null and trim(v_tarea) <> '' then
      v_tareas_limpias := array_append(v_tareas_limpias, trim(v_tarea));
    end if;
  end loop;

  if array_length(v_tareas_limpias, 1) is null then
    return jsonb_build_object('ok', false, 'msg', 'La rutina debe tener al menos una tarea');
  end if;

  foreach v_id_unidad in array p_unidades loop
    if not exists (select 1 from unidades where id = v_id_unidad and empresa_id = v_empresa and activo = true) then
      continue;
    end if;

    insert into rutinas_mantenimiento (empresa_id, id_unidad, descripcion, tipo_trigger, intervalo)
    values (v_empresa, v_id_unidad, trim(p_descripcion), p_tipo_trigger, p_intervalo)
    returning id into v_id_rutina;

    v_orden := 0;
    foreach v_tarea in array v_tareas_limpias loop
      v_orden := v_orden + 1;
      insert into rutina_tareas (id_rutina, orden, descripcion) values (v_id_rutina, v_orden, v_tarea);
    end loop;

    v_creadas := v_creadas + 1;
  end loop;

  return jsonb_build_object('ok', true, 'creadas', v_creadas);
end;
$$;

grant execute on function aplicar_rutina_a_unidades(text, tipo_trigger_preventivo, numeric, text[], uuid[]) to authenticated;
