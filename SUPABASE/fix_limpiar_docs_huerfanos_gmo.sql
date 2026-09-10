-- =====================================================================
-- Limpieza: en Documentos (empresa GMO Servicios y Logistica) hay filas
-- de unidad_docs cuyo id_unidad ya no apunta a ninguna unidad existente
-- (quedaron huérfanas, probablemente de pruebas). Como unidad_docs no
-- tiene empresa_id propio, la política de seguridad para poder borrar
-- exige matchear con una unidad real de tu empresa vía id_unidad — al no
-- existir esa unidad, el botón "Eliminar" no tiraba error pero tampoco
-- borraba nada (esos son los documentos que en la lista aparecen sin
-- nombre de unidad).
--
-- Primero corré este SELECT para confirmar cuáles son:
--
--   select id, numero, tipo, fecha_vigencia_hasta, id_unidad
--   from unidad_docs
--   where id_unidad not in (select id from unidades);
--
-- Si la lista coincide con los documentos "vencidos sin unidad" que
-- viste en la app, corré el DELETE de abajo.
-- =====================================================================

delete from unidad_docs
where id_unidad not in (select id from unidades);
