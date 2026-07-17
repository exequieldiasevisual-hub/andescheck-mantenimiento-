-- =====================================================================
-- Fix: crear_ot quedó con varias versiones superpuestas (9, 11 y 12
-- parámetros) de pasos anteriores donde le fuimos agregando km/hs y
-- observaciones — los DROP con firma exacta no coincidieron con lo que
-- había en la base, así que las viejas nunca se borraron. Postgres no
-- puede elegir cuál usar → "Could not choose the best candidate function".
--
-- Este bloque borra TODAS las versiones de crear_ot sin importar su
-- firma exacta (dinámico, a prueba de este desorden), y después crea
-- una sola versión limpia y definitiva.
-- =====================================================================

do $$
declare
  r record;
begin
  for r in
    select oid::regprocedure as sig
    from pg_proc
    where proname = 'crear_ot' and pronamespace = 'public'::regnamespace
  loop
    execute format('drop function if exists %s', r.sig);
  end loop;
end $$;

create function crear_ot(
  p_id_unidad uuid,
  p_tipo text,
  p_descripcion text,
  p_prioridad text default null,
  p_fecha_est_cierre timestamptz default null,
  p_id_secuencia uuid default null,
  p_id_novedad_origen uuid default null,
  p_proveedor uuid default null,
  p_tecnicos_asignados uuid[] default '{}',
  p_km_actuales numeric default null,
  p_hs_actuales numeric default null,
  p_observaciones text default null
)
returns jsonb language plpgsql security definer as $$
declare
  v_rol rol_usuario;
  v_empresa uuid;
  v_id_usuario uuid;
  v_id_ot uuid;
  v_tarea record;
  v_repuesto record;
  v_checklist jsonb := '[]'::jsonb;
begin
  v_rol := rol_actual();
  v_empresa := empresa_actual();

  if v_rol not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para crear OT');
  end if;

  if not exists (select 1 from unidades where id = p_id_unidad and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  if p_id_secuencia is not null
     and not exists (select 1 from secuencias where id = p_id_secuencia and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Secuencia no encontrada');
  end if;

  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();

  if p_km_actuales is not null or p_hs_actuales is not null then
    update unidades
       set km_actuales = coalesce(p_km_actuales, km_actuales),
           hs_actuales = coalesce(p_hs_actuales, hs_actuales)
     where id = p_id_unidad;
  end if;

  if p_id_secuencia is not null then
    select coalesce(jsonb_agg(item || jsonb_build_object('checked', false)), '[]'::jsonb)
      into v_checklist
      from (select jsonb_array_elements(checklist_items) as item from secuencias where id = p_id_secuencia) s;
  end if;

  insert into ot_cabecera (empresa_id, numero_ot, id_unidad, tipo, descripcion, prioridad, fecha_est_cierre,
                           id_secuencia, id_novedad_origen, proveedor, tecnicos_asignados, supervisor,
                           checklist_completado, observaciones)
  values (v_empresa, generar_numero_ot(v_empresa), p_id_unidad, p_tipo, p_descripcion, p_prioridad, p_fecha_est_cierre,
          p_id_secuencia, p_id_novedad_origen, p_proveedor, p_tecnicos_asignados, v_id_usuario,
          v_checklist, p_observaciones)
  returning id into v_id_ot;

  if p_id_secuencia is not null then
    for v_tarea in
      select orden, descripcion from secuencias_tareas
       where id_secuencia = p_id_secuencia order by orden
    loop
      insert into ot_tareas (id_ot, orden, descripcion)
      values (v_id_ot, v_tarea.orden, v_tarea.descripcion);
    end loop;

    for v_repuesto in
      select id_repuesto, cantidad from secuencias_repuestos where id_secuencia = p_id_secuencia
    loop
      update stock set stock_comprometido = stock_comprometido + v_repuesto.cantidad
       where id = v_repuesto.id_repuesto;
    end loop;
  end if;

  if p_id_novedad_origen is not null then
    update novedades
       set estado = 'Derivada_a_OT', id_ot_vinculada = v_id_ot
     where id = p_id_novedad_origen and empresa_id = v_empresa;
  end if;

  return jsonb_build_object('ok', true, 'id_ot', v_id_ot);
end;
$$;

grant execute on function crear_ot(uuid, text, text, text, timestamptz, uuid, uuid, uuid, uuid[], numeric, numeric, text) to authenticated;
