-- =====================================================================
-- Enviar OT por mail — sin Edge Function, mismo motivo que
-- crear_usuario_admin: evita el problema de CORS de verify_jwt=true en
-- el gateway de Edge Functions. Acá Postgres llama directo a la API de
-- Resend con pg_net (server-to-server, nunca pasa por el navegador).
--
-- Requiere UNA VEZ, antes de usar esto: guardar tu API key de Resend en
-- Vault. Corré esto reemplazando 'TU_API_KEY_DE_RESEND':
--
--   select vault.create_secret('TU_API_KEY_DE_RESEND', 'resend_api_key');
--
-- (Conseguí la key gratis en https://resend.com — plan free permite
-- 100 mails/día / 3000/mes, alcanza de sobra para arrancar.)
-- =====================================================================

create extension if not exists pg_net;

create or replace function enviar_ot_mail(p_id_ot uuid, p_destinatario text)
returns jsonb language plpgsql security definer as $$
declare
  v_datos jsonb;
  v_html text;
  v_resend_key text;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para enviar OT por mail');
  end if;

  if p_destinatario is null or p_destinatario !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'msg', 'Destinatario inválido');
  end if;

  -- get_ot_para_imprimir ya valida que la OT pertenezca a empresa_actual()
  v_datos := get_ot_para_imprimir(p_id_ot);
  if not (v_datos->>'ok')::boolean then
    return jsonb_build_object('ok', false, 'msg', coalesce(v_datos->>'msg', 'OT no encontrada'));
  end if;

  select decrypted_secret into v_resend_key
    from vault.decrypted_secrets where name = 'resend_api_key';

  if v_resend_key is null then
    return jsonb_build_object('ok', false, 'msg',
      'Falta configurar la clave de Resend — corré: select vault.create_secret(''tu_key'', ''resend_api_key'');');
  end if;

  v_html :=
    '<h2>' || coalesce(v_datos->'empresa'->>'razon_social', 'AndesCheck') || ' — Orden de Trabajo ' ||
      (v_datos->'ot'->>'numero_ot') || '</h2>' ||
    '<p><b>Unidad:</b> ' || coalesce(v_datos->'unidad'->>'descripcion', '') ||
      ' (' || coalesce(v_datos->'unidad'->>'patente_serie', '') || ')</p>' ||
    '<p><b>Estado:</b> ' || coalesce(v_datos->'ot'->>'estado', '') || '</p>' ||
    '<p><b>Descripción:</b> ' || coalesce(v_datos->'ot'->>'descripcion', '') || '</p>' ||
    '<p><b>Costo total:</b> $' || coalesce(v_datos->>'total_costos', '0') || '</p>';

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_resend_key, 'Content-Type', 'application/json'),
    body := jsonb_build_object(
      'from', 'noreply@andescheck.app',
      'to', jsonb_build_array(p_destinatario),
      'subject', 'OT ' || (v_datos->'ot'->>'numero_ot') || ' — ' || coalesce(v_datos->'empresa'->>'razon_social', 'AndesCheck'),
      'html', v_html
    )
  );

  -- pg_net es asíncrono (encola el request); no bloqueamos esperando la
  -- respuesta de Resend. Si la key está mal o Resend rechaza el envío,
  -- el error queda en net._http_response, no acá.
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function enviar_ot_mail(uuid, text) to authenticated;
