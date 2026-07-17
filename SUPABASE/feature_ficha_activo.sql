-- ==== Ficha del Activo - RPC get_ficha_activo ====
-- Consolida la informacion operativa, documental, preventiva y economica de una unidad.
-- Respeta el aislamiento multi-tenant validando siempre contra empresa_actual().

create or replace function get_ficha_activo(p_id_unidad uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_unidad unidades%rowtype;
  v_costo_total numeric(12,2) := 0;
  v_costo_12m numeric(12,2) := 0;
  v_ot_total int := 0;
  v_ot_abiertas int := 0;
  v_correctivos_12m int := 0;
  v_preventivos_12m int := 0;
  v_dias_prom_resolucion numeric := null;
  v_rutinas_total int := 0;
  v_rutinas_vencidas int := 0;
  v_docs_total int := 0;
  v_docs_no_vencidos int := 0;
  v_docs_vencidos int := 0;
  v_docs_por_vencer int := 0;
  v_novedades_pendientes int := 0;
  v_salud_rutinas int := 0;
  v_salud_correctivos int := 0;
  v_salud_documentacion int := 0;
  v_salud_novedades int := 0;
begin
  select *
  into v_unidad
  from unidades
  where id = p_id_unidad
    and empresa_id = v_empresa;

  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  select
    coalesce(sum(c.monto), 0),
    coalesce(sum(c.monto) filter (where c.fecha >= now() - interval '12 months'), 0)
  into v_costo_total, v_costo_12m
  from ot_cabecera ot
  join costos c on c.id_ot = ot.id
  where ot.empresa_id = v_empresa
    and ot.id_unidad = p_id_unidad;

  select
    count(*) filter (where estado <> 'Anulada'),
    count(*) filter (where estado in ('Abierta','En_Curso')),
    count(*) filter (
      where tipo = 'Correctivo'
        and fecha_apertura >= now() - interval '12 months'
        and estado <> 'Anulada'
    ),
    count(*) filter (
      where tipo = 'Preventivo'
        and fecha_apertura >= now() - interval '12 months'
        and estado <> 'Anulada'
    ),
    round(avg(extract(epoch from fecha_cierre - fecha_apertura) / 86400.0) filter (where fecha_cierre is not null), 1)
  into v_ot_total, v_ot_abiertas, v_correctivos_12m, v_preventivos_12m, v_dias_prom_resolucion
  from ot_cabecera
  where empresa_id = v_empresa
    and id_unidad = p_id_unidad;

  select
    count(*),
    count(*) filter (where estado_calculado = 'Vencido')
  into v_rutinas_total, v_rutinas_vencidas
  from rutinas_calculado
  where empresa_id = v_empresa
    and id_unidad = p_id_unidad
    and activo = true;

  select
    count(*),
    count(*) filter (where estado_calculado <> 'Vencido'),
    count(*) filter (where estado_calculado = 'Vencido'),
    count(*) filter (where estado_calculado = 'Por vencer')
  into v_docs_total, v_docs_no_vencidos, v_docs_vencidos, v_docs_por_vencer
  from unidad_docs_calculado
  where id_unidad = p_id_unidad;

  select count(*)
  into v_novedades_pendientes
  from novedades
  where empresa_id = v_empresa
    and id_unidad = p_id_unidad
    and estado = 'Pendiente';

  -- Salud: rutinas 30 pts, correctivos 30 pts, documentacion 20 pts, novedades 20 pts.
  v_salud_rutinas := case
    when v_rutinas_total = 0 then 30
    else round(30.0 * (v_rutinas_total - v_rutinas_vencidas) / nullif(v_rutinas_total, 0))::int
  end;
  v_salud_correctivos := greatest(0, 30 - 5 * v_correctivos_12m);
  v_salud_documentacion := case
    when v_docs_total = 0 then 20
    else round(20.0 * v_docs_no_vencidos / nullif(v_docs_total, 0))::int
  end;
  v_salud_novedades := greatest(0, 20 - 5 * v_novedades_pendientes);

  return jsonb_build_object(
    'ok', true,
    'unidad', jsonb_build_object(
      'descripcion', v_unidad.descripcion,
      'patente_serie', v_unidad.patente_serie,
      'marca', v_unidad.marca,
      'modelo', v_unidad.modelo,
      'anio', v_unidad.anio,
      'tipo', v_unidad.tipo,
      'ciudad', v_unidad.ciudad,
      'centro_costo', v_unidad.centro_costo,
      'km_actuales', v_unidad.km_actuales,
      'hs_actuales', v_unidad.hs_actuales,
      'fecha_alta', v_unidad.fecha_alta
    ),
    'estado_operativo', case when v_ot_abiertas > 0 then 'En mantenimiento' else 'Operativa' end,
    'kpis', jsonb_build_object(
      'costo_total', v_costo_total,
      'costo_12m', v_costo_12m,
      'costo_por_km', round(v_costo_total / nullif(v_unidad.km_actuales, 0), 2),
      'costo_por_hs', round(v_costo_total / nullif(v_unidad.hs_actuales, 0), 2),
      'ot_total', v_ot_total,
      'ot_abiertas', v_ot_abiertas,
      'correctivos_12m', v_correctivos_12m,
      'preventivos_12m', v_preventivos_12m,
      'dias_prom_resolucion', v_dias_prom_resolucion,
      'rutinas_total', v_rutinas_total,
      'rutinas_vencidas', v_rutinas_vencidas,
      'docs_vencidos', v_docs_vencidos,
      'docs_por_vencer', v_docs_por_vencer,
      'novedades_pendientes', v_novedades_pendientes
    ),
    'salud', jsonb_build_object(
      'total', v_salud_rutinas + v_salud_correctivos + v_salud_documentacion + v_salud_novedades,
      'rutinas', v_salud_rutinas,
      'correctivos', v_salud_correctivos,
      'documentacion', v_salud_documentacion,
      'novedades', v_salud_novedades
    ),
    'costos_por_tipo', coalesce((
      select jsonb_agg(item order by (item->>'total')::numeric desc)
      from (
        select jsonb_build_object(
          'tipo', coalesce(c.tipo, 'Sin clasificar'),
          'total', sum(c.monto)
        ) as item
        from ot_cabecera ot
        join costos c on c.id_ot = ot.id
        where ot.empresa_id = v_empresa
          and ot.id_unidad = p_id_unidad
        group by coalesce(c.tipo, 'Sin clasificar')
      ) s
    ), '[]'::jsonb),
    'costos_por_mes', coalesce((
      select jsonb_agg(
        jsonb_build_object('mes', to_char(mes, 'YYYY-MM'), 'total', total)
        order by mes
      )
      from (
        select
          meses.mes,
          coalesce(sum(c.monto), 0) as total
        from generate_series(
          date_trunc('month', now()) - interval '11 months',
          date_trunc('month', now()),
          interval '1 month'
        ) meses(mes)
        left join ot_cabecera ot
          on ot.empresa_id = v_empresa
         and ot.id_unidad = p_id_unidad
        left join costos c
          on c.id_ot = ot.id
         and c.fecha >= meses.mes
         and c.fecha < meses.mes + interval '1 month'
        group by meses.mes
      ) s
    ), '[]'::jsonb),
    'timeline', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'fecha', fecha,
          'tipo_evento', tipo_evento,
          'titulo', titulo,
          'detalle', detalle
        )
        order by fecha desc
      )
      from (
        select fecha, tipo_evento, titulo, detalle
        from (
          select
            v_unidad.fecha_alta as fecha,
            'alta'::text as tipo_evento,
            'Alta del activo'::text as titulo,
            null::text as detalle
          union all
          select
            ot.fecha_apertura,
            'ot_apertura',
            ot.numero_ot || ' - ' || ot.tipo,
            ot.descripcion
          from ot_cabecera ot
          where ot.empresa_id = v_empresa
            and ot.id_unidad = p_id_unidad
            and ot.estado <> 'Anulada'
          union all
          select
            ot.fecha_cierre,
            'ot_cierre',
            ot.numero_ot || ' - Cerrada',
            ot.descripcion
          from ot_cabecera ot
          where ot.empresa_id = v_empresa
            and ot.id_unidad = p_id_unidad
            and ot.fecha_cierre is not null
          union all
          select
            n.fecha,
            'novedad',
            coalesce(n.tipo, 'Novedad'),
            n.descripcion || ' (' || n.estado::text || ')'
          from novedades n
          where n.empresa_id = v_empresa
            and n.id_unidad = p_id_unidad
          union all
          select
            d.fecha_alta,
            'documento',
            coalesce(d.numero, '') || ' ' || d.tipo,
            null::text
          from unidad_docs d
          where d.id_unidad = p_id_unidad
        ) eventos
        order by fecha desc
        limit 50
      ) timeline_limitado
    ), '[]'::jsonb),
    'documentos', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'numero', d.numero,
          'tipo', d.tipo,
          'fecha_vigencia_hasta', d.fecha_vigencia_hasta,
          'estado_calculado', d.estado_calculado,
          'archivo_url', d.archivo_url
        )
        order by d.fecha_vigencia_hasta asc nulls last
      )
      from unidad_docs_calculado d
      where d.id_unidad = p_id_unidad
    ), '[]'::jsonb),
    'rutinas', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'descripcion', r.descripcion,
          'tipo_trigger', r.tipo_trigger,
          'intervalo', r.intervalo,
          'proximo_km_hs', r.proximo_km_hs,
          'proxima_fecha', r.proxima_fecha,
          'estado_calculado', r.estado_calculado
        )
      )
      from rutinas_calculado r
      where r.empresa_id = v_empresa
        and r.id_unidad = p_id_unidad
        and r.activo = true
    ), '[]'::jsonb),
    'herramientas', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'codigo', h.codigo,
          'descripcion', h.descripcion
        )
        order by h.codigo, h.descripcion
      )
      from (
        select distinct h.codigo, h.descripcion
        from ot_cabecera ot
        join ot_herramientas oh on oh.id_ot = ot.id
        join herramientas h on h.id = oh.id_herramienta
        where ot.empresa_id = v_empresa
          and ot.id_unidad = p_id_unidad
          and h.empresa_id = v_empresa
      ) h
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function get_ficha_activo(uuid) to authenticated;
