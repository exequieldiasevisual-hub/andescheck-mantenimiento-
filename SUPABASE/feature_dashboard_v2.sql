-- ==== Dashboard v2 — salud de flota + cola de trabajo ====
-- get_salud_flota(): indice de salud (0-100) de todas las unidades activas
-- en una sola consulta (misma formula que get_ficha_activo).
-- get_dashboard(): ademas de los conteos de siempre, devuelve el semaforo
-- de flota (verde/ambar/rojo) y la cola de trabajo priorizada del dia.

create or replace function get_salud_flota()
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  return coalesce((
    with r as (
      select id_unidad, count(*) as total, count(*) filter (where estado_calculado = 'Vencido') as vencidas
      from rutinas_calculado where empresa_id = v_empresa and activo = true group by id_unidad
    ),
    c as (
      select id_unidad, count(*) as correctivos_12m
      from ot_cabecera
      where empresa_id = v_empresa and tipo = 'Correctivo' and estado <> 'Anulada'
        and fecha_apertura >= now() - interval '12 months'
      group by id_unidad
    ),
    d as (
      select dc.id_unidad, count(*) as total, count(*) filter (where dc.estado_calculado <> 'Vencido') as no_vencidos
      from unidad_docs_calculado dc join unidades u on u.id = dc.id_unidad
      where u.empresa_id = v_empresa group by dc.id_unidad
    ),
    n as (
      select id_unidad, count(*) as pendientes from novedades
      where empresa_id = v_empresa and estado = 'Pendiente' group by id_unidad
    )
    select jsonb_agg(jsonb_build_object(
      'id_unidad', u.id,
      'salud',
        (case when coalesce(r.total, 0) = 0 then 30 else round(30.0 * (r.total - r.vencidas) / r.total) end)
        + greatest(0, 30 - 5 * coalesce(c.correctivos_12m, 0))
        + (case when coalesce(d.total, 0) = 0 then 20 else round(20.0 * d.no_vencidos / d.total) end)
        + greatest(0, 20 - 5 * coalesce(n.pendientes, 0))
    ))
    from unidades u
    left join r on r.id_unidad = u.id
    left join c on c.id_unidad = u.id
    left join d on d.id_unidad = u.id
    left join n on n.id_unidad = u.id
    where u.empresa_id = v_empresa and u.activo = true
  ), '[]'::jsonb);
end;
$$;

grant execute on function get_salud_flota() to authenticated;

create or replace function get_dashboard()
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_semaforo jsonb;
  v_cola jsonb;
begin
  select jsonb_build_object(
    'verde', count(*) filter (where salud >= 80),
    'ambar', count(*) filter (where salud between 50 and 79),
    'rojo', count(*) filter (where salud < 50)
  ) into v_semaforo
  from (select (e->>'salud')::int as salud from jsonb_array_elements(get_salud_flota()) e) s;

  select coalesce(jsonb_agg(jsonb_build_object(
    'tipo', tipo, 'id', id, 'fecha', fecha, 'titulo', titulo, 'detalle', detalle
  ) order by prio, fecha), '[]'::jsonb) into v_cola
  from (
    select * from (
      -- 1: OTs vencidas (abiertas con fecha estimada de cierre pasada)
      select 1 as prio, 'ot'::text as tipo, ot.id::text as id, ot.fecha_est_cierre as fecha,
             ot.numero_ot || ' — ' || u.descripcion as titulo,
             'Vencida hace ' || (current_date - ot.fecha_est_cierre::date) || ' día(s)' as detalle
      from ot_cabecera ot join unidades u on u.id = ot.id_unidad
      where ot.empresa_id = v_empresa and ot.estado in ('Abierta','En_Curso')
        and ot.fecha_est_cierre is not null and ot.fecha_est_cierre::date < current_date
      union all
      -- 2: OTs que vencen hoy
      select 2, 'ot', ot.id::text, ot.fecha_est_cierre,
             ot.numero_ot || ' — ' || u.descripcion,
             'Vence HOY'
      from ot_cabecera ot join unidades u on u.id = ot.id_unidad
      where ot.empresa_id = v_empresa and ot.estado in ('Abierta','En_Curso')
        and ot.fecha_est_cierre::date = current_date
      union all
      -- 3: rutinas vencidas
      select 3, 'rutina', r.id::text, now(),
             r.descripcion || ' — ' || r.unidad_descripcion,
             'Rutina vencida'
      from rutinas_calculado r
      where r.empresa_id = v_empresa and r.activo = true and r.estado_calculado = 'Vencido'
      union all
      -- 4: documentos vencidos o por vencer
      select 4, 'documento', d.id::text, d.fecha_vigencia_hasta::timestamptz,
             trim(coalesce(d.numero, '') || ' ' || d.tipo) || ' — ' || u.descripcion,
             case when d.estado_calculado = 'Vencido' then 'Documento vencido' else 'Vence ' || to_char(d.fecha_vigencia_hasta, 'DD/MM') end
      from unidad_docs_calculado d join unidades u on u.id = d.id_unidad
      where u.empresa_id = v_empresa and d.estado_calculado in ('Vencido', 'Por vencer')
      union all
      -- 5: novedades sin gestionar hace mas de 48 horas
      select 5, 'novedad', n.id::text, n.fecha,
             u.descripcion || ': ' || n.descripcion,
             'Sin gestionar hace ' || extract(day from now() - n.fecha) || ' día(s)'
      from novedades n join unidades u on u.id = n.id_unidad
      where n.empresa_id = v_empresa and n.estado = 'Pendiente' and n.fecha < now() - interval '48 hours'
    ) eventos
    order by prio, fecha
    limit 30
  ) cola_limitada;

  return jsonb_build_object(
    'unidades_activas', (select count(*) from unidades where empresa_id = v_empresa and activo = true),
    'ot_abiertas', (select count(*) from ot_cabecera where empresa_id = v_empresa and estado in ('Abierta','En_Curso')),
    'rutinas_vencidas', (select count(*) from rutinas_calculado where empresa_id = v_empresa and activo = true and estado_calculado = 'Vencido'),
    'novedades_pendientes', (select count(*) from novedades where empresa_id = v_empresa and estado = 'Pendiente'),
    'stock_critico', (select count(*) from stock where empresa_id = v_empresa and activo = true and stock_actual <= stock_minimo),
    'docs_vencidos', (select count(*) from unidad_docs_calculado d join unidades u on u.id = d.id_unidad where u.empresa_id = v_empresa and d.estado_calculado = 'Vencido'),
    'docs_por_vencer', (select count(*) from unidad_docs_calculado d join unidades u on u.id = d.id_unidad where u.empresa_id = v_empresa and d.estado_calculado = 'Por vencer'),
    'semaforo', v_semaforo,
    'cola', v_cola
  );
end;
$$;
