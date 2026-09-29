-- =====================================================================
-- Limpia ítems de checklist duplicados (bug: guardar la plantilla podía
-- duplicar todos los ítems si el borrado previo fallaba — ver
-- PlantillaChecklistModal.jsx). Corre sobre TODAS las plantillas, no
-- solo "Check list Autoelevador", por si pasó en más de una.
--
-- No borra historial: las respuestas ya cargadas (checklist_respuestas)
-- de un ítem duplicado se reasignan al ítem que se conserva, antes de
-- borrar el duplicado. Un checklist viejo puede seguir mostrando la
-- pregunta dos veces en su historial (ya se había cargado así), pero
-- de acá en más la plantilla queda con cada pregunta una sola vez.
-- Seguro de re-correr (si no hay duplicados, no cambia nada).
-- =====================================================================

-- 1) Reasignar respuestas de los ítems duplicados al que se conserva ---
with agrupado as (
  select id, id_plantilla,
    row_number() over (
      partition by id_plantilla, pregunta, tipo_respuesta,
        coalesce(dispara_novedad,false), coalesce(valor_disparador,''),
        coalesce(novedad_tipo,''), coalesce(novedad_descripcion,''), coalesce(foto_obligatoria,false)
      order by orden, id
    ) as rn,
    first_value(id) over (
      partition by id_plantilla, pregunta, tipo_respuesta,
        coalesce(dispara_novedad,false), coalesce(valor_disparador,''),
        coalesce(novedad_tipo,''), coalesce(novedad_descripcion,''), coalesce(foto_obligatoria,false)
      order by orden, id
    ) as id_canonico
  from checklist_items
)
update checklist_respuestas r
   set id_item = a.id_canonico
  from agrupado a
 where r.id_item = a.id and a.rn > 1;

-- 2) Borrar los ítems duplicados (ya sin respuestas apuntándoles) -----
with agrupado as (
  select id,
    row_number() over (
      partition by id_plantilla, pregunta, tipo_respuesta,
        coalesce(dispara_novedad,false), coalesce(valor_disparador,''),
        coalesce(novedad_tipo,''), coalesce(novedad_descripcion,''), coalesce(foto_obligatoria,false)
      order by orden, id
    ) as rn
  from checklist_items
)
delete from checklist_items where id in (select id from agrupado where rn > 1);

-- 3) Renumerar el orden dentro de cada plantilla, sin huecos ----------
with ordenado as (
  select id, row_number() over (partition by id_plantilla order by orden) as nuevo_orden
  from checklist_items
)
update checklist_items ci set orden = o.nuevo_orden
  from ordenado o where ci.id = o.id and ci.orden <> o.nuevo_orden;
