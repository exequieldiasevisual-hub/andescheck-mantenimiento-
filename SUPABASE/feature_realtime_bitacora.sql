-- =====================================================================
-- Habilita Supabase Realtime en bitacora_viajes para que la Bitácora se
-- actualice sola en todas las pantallas abiertas (ej: el administrador
-- ve al instante cuando un chofer rinde un viaje, sin recargar).
-- `alter publication ... add table` no admite "if not exists", así que
-- se envuelve en un bloque que ignora el error si ya estaba agregada.
-- =====================================================================

do $$
begin
  alter publication supabase_realtime add table bitacora_viajes;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table bitacora_gastos;
exception
  when duplicate_object then null;
end $$;
