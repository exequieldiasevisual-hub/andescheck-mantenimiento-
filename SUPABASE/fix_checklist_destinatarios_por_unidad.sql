-- =====================================================================
-- Además de filtrar destinatarios de checklist por tipo de unidad, ahora
-- también se puede filtrar por unidades puntuales (multiselect en
-- Configuración → "Unidades puntuales") — así distintas unidades pueden
-- mandarle el checklist a distintas personas/empresas, sin depender de
-- que compartan el mismo tipo.
--
-- Se guarda en una sección nueva de la tabla genérica "configuracion"
-- (checklist_destinatarios_unidades, clave = mismo email, valor = ids de
-- unidad separados por coma) — no hace falta tabla nueva.
--
-- Un destinatario recibe el checklist si:
--   - no tiene tipos NI unidades marcadas (le llega todo), o
--   - el tipo de la unidad matchea alguno de sus tipos marcados, o
--   - la unidad puntual matchea alguna de sus unidades marcadas.
-- =====================================================================

create or replace function get_checklist_para_pdf(p_id_ejecucion uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_ejecucion checklist_ejecuciones%rowtype;
  v_tipo_unidad text;
begin
  select * into v_ejecucion
  from checklist_ejecuciones
  where id = p_id_ejecucion and empresa_id = v_empresa;

  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Checklist no encontrado');
  end if;

  select tipo into v_tipo_unidad from unidades where id = v_ejecucion.id_unidad;

  return jsonb_build_object(
    'ok', true,
    'empresa', (select jsonb_build_object('razon_social', razon_social, 'logo_url', logo_url) from empresas where id = v_empresa),
    'unidad', (select jsonb_build_object('descripcion', descripcion, 'patente_serie', patente_serie) from unidades where id = v_ejecucion.id_unidad),
    'plantilla', (select jsonb_build_object('nombre', nombre) from checklist_plantillas where id = v_ejecucion.id_plantilla),
    'ejecucion', jsonb_build_object(
      'fecha', v_ejecucion.fecha,
      'usuario_nombre', (select nombre from usuarios where id = v_ejecucion.usuario_carga),
      'ubicacion_url', v_ejecucion.ubicacion_url,
      'firma_url', v_ejecucion.firma_url,
      'fotos_urls', to_jsonb(v_ejecucion.fotos_urls)
    ),
    'respuestas', coalesce((
      select jsonb_agg(jsonb_build_object('pregunta', i.pregunta, 'respuesta', r.respuesta) order by i.orden)
      from checklist_respuestas r
      join checklist_items i on i.id = r.id_item
      where r.id_ejecucion = p_id_ejecucion
    ), '[]'::jsonb),
    'destinatarios', coalesce((
      select jsonb_agg(d.clave)
      from configuracion d
      left join configuracion u
        on u.empresa_id = d.empresa_id and u.seccion = 'checklist_destinatarios_unidades' and u.clave = d.clave
      where d.empresa_id = v_empresa and d.seccion = 'checklist_destinatarios_mail'
        and (
          (coalesce(trim(d.valor), '') = '' and coalesce(trim(u.valor), '') = '')
          or (v_tipo_unidad is not null and v_tipo_unidad = any(string_to_array(d.valor, ',')))
          or (v_ejecucion.id_unidad::text = any(string_to_array(u.valor, ',')))
        )
    ), '[]'::jsonb)
  );
end;
$$;
