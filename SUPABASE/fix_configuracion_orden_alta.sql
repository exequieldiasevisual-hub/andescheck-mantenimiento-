-- =====================================================================
-- Fix: al agregar un ítem nuevo en Configuración (tipos de unidad,
-- centros de costo, etc.) aparecía en el medio de la lista por el orden
-- alfabético de "clave" — el placeholder "NUEVO_1"/"NUEVO_2" quedaba
-- perdido hasta renombrarlo. Se agrega fecha de alta para poder mostrar
-- los más nuevos primero.
-- =====================================================================

alter table configuracion add column if not exists creado_en timestamptz not null default now();
