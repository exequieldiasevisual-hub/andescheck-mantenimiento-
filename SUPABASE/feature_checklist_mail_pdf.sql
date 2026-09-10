-- =====================================================================
-- Envío automático por mail (PDF) al completar un checklist. Los
-- destinatarios se configuran en Configuración → General → "Destinatarios
-- de mail — Checklists" (sección de configuracion "checklist_destinatarios_mail").
--
-- Esta función solo arma y devuelve los datos — el PDF y el envío por
-- Resend se hacen en app/api/enviar-checklist-mail.js (Vercel), no acá,
-- porque Postgres no puede generar PDFs. El backend serverless llama a
-- esta RPC (pasando el JWT del usuario) para obtener todo lo necesario.
-- =====================================================================

create or replace function get_checklist_para_pdf(p_id_ejecucion uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_ejecucion checklist_ejecuciones%rowtype;
begin
  select * into v_ejecucion
  from checklist_ejecuciones
  where id = p_id_ejecucion and empresa_id = v_empresa;

  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Checklist no encontrado');
  end if;

  return jsonb_build_object(
    'ok', true,
    'empresa', (select jsonb_build_object('razon_social', razon_social, 'logo_url', logo_url) from empresas where id = v_empresa),
    'unidad', (select jsonb_build_object('descripcion', descripcion, 'patente_serie', patente_serie) from unidades where id = v_ejecucion.id_unidad),
    'plantilla', (select jsonb_build_object('nombre', nombre) from checklist_plantillas where id = v_ejecucion.id_plantilla),
    'ejecucion', jsonb_build_object(
      'fecha', v_ejecucion.fecha,
      'usuario_nombre', (select nombre from usuarios where id = v_ejecucion.usuario_carga),
      'ubicacion_url', v_ejecucion.ubicacion_url
    ),
    'respuestas', coalesce((
      select jsonb_agg(jsonb_build_object('pregunta', i.pregunta, 'respuesta', r.respuesta) order by i.orden)
      from checklist_respuestas r
      join checklist_items i on i.id = r.id_item
      where r.id_ejecucion = p_id_ejecucion
    ), '[]'::jsonb),
    'destinatarios', coalesce((
      select jsonb_agg(clave)
      from configuracion
      where empresa_id = v_empresa and seccion = 'checklist_destinatarios_mail'
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function get_checklist_para_pdf(uuid) to authenticated;
