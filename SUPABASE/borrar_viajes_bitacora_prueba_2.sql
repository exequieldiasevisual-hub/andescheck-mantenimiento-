-- =====================================================================
-- Borra los dos viajes de prueba de Bitácora, por id exacto (confirmados
-- con el diagnóstico: "Mxa → Mza" AG101ZD y "base → atamisque" AF558KX,
-- ambos Aprobados). bitacora_gastos tiene "on delete cascade" contra
-- bitacora_viajes, así que sus gastos se borran solos con cada viaje.
-- =====================================================================

delete from bitacora_viajes
where id in (
  '902fc796-9570-41c1-873b-148d4d28e1e1', -- Mxa → Mza, AG101ZD
  '7135eb53-f9fd-40b8-8e2a-b6b15205f0eb'   -- base → atamisque, AF558KX
)
returning id, origen, destino, fecha;
