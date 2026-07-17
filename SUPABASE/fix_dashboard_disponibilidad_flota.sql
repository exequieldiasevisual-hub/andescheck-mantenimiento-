-- ==== Disponibilidad de flota: Unidades operativas ====
-- Nueva métrica: unidades activas que en este momento NO tienen una parada
-- abierta (unidad_paradas.hasta is null) — es decir, no están marcadas
-- "Fuera de servicio" ni tienen una OT de prioridad Alta corriendo que las
-- haya puesto en parada automática.

create or replace function get_dashboard(p_centros text[] default null, p_tipos text[] default null, p_ciudades text[] default null)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_semaforo jsonb;
  v_cola jsonb;
begin
  p_centros := nullif(p_centros, '{}'::text[]);
  p_tipos := nullif(p_tipos, '{}'::text[]);
  p_ciudades := nullif(p_ciudades, '{}'::text[]);

  select jsonb_build_object(
    'verde', count(*) filter (where salud >= 80),
    'ambar', count(*) filter (where salud between 50 and 79),
    'rojo', count(*) filter (where salud < 50)
  ) into v_semaforo
  from (select (e->>'salud')::int as salud from jsonb_array_elements(get_salud_flota(p_centros, p_tipos, p_ciudades)) e) s;

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
        and (p_centros is null or u.centro_costo = any(p_centros))
        and (p_tipos is null or u.tipo = any(p_tipos))
        and (p_ciudades is null or u.ciudad = any(p_ciudades))
      union all
      -- 2: OTs que vencen hoy
      select 2, 'ot', ot.id::text, ot.fecha_est_cierre,
             ot.numero_ot || ' — ' || u.descripcion,
             'Vence HOY'
      from ot_cabecera ot join unidades u on u.id = ot.id_unidad
      where ot.empresa_id = v_empresa and ot.estado in ('Abierta','En_Curso')
        and ot.fecha_est_cierre::date = current_date
        and (p_centros is null or u.centro_costo = any(p_centros))
        and (p_tipos is null or u.tipo = any(p_tipos))
        and (p_ciudades is null or u.ciudad = any(p_ciudades))
      union all
      -- 3: rutinas vencidas
      select 3, 'rutina', r.id::text, now(),
             r.descripcion || ' — ' || r.unidad_descripcion,
             'Rutina vencida'
      from rutinas_calculado r join unidades u on u.id = r.id_unidad
      where r.empresa_id = v_empresa and r.activo = true and r.estado_calculado = 'Vencida'
        and (p_centros is null or u.centro_costo = any(p_centros))
        and (p_tipos is null or u.tipo = any(p_tipos))
        and (p_ciudades is null or u.ciudad = any(p_ciudades))
      union all
      -- 4: documentos vencidos o por vencer
      select 4, 'documento', d.id::text, d.fecha_vigencia_hasta::timestamptz,
             trim(coalesce(d.numero, '') || ' ' || d.tipo) || ' — ' || u.descripcion,
             case when d.estado_calculado = 'Vencido' then 'Documento vencido' else 'Vence ' || to_char(d.fecha_vigencia_hasta, 'DD/MM') end
      from unidad_docs_calculado d join unidades u on u.id = d.id_unidad
      where u.empresa_id = v_empresa and d.estado_calculado in ('Vencido', 'Por vencer')
        and (p_centros is null or u.centro_costo = any(p_centros))
        and (p_tipos is null or u.tipo = any(p_tipos))
        and (p_ciudades is null or u.ciudad = any(p_ciudades))
      union all
      -- 5: novedades sin gestionar hace mas de 48 horas
      select 5, 'novedad', n.id::text, n.fecha,
             u.descripcion || ': ' || n.descripcion,
             'Sin gestionar hace ' || extract(day from now() - n.fecha) || ' día(s)'
      from novedades n join unidades u on u.id = n.id_unidad
      where n.empresa_id = v_empresa and n.estado = 'Pendiente' and n.fecha < now() - interval '48 hours'
        and (p_centros is null or u.centro_costo = any(p_centros))
        and (p_tipos is null or u.tipo = any(p_tipos))
        and (p_ciudades is null or u.ciudad = any(p_ciudades))
    ) eventos
    order by prio, fecha
    limit 30
  ) cola_limitada;

  return jsonb_build_object(
    'unidades_activas', (
      select count(*) from unidades u where u.empresa_id = v_empresa and u.activo = true
        and (p_centros is null or u.centro_costo = any(p_centros))
        and (p_tipos is null or u.tipo = any(p_tipos))
        and (p_ciudades is null or u.ciudad = any(p_ciudades))
    ),
    'unidades_total', (
      select count(*) from unidades u where u.empresa_id = v_empresa
        and (p_centros is null or u.centro_costo = any(p_centros))
        and (p_tipos is null or u.tipo = any(p_tipos))
        and (p_ciudades is null or u.ciudad = any(p_ciudades))
    ),
    'unidades_operativas', (
      select count(*) from unidades u where u.empresa_id = v_empresa and u.activo = true
        and (p_centros is null or u.centro_costo = any(p_centros))
        and (p_tipos is null or u.tipo = any(p_tipos))
        and (p_ciudades is null or u.ciudad = any(p_ciudades))
        and not exists (select 1 from unidad_paradas p where p.id_unidad = u.id and p.hasta is null)
    ),
    'ot_abiertas', (
      select count(*) from ot_cabecera ot join unidades u on u.id = ot.id_unidad
      where ot.empresa_id = v_empresa and ot.estado in ('Abierta','En_Curso')
        and (p_centros is null or u.centro_costo = any(p_centros))
        and (p_tipos is null or u.tipo = any(p_tipos))
        and (p_ciudades is null or u.ciudad = any(p_ciudades))
    ),
    'rutinas_vencidas', (
      select count(*) from rutinas_calculado r join unidades u on u.id = r.id_unidad
      where r.empresa_id = v_empresa and r.activo = true and r.estado_calculado = 'Vencida'
        and (p_centros is null or u.centro_costo = any(p_centros))
        and (p_tipos is null or u.tipo = any(p_tipos))
        and (p_ciudades is null or u.ciudad = any(p_ciudades))
    ),
    'novedades_pendientes', (
      select count(*) from novedades n join unidades u on u.id = n.id_unidad
      where n.empresa_id = v_empresa and n.estado = 'Pendiente'
        and (p_centros is null or u.centro_costo = any(p_centros))
        and (p_tipos is null or u.tipo = any(p_tipos))
        and (p_ciudades is null or u.ciudad = any(p_ciudades))
    ),
    'stock_critico', (select count(*) from stock where empresa_id = v_empresa and activo = true and stock_actual <= stock_minimo),
    'docs_vencidos', (
      select count(*) from unidad_docs_calculado d join unidades u on u.id = d.id_unidad
      where u.empresa_id = v_empresa and d.estado_calculado = 'Vencido'
        and (p_centros is null or u.centro_costo = any(p_centros))
        and (p_tipos is null or u.tipo = any(p_tipos))
        and (p_ciudades is null or u.ciudad = any(p_ciudades))
    ),
    'docs_por_vencer', (
      select count(*) from unidad_docs_calculado d join unidades u on u.id = d.id_unidad
      where u.empresa_id = v_empresa and d.estado_calculado = 'Por vencer'
        and (p_centros is null or u.centro_costo = any(p_centros))
        and (p_tipos is null or u.tipo = any(p_tipos))
        and (p_ciudades is null or u.ciudad = any(p_ciudades))
    ),
    'semaforo', v_semaforo,
    'cola', v_cola
  );
end;
$$;
