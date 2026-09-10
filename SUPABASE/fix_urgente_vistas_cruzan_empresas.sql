-- =====================================================================
-- FIX DE SEGURIDAD URGENTE — CORRER YA.
--
-- Las vistas se crean con los permisos del rol que las creó (el SQL
-- Editor de Supabase corre como "postgres", un rol que tiene privilegio
-- BYPASSRLS). Por default, Postgres evalúa las políticas de seguridad
-- (RLS) de una vista usando los permisos del DUEÑO de la vista, no de
-- quien la consulta — como el dueño puede saltarse RLS, la vista
-- devuelve TODAS las filas de TODAS las empresas a cualquiera que la
-- consulte, sin importar su empresa.
--
-- Esto afectaba a 3 vistas usadas en toda la app (preventivos_calculado
-- ya no existe, la reemplazó el sistema de rutinas v2):
--   - rutinas_calculado    (Rutinas de Mantenimiento)
--   - unidad_docs_calculado (Documentos)
--   - herramientas_calculado (Herramientas/pañol)
--
-- Detectado porque un usuario de la empresa GMO veía unidades de prueba
-- que en realidad pertenecen a la empresa AndesCheck.
--
-- La vista ot_lista ya tenía el fix (security_invoker = on) de antes —
-- ese es el patrón correcto que faltaba generalizar. security_invoker
-- hace que la vista evalúe RLS con los permisos de quien la CONSULTA,
-- no de quien la creó — no cambia la lógica de la vista, solo el modo
-- en que se evalúan los permisos. Requiere Postgres 15+ (Supabase ya
-- corre en una versión compatible).
-- =====================================================================

alter view rutinas_calculado set (security_invoker = on);
alter view unidad_docs_calculado set (security_invoker = on);
alter view herramientas_calculado set (security_invoker = on);
