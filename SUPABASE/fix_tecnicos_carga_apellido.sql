-- get_tecnicos_con_carga() devolvía solo u.nombre; desde que usuarios tiene
-- nombre/apellido separados (feature_ux_mejoras.sql), el buscador de técnicos
-- mostraba solo el nombre de pila. Se concatena acá, el único lugar que arma
-- este listado.

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
    where u.empresa_id = v_empresa and u.rol = 'tecnico' and u.activo = true
  ), '[]'::jsonb);
end;
$$;
