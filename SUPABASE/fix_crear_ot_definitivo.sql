-- Version definitiva y unica de crear_ot: elimina overloads duplicados y agrega validaciones de fecha y km/hs obligatorio.

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
  v_unidad unidades%rowtype;
begin
  v_rol := rol_actual();
  v_empresa := empresa_actual();

  if v_rol not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para crear OT');
  end if;

  select * into v_unidad from unidades where id = p_id_unidad and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  if p_fecha_est_cierre is not null and p_fecha_est_cierre::date < current_date then
    return jsonb_build_object('ok', false, 'msg', 'La fecha estimada de cierre no puede ser anterior a hoy');
  end if;

  if v_unidad.km_actuales is not null and p_km_actuales is null then
    return jsonb_build_object('ok', false, 'msg', 'Debes registrar el kilometraje actual de la unidad');
  end if;

  if v_unidad.hs_actuales is not null and p_hs_actuales is null then
    return jsonb_build_object('ok', false, 'msg', 'Debes registrar las horas actuales de la unidad');
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

-- Evita que derivar novedades a OT se rompa al exigir km/hs en crear_ot.
drop function if exists derivar_novedad_a_ot(uuid, text, text, text, timestamptz, uuid, uuid, uuid[]);

create function derivar_novedad_a_ot(
  p_id_novedad uuid,
  p_tipo text,
  p_descripcion text,
  p_prioridad text default null,
  p_fecha_est_cierre timestamptz default null,
  p_id_secuencia uuid default null,
  p_proveedor uuid default null,
  p_tecnicos_asignados uuid[] default '{}',
  p_km_actuales numeric default null,
  p_hs_actuales numeric default null
)
returns jsonb language plpgsql security definer as $$
declare
  v_rol rol_usuario;
  v_empresa uuid;
  v_novedad novedades%rowtype;
begin
  v_rol := rol_actual();
  v_empresa := empresa_actual();

  if v_rol not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para derivar novedad a OT');
  end if;

  select * into v_novedad from novedades where id = p_id_novedad and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Novedad no encontrada');
  end if;

  if v_novedad.estado <> 'Aprobada' then
    return jsonb_build_object('ok', false, 'msg', 'La novedad todavía no fue aprobada por el jefe de taller');
  end if;

  return crear_ot(v_novedad.id_unidad, p_tipo, p_descripcion, p_prioridad, p_fecha_est_cierre,
                   p_id_secuencia, p_id_novedad, p_proveedor, p_tecnicos_asignados, p_km_actuales, p_hs_actuales);
end;
$$;

grant execute on function derivar_novedad_a_ot(uuid, text, text, text, timestamptz, uuid, uuid, uuid[], numeric, numeric) to authenticated;

-- Evita que cumplir rutinas se rompa al exigir km/hs en crear_ot.
create or replace function cumplir_rutina(
  p_id_rutina uuid,
  p_crear_ot boolean default true,
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
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para gestionar rutinas de mantenimiento');
  end if;

  select * into v_rutina from rutinas_mantenimiento where id = p_id_rutina and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Rutina no encontrada');
  end if;

  select * into v_unidad from unidades where id = v_rutina.id_unidad;

  if p_crear_ot then
    if p_fecha_est_cierre is null then
      return jsonb_build_object('ok', false, 'msg', 'La fecha estimada de cierre es obligatoria');
    end if;
    v_resultado := crear_ot(v_rutina.id_unidad, 'Preventivo', v_rutina.descripcion, p_prioridad, p_fecha_est_cierre,
                             null, null, null, '{}', v_unidad.km_actuales, v_unidad.hs_actuales);
    if not (v_resultado->>'ok')::boolean then
      return v_resultado;
    end if;
    v_id_ot := (v_resultado->>'id_ot')::uuid;
  end if;

  update rutinas_mantenimiento
     set km_hs_ultimo = case v_rutina.tipo_trigger
           when 'km' then coalesce(v_unidad.km_actuales, km_hs_ultimo)
           when 'hs' then coalesce(v_unidad.hs_actuales, km_hs_ultimo)
           else km_hs_ultimo end,
         fecha_ultimo = case when v_rutina.tipo_trigger = 'dias' then current_date else fecha_ultimo end
   where id = p_id_rutina;

  return jsonb_build_object('ok', true, 'id_ot', v_id_ot);
end;
$$;
-- cumplir_rutina no cambio de firma (sigue con los mismos 4 parametros), asi que create or replace alcanza, no hace falta drop.
