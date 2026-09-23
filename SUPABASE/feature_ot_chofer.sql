-- =====================================================================
-- OT y tareas asignadas al chofer, configurable por empresa (igual que
-- Bitácora y Secuencias): se prende con configuracion(seccion=
-- 'parametros', clave='usar_ot_chofer', valor='true'). Con esto activado,
-- el chofer trabaja OT exactamente igual que el técnico — mismas tareas,
-- checklist de cierre, firma, movimientos de stock y seguimiento — pero
-- SIN poder crear ni cerrar la OT (eso sigue siendo solo de administrador
-- y supervisor, igual que hoy con el técnico).
--
-- chofer_ot_habilitado(): helper que los RPC/policies de OT usan junto al
-- chequeo de rol, para no repetir la lectura de configuracion en cada uno.
-- =====================================================================

create or replace function chofer_ot_habilitado()
returns boolean language sql stable as $$
  select coalesce((
    select valor = 'true' from configuracion
    where empresa_id = empresa_actual() and seccion = 'parametros' and clave = 'usar_ot_chofer'
  ), false);
$$;

-- ---------------------------------------------------------------------
-- get_tecnicos_con_carga: el selector de "técnico asignado" (en crear OT,
-- agregar tarea, derivar novedad) también lista choferes cuando está
-- habilitado — mismo listado, no se toca Reportes → Técnicos (usa
-- get_reporte_tecnicos, una función aparte, filtrada solo a rol técnico).
-- ---------------------------------------------------------------------
create or replace function get_tecnicos_con_carga()
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  return coalesce((
    with tareas_por_tecnico as (
      select
        tec as id_tecnico,
        t.descripcion,
        t.estado,
        t.fecha_inicio,
        ot.fecha_apertura,
        t.orden,
        coalesce(ct.tiempo_estimado_hs, 0) * 60 as minutos_estimados
      from ot_cabecera ot
      join ot_tareas t on t.id_ot = ot.id and t.estado <> 'Completada'
      cross join lateral unnest(t.tecnicos_asignados) as tec
      left join catalogo_trabajos ct on ct.id = t.id_catalogo
      where ot.empresa_id = v_empresa and ot.estado in ('Abierta','En_Curso')
    ),
    resumen as (
      select
        id_tecnico,
        count(*) as n,
        sum(greatest(minutos_estimados - case when estado = 'En_Curso' and fecha_inicio is not null
          then extract(epoch from (now() - fecha_inicio)) / 60 else 0 end, 0)) as minutos
      from tareas_por_tecnico
      group by id_tecnico
    ),
    actual as (
      select distinct on (id_tecnico)
        id_tecnico,
        descripcion as tarea_actual,
        greatest(minutos_estimados - extract(epoch from (now() - fecha_inicio)) / 60, 0) as minutos_restantes_actual
      from tareas_por_tecnico
      where estado = 'En_Curso' and fecha_inicio is not null
      order by id_tecnico, fecha_inicio asc
    ),
    proxima as (
      select distinct on (id_tecnico)
        id_tecnico, descripcion as proxima_tarea
      from tareas_por_tecnico
      where estado = 'Pendiente'
      order by id_tecnico, fecha_apertura asc, orden asc
    )
    select jsonb_agg(jsonb_build_object(
      'id', u.id,
      'nombre', trim(u.nombre || ' ' || coalesce(u.apellido, '')),
      'especialidad', tp.especialidad,
      'tareas_pendientes', coalesce(resumen.n, 0),
      'minutos_comprometidos', coalesce(round(resumen.minutos), 0),
      'tarea_actual', actual.tarea_actual,
      'minutos_restantes_actual', round(actual.minutos_restantes_actual),
      'proxima_tarea', proxima.proxima_tarea
    ) order by u.nombre)
    from usuarios u
    left join tecnicos_perfil tp on tp.id_usuario = u.id
    left join resumen on resumen.id_tecnico = u.id
    left join actual on actual.id_tecnico = u.id
    left join proxima on proxima.id_tecnico = u.id
    where u.empresa_id = v_empresa and u.activo = true
      and (u.rol = 'tecnico' or (u.rol = 'chofer' and chofer_ot_habilitado()))
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------
-- RLS: el chofer edita sus tareas asignadas igual que el técnico.
-- ---------------------------------------------------------------------
drop policy if exists "edicion_ot_tareas_tecnico" on ot_tareas;
create policy "edicion_ot_tareas_tecnico" on ot_tareas for update using (
  (rol_actual() = 'tecnico' or (rol_actual() = 'chofer' and chofer_ot_habilitado()))
  and (
    (select id from usuarios where auth_user_id = auth.uid()) = any(ot_tareas.tecnicos_asignados)
    or exists (
      select 1 from ot_cabecera o
       where o.id = ot_tareas.id_ot
         and (select id from usuarios where auth_user_id = auth.uid()) = any(o.tecnicos_asignados)
    )
  )
);

-- El chofer también puede dejar una nota de seguimiento en la OT.
drop policy if exists "escritura_ot_seguimiento" on ot_seguimiento;
create policy "escritura_ot_seguimiento" on ot_seguimiento for insert with check (
  (rol_actual() in ('administrador','supervisor','tecnico') or (rol_actual() = 'chofer' and chofer_ot_habilitado()))
  and exists (select 1 from ot_cabecera o where o.id = ot_seguimiento.id_ot and o.empresa_id = empresa_actual())
);

-- ---------------------------------------------------------------------
-- convertir_tarea_a_novedad
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

  if v_rol not in ('administrador','supervisor','tecnico') and not (v_rol = 'chofer' and chofer_ot_habilitado()) then
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

  delete from ot_tareas where id = p_id_tarea;

  insert into ot_seguimiento (id_ot, descripcion, usuario)
  values (v_tarea.id_ot,
          '📋 Tarea convertida a novedad — "' || v_tarea.descripcion || '" (novedad: ' || v_id_novedad || ')',
          v_id_usuario);

  return jsonb_build_object('ok', true, 'id_novedad', v_id_novedad);
end;
$$;

-- ---------------------------------------------------------------------
-- actualizar_checklist_ot
-- ---------------------------------------------------------------------
create or replace function actualizar_checklist_ot(p_id_ot uuid, p_checklist jsonb)
returns jsonb language plpgsql security definer as $$
declare
  v_rol rol_usuario;
  v_empresa uuid;
begin
  v_rol := rol_actual();
  v_empresa := empresa_actual();

  if v_rol not in ('administrador','supervisor','tecnico') and not (v_rol = 'chofer' and chofer_ot_habilitado()) then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  update ot_cabecera set checklist_completado = p_checklist
   where id = p_id_ot and empresa_id = v_empresa;

  if not found then
    return jsonb_build_object('ok', false, 'msg', 'OT no encontrada');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- guardar_firma_ot
-- ---------------------------------------------------------------------
create or replace function guardar_firma_ot(p_id_ot uuid, p_proceso text, p_firma_url text)
returns jsonb language plpgsql security definer as $$
declare
  v_rol rol_usuario;
  v_empresa uuid;
  v_id_usuario uuid;
begin
  v_rol := rol_actual();
  v_empresa := empresa_actual();

  if v_rol not in ('administrador','supervisor','tecnico') and not (v_rol = 'chofer' and chofer_ot_habilitado()) then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  if not exists (select 1 from ot_cabecera where id = p_id_ot and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'OT no encontrada');
  end if;

  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();

  insert into ot_firmas (id_ot, proceso, firma_url, usuario)
  values (p_id_ot, p_proceso, p_firma_url, v_id_usuario);

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- movimiento_stock: el chofer puede descontar repuestos usados en su tarea.
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

  if v_rol not in ('administrador','supervisor','tecnico') and not (v_rol = 'chofer' and chofer_ot_habilitado()) then
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
