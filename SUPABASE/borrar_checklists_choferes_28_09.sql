-- =====================================================================
-- Limpia los checklists diarios de chofer (plantillas marcadas
-- es_diario_chofer) cargados desde el 28/09/2026 en adelante, en
-- horario Argentina — igual criterio de fecha que usa el reporte de
-- cumplimiento (Reportes → Choferes).
--
--   1) Corré primero el SELECT: te muestra cuántas filas y cuáles son.
--   2) Si son las que esperás borrar, corré el DELETE de abajo.
-- checklist_respuestas se borra en cascada con cada checklist.
-- =====================================================================

-- 1) VERIFICAR ANTES DE BORRAR ------------------------------------------
select e.id, e.fecha at time zone 'America/Argentina/Buenos_Aires' as fecha_ar,
       u.patente_serie, u.descripcion as unidad, p.nombre as plantilla, us.nombre as cargado_por
from checklist_ejecuciones e
join unidades u on u.id = e.id_unidad
join checklist_plantillas p on p.id = e.id_plantilla
left join usuarios us on us.id = e.usuario_carga
where p.es_diario_chofer
  and (e.fecha at time zone 'America/Argentina/Buenos_Aires')::date >= '2026-09-28'
order by e.fecha;

-- 2) BORRAR (recién después de confirmar el SELECT de arriba) ----------
delete from checklist_ejecuciones e
using checklist_plantillas p
where e.id_plantilla = p.id
  and p.es_diario_chofer
  and (e.fecha at time zone 'America/Argentina/Buenos_Aires')::date >= '2026-09-28'
returning e.id, e.fecha;
