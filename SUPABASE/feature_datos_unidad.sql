-- =====================================================================
-- Datos extra de la unidad al momento de la carga: configuración de
-- ejes, foto, peso y capacidad de carga declarada.
-- =====================================================================

alter table unidades add column if not exists config_ejes text;
alter table unidades add column if not exists peso_kg numeric(10,2);
alter table unidades add column if not exists capacidad_carga_declarada_kg numeric(10,2);
alter table unidades add column if not exists foto_url text;
alter table unidades add column if not exists numero_motor text;
alter table unidades add column if not exists numero_chasis text;
