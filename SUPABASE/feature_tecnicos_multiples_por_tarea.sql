-- =====================================================================
-- Permite asignar varios técnicos a UNA misma tarea (antes era 1 solo,
-- columna tecnico_asignado uuid). Se reemplaza por tecnicos_asignados
-- uuid[], mismo patrón ya usado en ot_cabecera.tecnicos_asignados.
--
-- También recalcula get_tecnicos_con_carga() para basarse en esta
-- asignación por tarea (antes miraba solo ot_cabecera.tecnicos_asignados,
-- que ya no refleja quién trabaja qué tarea puntual) y para distinguir
-- la tarea EN CURSO (con minutos restantes estimados) de la próxima
-- tarea pendiente.
-- =====================================================================

alter table ot_tareas add column if not exists tecnicos_asignados uuid[] not null default '{}';

update ot_tareas set tecnicos_asignados = array[tecnico_asignado]
where tecnico_asignado is not null and tecnicos_asignados = '{}';

-- La policy vieja de update para técnico dependía de tecnico_asignado; el
-- técnico trabaja cualquier tarea de una OT en la que esté asignado a nivel
-- de OT (ot_cabecera.tecnicos_asignados), así que se redefine sin esa columna
-- antes de poder borrarla.
drop policy if exists "edicion_ot_tareas_tecnico" on ot_tareas;

create policy "edicion_ot_tareas_tecnico" on ot_tareas for update using (
  rol_actual() = 'tecnico'
  and exists (
    select 1 from ot_cabecera o
     where o.id = ot_tareas.id_ot
       and (select id from usuarios where auth_user_id = auth.uid()) = any(o.tecnicos_asignados)
  )
);

alter table ot_tareas drop column if exists tecnico_asignado;

create index if not exists idx_ot_tareas_tecnicos on ot_tareas using gin (tecnicos_asignados);

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
      'nombre', u.nombre,
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
