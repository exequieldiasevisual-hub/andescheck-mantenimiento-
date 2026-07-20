-- ==== Reporte mensual de técnicos ====
-- Por cada técnico activo, en el mes elegido: tareas completadas, horas
-- estimadas vs horas reales trabajadas, y novedades reportadas. También
-- incluye la carga actual (tareas pendientes ahora mismo, sin importar el
-- mes) para tener contexto de cuánto tiene encima en este momento.

create or replace function get_reporte_tecnicos(p_mes text)
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

  return jsonb_build_object(
    'ok', true,
    'mes', p_mes,
    'tecnicos', coalesce((
      with completadas as (
        select
          tec as id_tecnico,
          t.id as id_tarea,
          coalesce(ct.tiempo_estimado_hs, 0) as horas_estimadas,
          case when t.fecha_inicio is not null and t.fecha_fin is not null
            then extract(epoch from (t.fecha_fin - t.fecha_inicio)) / 3600 else 0 end as horas_reales
        from ot_tareas t
        join ot_cabecera ot on ot.id = t.id_ot
        cross join lateral unnest(t.tecnicos_asignados) as tec
        left join catalogo_trabajos ct on ct.id = t.id_catalogo
        where ot.empresa_id = v_empresa and t.estado = 'Completada'
          and t.fecha_fin >= v_desde and t.fecha_fin < v_hasta
      ),
      resumen_tareas as (
        select id_tecnico, count(*) as n, sum(horas_estimadas) as h_est, sum(horas_reales) as h_real
        from completadas group by id_tecnico
      ),
      resumen_novedades as (
        select usuario_carga as id_tecnico, count(*) as n
        from novedades
        where empresa_id = v_empresa and fecha >= v_desde and fecha < v_hasta
        group by usuario_carga
      ),
      carga_actual as (
        select tec as id_tecnico, count(*) as n
        from ot_tareas t
        join ot_cabecera ot on ot.id = t.id_ot
        cross join lateral unnest(t.tecnicos_asignados) as tec
        where ot.empresa_id = v_empresa and t.estado <> 'Completada'
          and ot.estado in ('Abierta','En_Curso')
        group by tec
      )
      select jsonb_agg(jsonb_build_object(
        'id', u.id,
        'nombre', u.nombre,
        'especialidad', tp.especialidad,
        'tareas_completadas', coalesce(rt.n, 0),
        'horas_estimadas', coalesce(round(rt.h_est::numeric, 1), 0),
        'horas_reales', coalesce(round(rt.h_real::numeric, 1), 0),
        'novedades_reportadas', coalesce(rn.n, 0),
        'tareas_pendientes_ahora', coalesce(ca.n, 0)
      ) order by u.nombre)
      from usuarios u
      left join tecnicos_perfil tp on tp.id_usuario = u.id
      left join resumen_tareas rt on rt.id_tecnico = u.id
      left join resumen_novedades rn on rn.id_tecnico = u.id
      left join carga_actual ca on ca.id_tecnico = u.id
      where u.empresa_id = v_empresa and u.rol = 'tecnico' and u.activo = true
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function get_reporte_tecnicos(text) to authenticated;
