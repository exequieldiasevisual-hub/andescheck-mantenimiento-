-- =====================================================================
-- Nuevo rol "chofer" — carga sus propios viajes en la Bitácora, nada más
-- (sin acceso a costos, mantenimiento ni administración). Va en archivo
-- separado: Postgres no deja usar un valor de enum nuevo en la misma
-- transacción en la que se agregó.
-- =====================================================================

alter type rol_usuario add value if not exists 'chofer';
