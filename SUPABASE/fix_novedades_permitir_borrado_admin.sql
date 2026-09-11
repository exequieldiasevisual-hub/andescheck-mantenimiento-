-- =====================================================================
-- Permitir al administrador eliminar novedades (hasta ahora solo se
-- podian crear/editar/aprobar/rechazar, no habia policy de delete).
-- =====================================================================

drop policy if exists "baja_novedades" on novedades;
create policy "baja_novedades" on novedades for delete using (
  empresa_id = empresa_actual() and rol_actual() = 'administrador'
);
