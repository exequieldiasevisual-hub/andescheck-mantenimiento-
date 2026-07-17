-- ==== Trazabilidad: qué tarea de una OT viene de qué rutina ====
-- Hasta ahora las tareas creadas al cumplir una rutina en una OT no
-- guardaban ningún vínculo hacia la rutina de origen. Se agrega la columna
-- y se completa al insertar, tanto si la rutina crea una OT nueva como si
-- se agrega a una OT ya existente.

alter table ot_tareas add column if not exists id_rutina_origen uuid references rutinas_mantenimiento(id);

create or replace function programar_cumplimiento_rutina(
  p_id_rutina uuid,
  p_prioridad text default 'Media',
  p_fecha_est_cierre timestamptz default null
)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_rutina rutinas_mantenimiento%rowtype;
  v_unidad unidades%rowtype;
  v_resultado jsonb;
  v_id_ot uuid;
  v_snapshot jsonb;
  v_orden int;
  v_tarea record;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para gestionar rutinas de mantenimiento');
  end if;

  select * into v_rutina from rutinas_mantenimiento where id = p_id_rutina and empresa_id = v_empresa for update;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Rutina no encontrada');
  end if;

  if exists (select 1 from rutina_cumplimientos where id_rutina = p_id_rutina and estado = 'Programada') then
    return jsonb_build_object('ok', false, 'msg', 'Ya hay un cumplimiento programado para esta rutina');
  end if;

  if p_fecha_est_cierre is null then
    return jsonb_build_object('ok', false, 'msg', 'La fecha estimada de cierre es obligatoria');
  end if;

  select * into v_unidad from unidades where id = v_rutina.id_unidad;

  v_resultado := crear_ot(v_rutina.id_unidad, 'Preventivo', v_rutina.descripcion, p_prioridad, p_fecha_est_cierre,
                           null, null, null, '{}', v_unidad.km_actuales, v_unidad.hs_actuales);
  if not (v_resultado->>'ok')::boolean then
    return v_resultado;
  end if;
  v_id_ot := (v_resultado->>'id_ot')::uuid;

  select coalesce(jsonb_agg(jsonb_build_object('descripcion', descripcion, 'id_catalogo', id_catalogo) order by orden), '[]'::jsonb)
    into v_snapshot
    from rutina_tareas where id_rutina = p_id_rutina;

  v_orden := 0;
  for v_tarea in select descripcion, id_catalogo from rutina_tareas where id_rutina = p_id_rutina order by orden loop
    v_orden := v_orden + 1;
    insert into ot_tareas (id_ot, orden, descripcion, id_catalogo, id_rutina_origen) values (v_id_ot, v_orden, v_tarea.descripcion, v_tarea.id_catalogo, p_id_rutina);
  end loop;

  insert into rutina_cumplimientos (id_rutina, id_ot, estado, origen, tareas_snapshot, usuario)
  values (p_id_rutina, v_id_ot, 'Programada', 'ot_nueva', v_snapshot, (select id from usuarios where auth_user_id = auth.uid()));

  return jsonb_build_object('ok', true, 'id_ot', v_id_ot);
end;
$$;

create or replace function cumplir_rutina_en_ot(p_id_ot uuid, p_id_rutina uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_ot ot_cabecera%rowtype;
  v_rutina rutinas_mantenimiento%rowtype;
  v_orden int;
  v_tarea record;
  v_snapshot jsonb;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  select * into v_ot from ot_cabecera where id = p_id_ot and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'OT no encontrada');
  end if;

  select * into v_rutina from rutinas_mantenimiento where id = p_id_rutina and empresa_id = v_empresa for update;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Rutina no encontrada');
  end if;

  if v_rutina.id_unidad <> v_ot.id_unidad then
    return jsonb_build_object('ok', false, 'msg', 'La rutina no corresponde a la unidad de esta OT');
  end if;

  if exists (select 1 from rutina_cumplimientos where id_rutina = p_id_rutina and estado = 'Programada') then
    return jsonb_build_object('ok', false, 'msg', 'Ya hay un cumplimiento programado para esta rutina');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('descripcion', descripcion, 'id_catalogo', id_catalogo) order by orden), '[]'::jsonb)
    into v_snapshot
    from rutina_tareas where id_rutina = p_id_rutina;

  select coalesce(max(orden), 0) into v_orden from ot_tareas where id_ot = p_id_ot;

  for v_tarea in select descripcion, id_catalogo from rutina_tareas where id_rutina = p_id_rutina order by orden loop
    v_orden := v_orden + 1;
    insert into ot_tareas (id_ot, orden, descripcion, id_catalogo, id_rutina_origen) values (p_id_ot, v_orden, v_tarea.descripcion, v_tarea.id_catalogo, p_id_rutina);
  end loop;

  insert into rutina_cumplimientos (id_rutina, id_ot, estado, origen, tareas_snapshot, usuario)
  values (p_id_rutina, p_id_ot, 'Programada', 'ot_existente', v_snapshot, (select id from usuarios where auth_user_id = auth.uid()));

  return jsonb_build_object('ok', true);
end;
$$;
