-- =====================================================================
-- Fase 6a — Nuevos valores de enum. CORRER ESTE ARCHIVO SOLO, Y COMMIT,
-- ANTES de correr feature_fase6b.sql.
--
-- Postgres no permite usar un valor de enum recién agregado en la misma
-- transacción en la que se agregó (ALTER TYPE ... ADD VALUE). Si se pega
-- todo junto en un solo Run del SQL Editor, tira "unsafe use of new
-- value of enum type". Por eso va en un archivo aparte.
-- =====================================================================

alter type rol_usuario add value if not exists 'jefe_taller';
alter type estado_novedad add value if not exists 'Aprobada';
alter type estado_novedad add value if not exists 'Rechazada';
