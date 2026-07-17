-- ==== Reporte mensual de costos ====
-- Agrega los costos de un mes por centro de costo, unidad y tipo,
-- con el total del mes anterior para comparar.

create or replace function get_reporte_costos(p_mes text)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_desde date;
  v_hasta date;
  v_desde_ant date;
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
  v_desde_ant := v_desde - interval '1 month';

  return jsonb_build_object(
    'ok', true,
    'mes', p_mes,
    'total', coalesce((
      select sum(c.monto) from costos c
      join ot_cabecera ot on ot.id = c.id_ot
      where ot.empresa_id = v_empresa and c.fecha >= v_desde and c.fecha < v_hasta
    ), 0),
    'total_mes_anterior', coalesce((
      select sum(c.monto) from costos c
      join ot_cabecera ot on ot.id = c.id_ot
      where ot.empresa_id = v_empresa and c.fecha >= v_desde_ant and c.fecha < v_desde
    ), 0),
    'por_centro', coalesce((
      select jsonb_agg(jsonb_build_object('centro', centro, 'total', total) order by total desc)
      from (
        select coalesce(u.centro_costo, 'Sin centro') as centro, sum(c.monto) as total
        from costos c
        join ot_cabecera ot on ot.id = c.id_ot
        join unidades u on u.id = ot.id_unidad
        where ot.empresa_id = v_empresa and c.fecha >= v_desde and c.fecha < v_hasta
        group by coalesce(u.centro_costo, 'Sin centro')
      ) s
    ), '[]'::jsonb),
    'por_unidad', coalesce((
      select jsonb_agg(jsonb_build_object('unidad', unidad, 'patente', patente, 'total', total) order by total desc)
      from (
        select u.descripcion as unidad, u.patente_serie as patente, sum(c.monto) as total
        from costos c
        join ot_cabecera ot on ot.id = c.id_ot
        join unidades u on u.id = ot.id_unidad
        where ot.empresa_id = v_empresa and c.fecha >= v_desde and c.fecha < v_hasta
        group by u.descripcion, u.patente_serie
      ) s
    ), '[]'::jsonb),
    'por_tipo', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', tipo, 'total', total) order by total desc)
      from (
        select coalesce(c.tipo, 'Sin clasificar') as tipo, sum(c.monto) as total
        from costos c
        join ot_cabecera ot on ot.id = c.id_ot
        where ot.empresa_id = v_empresa and c.fecha >= v_desde and c.fecha < v_hasta
        group by coalesce(c.tipo, 'Sin clasificar')
      ) s
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function get_reporte_costos(text) to authenticated;
