-- ==== Rutinas como grupo de tareas ====
-- Una rutina ahora tiene una lista de tareas asociadas en rutina_tareas.
-- guardar_rutina hace upsert transaccional de rutina+tareas, y cumplir_rutina_en_ot
-- vuelca esas tareas a una OT ya abierta sin crear una OT nueva.

create table if not exists rutina_tareas (
  id uuid primary key default gen_random_uuid(),
  id_rutina uuid not null references rutinas_mantenimiento(id) on delete cascade,
  orden int not null,
  descripcion text not null
);
create index if not exists idx_rutina_tareas_rutina on rutina_tareas(id_rutina);
alter table rutina_tareas enable row level security;

create policy "lectura_rutina_tareas" on rutina_tareas for select using (
  exists (select 1 from rutinas_mantenimiento r where r.id = rutina_tareas.id_rutina and r.empresa_id = empresa_actual())
);
grant select on rutina_tareas to authenticated;
-- Sin policy de insert/update/delete directo: todo pasa por guardar_rutina() para que la validacion no se pueda saltear (mismo patron que herramientas/ot_herramientas en el proyecto).

create or replace function guardar_rutina(
  p_id uuid default null,
  p_id_unidad uuid default null,
  p_descripcion text default null,
  p_tipo_trigger tipo_trigger_preventivo default null,
  p_intervalo numeric default null,
  p_tareas text[] default '{}'
)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_id_rutina uuid;
  v_tarea text;
  v_orden int := 0;
  v_tareas_limpias text[] := '{}';
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para gestionar rutinas de mantenimiento');
  end if;

  if p_id_unidad is null or p_descripcion is null or trim(p_descripcion) = '' or p_tipo_trigger is null or p_intervalo is null then
    return jsonb_build_object('ok', false, 'msg', 'Faltan campos obligatorios');
  end if;

  -- limpiar tareas vacias/blancas del array
  foreach v_tarea in array p_tareas loop
    if v_tarea is not null and trim(v_tarea) <> '' then
      v_tareas_limpias := array_append(v_tareas_limpias, trim(v_tarea));
    end if;
  end loop;

  if array_length(v_tareas_limpias, 1) is null or array_length(v_tareas_limpias, 1) = 0 then
    return jsonb_build_object('ok', false, 'msg', 'La rutina debe tener al menos una tarea');
  end if;

  if p_id is null then
    if not exists (select 1 from unidades where id = p_id_unidad and empresa_id = v_empresa) then
      return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
    end if;
    insert into rutinas_mantenimiento (empresa_id, id_unidad, descripcion, tipo_trigger, intervalo)
    values (v_empresa, p_id_unidad, trim(p_descripcion), p_tipo_trigger, p_intervalo)
    returning id into v_id_rutina;
  else
    update rutinas_mantenimiento
       set descripcion = trim(p_descripcion),
           tipo_trigger = p_tipo_trigger,
           intervalo = p_intervalo
     where id = p_id and empresa_id = v_empresa
     returning id into v_id_rutina;
    if v_id_rutina is null then
      return jsonb_build_object('ok', false, 'msg', 'Rutina no encontrada');
    end if;
  end if;

  delete from rutina_tareas where id_rutina = v_id_rutina;

  foreach v_tarea in array v_tareas_limpias loop
    v_orden := v_orden + 1;
    insert into rutina_tareas (id_rutina, orden, descripcion) values (v_id_rutina, v_orden, v_tarea);
  end loop;

  return jsonb_build_object('ok', true, 'id_rutina', v_id_rutina);
end;
$$;

grant execute on function guardar_rutina(uuid, uuid, text, tipo_trigger_preventivo, numeric, text[]) to authenticated;

create or replace function cumplir_rutina_en_ot(p_id_ot uuid, p_id_rutina uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_ot ot_cabecera%rowtype;
  v_rutina rutinas_mantenimiento%rowtype;
  v_unidad unidades%rowtype;
  v_orden int;
  v_tarea record;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  select * into v_ot from ot_cabecera where id = p_id_ot and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'OT no encontrada');
  end if;

  select * into v_rutina from rutinas_mantenimiento where id = p_id_rutina and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Rutina no encontrada');
  end if;

  if v_rutina.id_unidad <> v_ot.id_unidad then
    return jsonb_build_object('ok', false, 'msg', 'La rutina no corresponde a la unidad de esta OT');
  end if;

  select * into v_unidad from unidades where id = v_rutina.id_unidad;

  select coalesce(max(orden), 0) into v_orden from ot_tareas where id_ot = p_id_ot;

  for v_tarea in select descripcion from rutina_tareas where id_rutina = p_id_rutina order by orden loop
    v_orden := v_orden + 1;
    insert into ot_tareas (id_ot, orden, descripcion) values (p_id_ot, v_orden, v_tarea.descripcion);
  end loop;

  update rutinas_mantenimiento
     set km_hs_ultimo = case v_rutina.tipo_trigger
           when 'km' then coalesce(v_unidad.km_actuales, km_hs_ultimo)
           when 'hs' then coalesce(v_unidad.hs_actuales, km_hs_ultimo)
           else km_hs_ultimo end,
         fecha_ultimo = case when v_rutina.tipo_trigger = 'dias' then current_date else fecha_ultimo end
   where id = p_id_rutina;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function cumplir_rutina_en_ot(uuid, uuid) to authenticated;
