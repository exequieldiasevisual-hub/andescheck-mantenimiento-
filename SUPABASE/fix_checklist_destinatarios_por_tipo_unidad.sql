-- =====================================================================
-- Los destinatarios de mail de checklists ahora pueden filtrarse por
-- tipo de unidad (multiselect en Configuración). El "valor" de cada fila
-- de configuracion (seccion checklist_destinatarios_mail) pasa a guardar
-- los tipos de unidad separados por coma en vez del email repetido —
-- vacío significa "todas las unidades".
--
-- Los destinatarios ya cargados antes de este cambio tenían valor=email
-- (sin sentido como filtro) — se resetean a vacío para que sigan
-- recibiendo todo hasta que se configuren tipos puntuales.
-- =====================================================================

update configuracion
set valor = ''
where seccion = 'checklist_destinatarios_mail'
  and valor = clave;

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
      select jsonb_agg(clave)
      from configuracion
      where empresa_id = v_empresa and seccion = 'checklist_destinatarios_mail'
        and (
          coalesce(trim(valor), '') = ''
          or (v_tipo_unidad is not null and v_tipo_unidad = any(string_to_array(valor, ',')))
        )
    ), '[]'::jsonb)
  );
end;
$$;
