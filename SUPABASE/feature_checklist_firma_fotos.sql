-- =====================================================================
-- Firma digital (obligatoria) y fotos generales (opcionales) al completar
-- un checklist. Reutiliza los buckets existentes: ot-firmas (firma) y
-- ot-fotos (fotos), con el mismo esquema de path <empresa_id>/... que
-- exige la policy de storage.
-- =====================================================================

alter table checklist_ejecuciones add column if not exists firma_url text;
alter table checklist_ejecuciones add column if not exists fotos_urls text[];

drop function if exists ejecutar_checklist(uuid, uuid, jsonb, text);

create or replace function ejecutar_checklist(
  p_id_plantilla uuid, p_id_unidad uuid, p_respuestas jsonb, p_ubicacion_url text default null,
  p_firma_url text default null, p_fotos_urls text[] default null
)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_id_usuario uuid;
  v_id_ejecucion uuid;
  v_respuesta jsonb;
  v_item record;
  v_id_novedad uuid;
  v_novedades_generadas int := 0;
begin
  if rol_actual() not in ('administrador','supervisor','tecnico') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  if not exists (select 1 from checklist_plantillas where id = p_id_plantilla and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Plantilla no encontrada');
  end if;

  if not exists (select 1 from unidades where id = p_id_unidad and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();

  insert into checklist_ejecuciones (empresa_id, id_plantilla, id_unidad, usuario_carga, ubicacion_url, firma_url, fotos_urls)
  values (v_empresa, p_id_plantilla, p_id_unidad, v_id_usuario, p_ubicacion_url, p_firma_url, p_fotos_urls)
  returning id into v_id_ejecucion;

  for v_respuesta in select * from jsonb_array_elements(p_respuestas)
  loop
    select * into v_item from checklist_items
     where id = (v_respuesta->>'id_item')::uuid and id_plantilla = p_id_plantilla;

    if not found then
      continue;
    end if;

    v_id_novedad := null;

    if v_item.dispara_novedad and v_item.valor_disparador is not null
       and lower(trim(v_respuesta->>'respuesta')) = lower(trim(v_item.valor_disparador)) then
      insert into novedades (empresa_id, id_unidad, descripcion, tipo, usuario_carga)
      values (
        v_empresa, p_id_unidad,
        coalesce(nullif(trim(v_item.novedad_descripcion), ''), v_item.pregunta),
        v_item.novedad_tipo, v_id_usuario
      )
      returning id into v_id_novedad;
      v_novedades_generadas := v_novedades_generadas + 1;
    end if;

    insert into checklist_respuestas (id_ejecucion, id_item, respuesta, id_novedad_generada)
    values (v_id_ejecucion, v_item.id, v_respuesta->>'respuesta', v_id_novedad);
  end loop;

  return jsonb_build_object('ok', true, 'id_ejecucion', v_id_ejecucion, 'novedades_generadas', v_novedades_generadas);
end;
$$;

grant execute on function ejecutar_checklist(uuid, uuid, jsonb, text, text, text[]) to authenticated;

-- get_checklist_para_pdf: sumar firma_url y fotos_urls al detalle que arma el PDF.
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
    ), '[]'::jsonb)
  );
end;
$$;
