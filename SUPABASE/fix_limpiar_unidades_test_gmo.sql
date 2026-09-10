-- =====================================================================
-- Limpieza: la empresa GMO Servicios y Logistica quedó con unidades de
-- prueba cargadas (probablemente de antes de entregarle la cuenta al
-- cliente real). Se dan de baja (activo = false) — mismo mecanismo que
-- el botón "Eliminar" de la página Activos, no se borran filas de la
-- base para no romper referencias de OTs/rutinas/checklists ya usados
-- en pruebas.
--
-- IMPORTANTE: antes de correr el UPDATE de abajo, corré primero este
-- SELECT para confirmar que la lista es exactamente la que querés dar
-- de baja (nada de unidades reales del cliente):
--
--   select descripcion, patente_serie
--   from unidades
--   where empresa_id = (select id from empresas where razon_social ilike '%GMO%' limit 1)
--     and activo = true
--     and (descripcion ilike '%test%' or descripcion ilike '%prueba%');
--
-- Si la lista se ve bien, corré el UPDATE de abajo. Si hay algo que no
-- debería estar (o falta algo, como los "PICK UP" repetidos si también
-- son de prueba), avisame y ajusto el filtro.
-- =====================================================================

update unidades
set activo = false
where empresa_id = (select id from empresas where razon_social ilike '%GMO%' limit 1)
  and activo = true
  and (descripcion ilike '%test%' or descripcion ilike '%prueba%');
