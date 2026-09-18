-- =====================================================================
-- Suma bitacora_viaticos_adicionales a la publicación de Realtime, para
-- que una carga adicional de viáticos también refresque la Bitácora en
-- vivo en las demás pantallas abiertas.
-- =====================================================================

do $$
begin
  alter publication supabase_realtime add table bitacora_viaticos_adicionales;
exception
  when duplicate_object then null;
end $$;
