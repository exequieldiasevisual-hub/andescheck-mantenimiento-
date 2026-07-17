-- ==== Historial de cumplimientos de una rutina ====
-- rutina_cumplimientos ya guardaba CADA vez que se completó/anuló una
-- rutina, pero no había forma de verlo en la app, y tampoco guardaba a qué
-- km/hs/fecha DEBÍA hacerse (solo a cuánto se hizo realmente). Se agrega:
-- 1. objetivo_km_hs / objetivo_fecha, capturados al programar el cumplimiento
--    (el "debía realizarse a...").
-- 2. get_historial_cumplimientos_rutina(): expone el historial completo,
--    con el número de OT, para armar una pantalla de consulta.

alter table rutina_cumplimientos add column if not exists objetivo_km_hs numeric(12,2);
alter table rutina_cumplimientos add column if not exists objetivo_fecha date;

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
  v_objetivo_km_hs numeric(12,2);
  v_objetivo_fecha date;
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

  if v_rutina.tipo_trigger in ('km', 'hs') then
    v_objetivo_km_hs := v_rutina.km_hs_ultimo + v_rutina.intervalo;
  elsif v_rutina.tipo_trigger = 'dias' and v_rutina.fecha_ultimo is not null then
    v_objetivo_fecha := (v_rutina.fecha_ultimo + (v_rutina.intervalo || ' days')::interval)::date;
  end if;

  insert into rutina_cumplimientos (id_rutina, id_ot, estado, origen, tareas_snapshot, usuario, objetivo_km_hs, objetivo_fecha)
  values (p_id_rutina, v_id_ot, 'Programada', 'ot_nueva', v_snapshot, (select id from usuarios where auth_user_id = auth.uid()), v_objetivo_km_hs, v_objetivo_fecha);

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
  v_objetivo_km_hs numeric(12,2);
  v_objetivo_fecha date;
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

  if v_rutina.tipo_trigger in ('km', 'hs') then
    v_objetivo_km_hs := v_rutina.km_hs_ultimo + v_rutina.intervalo;
  elsif v_rutina.tipo_trigger = 'dias' and v_rutina.fecha_ultimo is not null then
    v_objetivo_fecha := (v_rutina.fecha_ultimo + (v_rutina.intervalo || ' days')::interval)::date;
  end if;

  insert into rutina_cumplimientos (id_rutina, id_ot, estado, origen, tareas_snapshot, usuario, objetivo_km_hs, objetivo_fecha)
  values (p_id_rutina, p_id_ot, 'Programada', 'ot_existente', v_snapshot, (select id from usuarios where auth_user_id = auth.uid()), v_objetivo_km_hs, v_objetivo_fecha);

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function get_historial_cumplimientos_rutina(p_id_rutina uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  if not exists (select 1 from rutinas_mantenimiento where id = p_id_rutina and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Rutina no encontrada');
  end if;

  return jsonb_build_object('ok', true, 'historial', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'estado', c.estado,
      'origen', c.origen,
      'creado_en', c.creado_en,
      'objetivo_km_hs', c.objetivo_km_hs,
      'objetivo_fecha', c.objetivo_fecha,
      'km_hs_valor', c.km_hs_valor,
      'fecha_valor', c.fecha_valor,
      'cumplido_en', c.cumplido_en,
      'anulado_en', c.anulado_en,
      'observaciones', c.observaciones,
      'id_ot', c.id_ot,
      'numero_ot', ot.numero_ot
    ) order by c.creado_en desc)
    from rutina_cumplimientos c
    left join ot_cabecera ot on ot.id = c.id_ot
    where c.id_rutina = p_id_rutina
  ), '[]'::jsonb));
end;
$$;

grant execute on function get_historial_cumplimientos_rutina(uuid) to authenticated;
