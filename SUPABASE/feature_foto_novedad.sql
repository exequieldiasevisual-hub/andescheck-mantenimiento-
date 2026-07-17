-- ==== Foto opcional al crear una novedad ====
-- Reutiliza el bucket 'ot-fotos' (la policy de storage solo exige que el
-- primer segmento del path sea la empresa, no que exista una OT) — no hace
-- falta un bucket nuevo.

alter table novedades add column if not exists foto_url text;
