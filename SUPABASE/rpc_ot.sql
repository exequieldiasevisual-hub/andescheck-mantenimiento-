-- =====================================================================
-- AndesCheck Mantenimiento — Funciones RPC de transición de OT
-- Replican crearOT / actualizarOT / anularOT / derivarNovedadAOT /
-- convertirTareaANovedad / movimientoStock de gs.js, ahora en Postgres.
-- Se llaman desde el frontend con supabase.rpc('nombre_funcion', {...})
-- en vez de hacer INSERT/UPDATE directo sobre las tablas.
--
-- IMPORTANTE multi-tenant: ninguna función recibe empresa_id como parámetro.
-- Siempre se toma de empresa_actual() (derivado de auth.uid() en el propio
-- servidor) para que un cliente nunca pueda pasar la empresa de otro tenant.
-- Toda referencia externa (id_unidad, id_secuencia, id_repuesto, etc.) se
-- valida contra esa misma empresa antes de usarla.
-- =====================================================================

-- ---------------------------------------------------------------------
-- crear_ot
-- Roles permitidos: administrador, supervisor
-- Si viene id_secuencia, copia las tareas de la plantilla (secuencias_tareas).
-- Si viene id_novedad_origen, la marca como Derivada_a_OT.
-- ---------------------------------------------------------------------
create or replace function crear_ot(
  p_id_unidad uuid,
  p_tipo text,
  p_descripcion text,
  p_prioridad text default null,
  p_fecha_est_cierre timestamptz default null,
  p_id_secuencia uuid default null,
  p_id_novedad_origen uuid default null,
  p_proveedor uuid default null,
  p_tecnicos_asignados uuid[] default '{}'
)
returns jsonb language plpgsql security definer as $$
declare
  v_rol rol_usuario;
  v_empresa uuid;
  v_id_usuario uuid;
  v_id_ot uuid;
  v_tarea record;
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

  insert into ot_cabecera (empresa_id, numero_ot, id_unidad, tipo, descripcion, prioridad, fecha_est_cierre,
                           id_secuencia, id_novedad_origen, proveedor, tecnicos_asignados, supervisor)
  values (v_empresa, generar_numero_ot(v_empresa), p_id_unidad, p_tipo, p_descripcion, p_prioridad, p_fecha_est_cierre,
          p_id_secuencia, p_id_novedad_origen, p_proveedor, p_tecnicos_asignados, v_id_usuario)
  returning id into v_id_ot;

  if p_id_secuencia is not null then
    for v_tarea in
      select orden, descripcion from secuencias_tareas
       where id_secuencia = p_id_secuencia order by orden
    loop
      insert into ot_tareas (id_ot, orden, descripcion)
      values (v_id_ot, v_tarea.orden, v_tarea.descripcion);
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

-- ---------------------------------------------------------------------
-- cerrar_ot
-- Roles permitidos: administrador, supervisor
-- Reglas: todas las tareas deben estar Completada. Detecta si fue puntual
-- o vencida comparando fecha_est_cierre. Si la OT vino de una novedad,
-- la marca Cerrada.
-- ---------------------------------------------------------------------
create or replace function cerrar_ot(p_id_ot uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_rol rol_usuario;
  v_empresa uuid;
  v_ot ot_cabecera%rowtype;
  v_tareas_pend int;
  v_estado_final estado_ot;
begin
  v_rol := rol_actual();
  v_empresa := empresa_actual();

  if v_rol not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para cerrar OT');
  end if;

  select * into v_ot from ot_cabecera where id = p_id_ot and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'OT no encontrada');
  end if;

  if v_ot.estado in ('Cerrada','Cerrada_Vencida','Anulada') then
    return jsonb_build_object('ok', false, 'msg', 'La OT ya está ' || v_ot.estado);
  end if;

  select count(*) into v_tareas_pend
    from ot_tareas where id_ot = p_id_ot and estado <> 'Completada';

  if v_tareas_pend > 0 then
    return jsonb_build_object('ok', false, 'msg',
      '⛔ No se puede cerrar: ' || v_tareas_pend || ' tarea(s) sin completar');
  end if;

  v_estado_final := case
    when v_ot.fecha_est_cierre is not null and now() > v_ot.fecha_est_cierre
      then 'Cerrada_Vencida'
    else 'Cerrada'
  end;

  update ot_cabecera
     set estado = v_estado_final, fecha_cierre = now()
   where id = p_id_ot;

  if v_ot.id_novedad_origen is not null then
    update novedades set estado = 'Cerrada' where id = v_ot.id_novedad_origen;
  end if;

  return jsonb_build_object('ok', true, 'estado', v_estado_final);
end;
$$;

-- ---------------------------------------------------------------------
-- anular_ot
-- Roles permitidos: administrador, supervisor
-- Reglas: motivo obligatorio. Si la OT vino de una novedad, la reabre (Pendiente).
-- ---------------------------------------------------------------------
create or replace function anular_ot(p_id_ot uuid, p_motivo text)
returns jsonb language plpgsql security definer as $$
declare
  v_rol rol_usuario;
  v_empresa uuid;
  v_ot ot_cabecera%rowtype;
begin
  v_rol := rol_actual();
  v_empresa := empresa_actual();

  if v_rol not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para anular OT');
  end if;

  if p_motivo is null or trim(p_motivo) = '' then
    return jsonb_build_object('ok', false, 'msg', 'El motivo de anulación es obligatorio');
  end if;

  select * into v_ot from ot_cabecera where id = p_id_ot and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'OT no encontrada');
  end if;

  if v_ot.estado in ('Cerrada','Cerrada_Vencida','Anulada') then
    return jsonb_build_object('ok', false, 'msg', 'La OT ya está ' || v_ot.estado);
  end if;

  update ot_cabecera
     set estado = 'Anulada', fecha_cierre = now(), motivo_anulacion = trim(p_motivo)
   where id = p_id_ot;

  if v_ot.id_novedad_origen is not null then
    update novedades
       set estado = 'Pendiente', id_ot_vinculada = null
     where id = v_ot.id_novedad_origen;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- derivar_novedad_a_ot
-- Roles permitidos: administrador, supervisor
-- Wrapper sobre crear_ot() que además valida que la novedad esté Pendiente.
-- ---------------------------------------------------------------------
create or replace function derivar_novedad_a_ot(
  p_id_novedad uuid,
  p_tipo text,
  p_descripcion text,
  p_prioridad text default null,
  p_fecha_est_cierre timestamptz default null,
  p_id_secuencia uuid default null,
  p_proveedor uuid default null,
  p_tecnicos_asignados uuid[] default '{}'
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

  if v_novedad.estado <> 'Pendiente' then
    return jsonb_build_object('ok', false, 'msg', 'La novedad ya fue derivada o cerrada');
  end if;

  return crear_ot(v_novedad.id_unidad, p_tipo, p_descripcion, p_prioridad, p_fecha_est_cierre,
                   p_id_secuencia, p_id_novedad, p_proveedor, p_tecnicos_asignados);
end;
$$;

-- ---------------------------------------------------------------------
-- convertir_tarea_a_novedad
-- Roles permitidos: administrador, supervisor, tecnico
-- Crea una novedad "Derivada de OT" y deja referencia en las observaciones
-- de la tarea (igual que gs.js).
-- ---------------------------------------------------------------------
create or replace function convertir_tarea_a_novedad(p_id_tarea uuid, p_descripcion text)
returns jsonb language plpgsql security definer as $$
declare
  v_rol rol_usuario;
  v_empresa uuid;
  v_tarea ot_tareas%rowtype;
  v_ot ot_cabecera%rowtype;
  v_id_usuario uuid;
  v_id_novedad uuid;
begin
  v_rol := rol_actual();
  v_empresa := empresa_actual();

  if v_rol not in ('administrador','supervisor','tecnico') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  select * into v_tarea from ot_tareas where id = p_id_tarea;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Tarea no encontrada');
  end if;

  select * into v_ot from ot_cabecera where id = v_tarea.id_ot and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Tarea no encontrada');
  end if;

  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();

  insert into novedades (empresa_id, id_unidad, descripcion, tipo, usuario_carga)
  values (v_empresa, v_ot.id_unidad, p_descripcion, 'Derivada de OT', v_id_usuario)
  returning id into v_id_novedad;

  update ot_tareas
     set observaciones = coalesce(observaciones || E'\n', '') ||
                          'Derivada a novedad ' || v_id_novedad
   where id = p_id_tarea;

  return jsonb_build_object('ok', true, 'id_novedad', v_id_novedad);
end;
$$;

-- ---------------------------------------------------------------------
-- movimiento_stock
-- Roles permitidos: administrador, supervisor, tecnico
-- Valida que el stock no quede negativo en egresos.
-- ---------------------------------------------------------------------
create or replace function movimiento_stock(
  p_id_repuesto uuid,
  p_tipo tipo_movimiento_stock,
  p_cantidad numeric,
  p_id_ot uuid default null,
  p_observacion text default null
)
returns jsonb language plpgsql security definer as $$
declare
  v_rol rol_usuario;
  v_empresa uuid;
  v_id_usuario uuid;
  v_stock_actual numeric;
begin
  v_rol := rol_actual();
  v_empresa := empresa_actual();

  if v_rol not in ('administrador','supervisor','tecnico') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para registrar movimiento de stock');
  end if;

  if p_cantidad <= 0 then
    return jsonb_build_object('ok', false, 'msg', 'La cantidad debe ser mayor a cero');
  end if;

  select stock_actual into v_stock_actual
    from stock where id = p_id_repuesto and empresa_id = v_empresa for update;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Repuesto no encontrado');
  end if;

  if p_id_ot is not null and not exists (select 1 from ot_cabecera where id = p_id_ot and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'OT no encontrada');
  end if;

  if p_tipo = 'egreso' and v_stock_actual - p_cantidad < 0 then
    return jsonb_build_object('ok', false, 'msg', 'Stock insuficiente');
  end if;

  update stock
     set stock_actual = stock_actual + (case when p_tipo = 'ingreso' then p_cantidad else -p_cantidad end)
   where id = p_id_repuesto;

  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();

  insert into stock_movimientos (id_repuesto, tipo, cantidad, id_ot, usuario, observacion)
  values (p_id_repuesto, p_tipo, p_cantidad, p_id_ot, v_id_usuario, p_observacion);

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- get_dashboard
-- Endpoint compuesto: 1 sola llamada con 7 contadores, igual que
-- getDashboard() en gs.js. Siempre acotado a empresa_actual().
-- ---------------------------------------------------------------------
create or replace function get_dashboard()
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  return jsonb_build_object(
    'unidades_activas', (select count(*) from unidades where empresa_id = v_empresa and activo = true),
    'ot_abiertas', (select count(*) from ot_cabecera where empresa_id = v_empresa and estado in ('Abierta','En_Curso')),
    'preventivos_vencidos', (select count(*) from preventivos_calculado where empresa_id = v_empresa and activo = true and estado_calculado = 'Vencido'),
    'novedades_pendientes', (select count(*) from novedades where empresa_id = v_empresa and estado = 'Pendiente'),
    'stock_critico', (select count(*) from stock where empresa_id = v_empresa and activo = true and stock_actual <= stock_minimo),
    'docs_vencidos', (select count(*) from unidad_docs_calculado d join unidades u on u.id = d.id_unidad where u.empresa_id = v_empresa and d.estado_calculado = 'Vencido'),
    'docs_por_vencer', (select count(*) from unidad_docs_calculado d join unidades u on u.id = d.id_unidad where u.empresa_id = v_empresa and d.estado_calculado = 'Por vencer')
  );
end;
$$;

-- ---------------------------------------------------------------------
-- resolver_alias_empresa
-- Público (anon) — paso 1 del login: valida el alias y arma el email
-- sintético para el paso 2 (usuario/contraseña).
-- ---------------------------------------------------------------------
create or replace function resolver_alias_empresa(p_alias text)
returns jsonb language plpgsql stable security definer as $$
declare
  v_empresa empresas_login%rowtype;
begin
  select * into v_empresa from empresas_login where lower(alias) = lower(p_alias);
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Empresa no encontrada');
  end if;
  return jsonb_build_object('ok', true, 'empresa_id', v_empresa.id,
    'razon_social', v_empresa.razon_social, 'logo_url', v_empresa.logo_url);
end;
$$;

grant execute on function crear_ot(uuid, text, text, text, timestamptz, uuid, uuid, uuid, uuid[]) to authenticated;
grant execute on function cerrar_ot(uuid) to authenticated;
grant execute on function anular_ot(uuid, text) to authenticated;
grant execute on function derivar_novedad_a_ot(uuid, text, text, text, timestamptz, uuid, uuid, uuid[]) to authenticated;
grant execute on function convertir_tarea_a_novedad(uuid, text) to authenticated;
grant execute on function movimiento_stock(uuid, tipo_movimiento_stock, numeric, uuid, text) to authenticated;
grant execute on function get_dashboard() to authenticated;
grant execute on function resolver_alias_empresa(text) to anon, authenticated;
