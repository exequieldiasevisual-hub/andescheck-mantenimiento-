-- ==== Panel visual de técnicos ====
-- Tablero tipo BI para controlar técnicos: total de tareas por técnico,
-- eficiencia (horas reales vs estimadas), distribución por tipo de OT,
-- por tipo de unidad, por sistema/categoría del catálogo, y detalle fila
-- por fila. Filtros opcionales por técnicos (varios a la vez), centro de
-- costo y ciudad.

drop function if exists get_panel_tecnicos(text, uuid, text, text);

create or replace function get_panel_tecnicos(
  p_mes text, p_tecnicos uuid[] default null, p_centro_costo text default null, p_ciudad text default null
)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_desde date;
  v_hasta date;
begin
  if rol_actual() not in ('administrador','supervisor','auditor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para ver reportes');
  end if;

  begin
    v_desde := to_date(p_mes || '-01', 'YYYY-MM-DD');
  exception when others then
    return jsonb_build_object('ok', false, 'msg', 'Mes inválido');
  end;
  v_hasta := v_desde + interval '1 month';

  create temp table _tareas_panel on commit drop as
  select
    tec as id_tecnico,
    u_tec.nombre as tecnico,
    t.descripcion as trabajo,
    coalesce(ct.categoria, 'Sin categoría') as sistema,
    coalesce(uni.tipo, 'Sin tipo') as tipo_unidad,
    ot.tipo as tipo_ot,
    coalesce(ct.tiempo_estimado_hs, 0) as horas_estimadas,
    case when t.fecha_inicio is not null and t.fecha_fin is not null
      then round((extract(epoch from (t.fecha_fin - t.fecha_inicio)) / 3600)::numeric, 2) else null end as horas_reales
  from ot_tareas t
  join ot_cabecera ot on ot.id = t.id_ot
  join unidades uni on uni.id = ot.id_unidad
  cross join lateral unnest(t.tecnicos_asignados) as tec
  join usuarios u_tec on u_tec.id = tec
  left join catalogo_trabajos ct on ct.id = t.id_catalogo
  where ot.empresa_id = v_empresa and t.estado = 'Completada'
    and t.fecha_fin >= v_desde and t.fecha_fin < v_hasta
    and (p_tecnicos is null or tec = any(p_tecnicos))
    and (p_centro_costo is null or uni.centro_costo = p_centro_costo)
    and (p_ciudad is null or uni.ciudad = p_ciudad);

  return jsonb_build_object(
    'ok', true,
    'mes', p_mes,
    'tecnicos', coalesce((
      select jsonb_agg(jsonb_build_object('id', id_tecnico, 'nombre', tecnico, 'total', n) order by n desc)
      from (select id_tecnico, tecnico, count(*) as n from _tareas_panel group by id_tecnico, tecnico) s
    ), '[]'::jsonb),
    'por_eficiencia', coalesce((
      select jsonb_agg(jsonb_build_object('label', label, 'cantidad', n) order by orden)
      from (
        select
          case
            when horas_estimadas <= 0 or horas_reales is null then null
            when horas_reales < horas_estimadas * 0.75 then 'Muy eficiente'
            when horas_reales <= horas_estimadas then 'Eficiente'
            when horas_reales <= horas_estimadas * 1.5 then 'Deficiente'
            else 'Muy deficiente'
          end as label,
          case
            when horas_estimadas <= 0 or horas_reales is null then null
            when horas_reales < horas_estimadas * 0.75 then 1
            when horas_reales <= horas_estimadas then 2
            when horas_reales <= horas_estimadas * 1.5 then 3
            else 4
          end as orden,
          count(*) as n
        from _tareas_panel
        where horas_estimadas > 0 and horas_reales is not null
        group by 1, 2
      ) s
      where label is not null
    ), '[]'::jsonb),
    'por_tipo_ot', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', tipo_ot, 'cantidad', n) order by n desc)
      from (select tipo_ot, count(*) as n from _tareas_panel group by tipo_ot) s
    ), '[]'::jsonb),
    'por_tipo_unidad', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', tipo_unidad, 'cantidad', n) order by n desc)
      from (select tipo_unidad, count(*) as n from _tareas_panel group by tipo_unidad) s
    ), '[]'::jsonb),
    'por_sistema', coalesce((
      select jsonb_agg(jsonb_build_object('sistema', sistema, 'cantidad', n) order by n desc)
      from (select sistema, count(*) as n from _tareas_panel group by sistema) s
    ), '[]'::jsonb),
    'detalle', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tecnico', tecnico, 'tipo_unidad', tipo_unidad, 'trabajo', trabajo,
        'sistema', sistema, 'horas_estimadas', horas_estimadas, 'horas_reales', horas_reales
      ))
      from (select * from _tareas_panel order by tecnico limit 500) s
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function get_panel_tecnicos(text, uuid[], text, text) to authenticated;
