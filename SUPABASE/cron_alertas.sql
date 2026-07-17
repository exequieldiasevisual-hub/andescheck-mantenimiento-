-- =====================================================================
-- AndesCheck Mantenimiento — Alertas de preventivos (pg_cron)
-- Replica triggerDiario() → generarAlertasPreventivos() de gs.js.
-- Corre 1 vez por día para TODAS las empresas activas (no hay sesión de
-- usuario en un cron job, así que recorre empresas explícitamente en vez
-- de usar empresa_actual()).
-- =====================================================================

create extension if not exists pg_cron;

create or replace function generar_alertas_preventivos()
returns void language plpgsql security definer as $$
declare
  v_prev record;
begin
  for v_prev in
    select p.*, u.descripcion as unidad_descripcion, u.empresa_id
    from preventivos_calculado p
    join unidades u on u.id = p.id_unidad
    where p.activo = true
      and (p.estado_calculado = 'Vencido' or p.fecha_proxima <= current_date + interval '7 days')
      -- evita duplicar alerta si ya se generó una Pendiente para este preventivo
      and not exists (
        select 1 from alertas a
        where a.tipo = 'preventivo' and a.id_referencia = p.id and a.estado = 'Pendiente'
      )
  loop
    insert into alertas (empresa_id, tipo, id_referencia, descripcion, estado, link_wsp)
    values (
      v_prev.empresa_id,
      'preventivo',
      v_prev.id,
      case when v_prev.estado_calculado = 'Vencido'
        then 'Preventivo VENCIDO: ' || v_prev.descripcion || ' — ' || v_prev.unidad_descripcion
        else 'Preventivo próximo a vencer (7 días): ' || v_prev.descripcion || ' — ' || v_prev.unidad_descripcion
      end,
      'Pendiente',
      'https://wa.me/?text=' || replace(v_prev.descripcion || ' - ' || v_prev.unidad_descripcion, ' ', '%20')
    );
  end loop;
end;
$$;

-- Corre todos los días a las 07:00 (hora servidor, normalmente UTC — ajustar offset si hace falta)
select cron.schedule('alertas-preventivos-diario', '0 7 * * *', $$select generar_alertas_preventivos()$$);
