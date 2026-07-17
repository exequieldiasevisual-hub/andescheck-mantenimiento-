-- Motivo de pausa de una tarea (texto libre elegido de un catálogo
-- configurable en Configuración > General, sección 'motivos_pausa' —
-- mismo patrón genérico que tipos_mision/tipos_novedad en la tabla
-- configuracion, no requiere tabla propia).
--
-- Correr DESPUÉS de fix_estado_tarea_pausada_enum.sql.

alter table ot_tareas add column if not exists motivo_pausa text;
