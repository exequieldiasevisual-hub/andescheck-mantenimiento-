-- =====================================================================
-- Fix: no se podía eliminar una novedad si un checklist la había generado
-- automáticamente (dispara_novedad) — la foreign key bloqueaba el borrado
-- en vez de simplemente desvincularla. Se cambia a "on delete set null":
-- el checklist y su respuesta quedan intactos, solo se limpia la referencia.
-- =====================================================================

alter table checklist_respuestas drop constraint if exists checklist_respuestas_id_novedad_generada_fkey;
alter table checklist_respuestas add constraint checklist_respuestas_id_novedad_generada_fkey
  foreign key (id_novedad_generada) references novedades(id) on delete set null;
