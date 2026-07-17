-- Agrega ciudad de la unidad a la vista ot_lista (faltaba para el filtro
-- por ciudad en el listado de OT). Postgres solo permite agregar columnas
-- AL FINAL en un CREATE OR REPLACE VIEW — por eso unidad_ciudad va última,
-- no en el medio junto a las demás columnas de unidad.
create or replace view ot_lista with (security_invoker = on) as
select
  o.*,
  u.descripcion   as unidad_descripcion,
  u.patente_serie as unidad_patente,
  u.centro_costo  as unidad_centro_costo,
  u.tipo          as unidad_tipo,
  coalesce(t.total, 0)       as tareas_total,
  coalesce(t.completadas, 0) as tareas_completadas,
  case
    when o.estado in ('Abierta','En_Curso')
         and o.fecha_est_cierre is not null
         and o.fecha_est_cierre < now()
      then 'Vencida'
    else o.estado::text
  end as estado_calculado,
  (coalesce(t.total, 0) > 0
   and coalesce(t.completadas, 0) = t.total
   and o.estado in ('Abierta','En_Curso')) as listo_cierre,
  u.ciudad as unidad_ciudad
from ot_cabecera o
left join unidades u on u.id = o.id_unidad
left join (
  select id_ot,
         count(*)                                    as total,
         count(*) filter (where estado = 'Completada') as completadas
  from ot_tareas
  group by id_ot
) t on t.id_ot = o.id;

grant select on ot_lista to authenticated;
