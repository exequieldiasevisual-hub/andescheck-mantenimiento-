-- =====================================================================
-- Checklist: foto obligatoria cuando una respuesta genera una novedad.
--   * checklist_items.foto_obligatoria: se configura por ítem en la
--     plantilla (junto a "Generar novedad si la respuesta es...").
--   * checklist_respuestas.foto_url: foto de esa respuesta puntual.
--   * ejecutar_checklist: si la respuesta dispara novedad y el ítem exige
--     foto, rechaza el checklist entero (antes de guardar nada) cuando
--     falta la foto; la foto se adjunta a la respuesta y a la novedad.
-- Cada elemento de p_respuestas puede traer "foto_url". Mismo signature
-- que feature_checklist_km_hs.sql (correr después de ese).
-- =====================================================================

alter table checklist_items add column if not exists foto_obligatoria boolean not null default false;
alter table checklist_respuestas add column if not exists foto_url text;

create or replace function ejecutar_checklist(
  p_id_plantilla uuid, p_id_unidad uuid, p_respuestas jsonb, p_ubicacion_url text default null,
  p_firma_url text default null, p_fotos_urls text[] default null,
  p_km numeric default null, p_hs numeric default null
)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_id_usuario uuid;
  v_id_ejecucion uuid;
  v_respuesta jsonb;
  v_item record;
  v_plantilla checklist_plantillas%rowtype;
  v_unidad unidades%rowtype;
  v_id_novedad uuid;
  v_novedades_generadas int := 0;
  v_dispara boolean;
  v_foto text;
begin
  if rol_actual() not in ('administrador','supervisor','tecnico','chofer') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  select * into v_plantilla from checklist_plantillas where id = p_id_plantilla and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Plantilla no encontrada');
  end if;

  select * into v_unidad from unidades where id = p_id_unidad and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  -- Km / hs: lo que la plantilla no pide se ignora.
  if v_plantilla.km_modo = 'no' then p_km := null; end if;
  if v_plantilla.hs_modo = 'no' then p_hs := null; end if;

  if v_plantilla.km_modo = 'obligatorio' and p_km is null then
    return jsonb_build_object('ok', false, 'msg', 'El km es obligatorio en este checklist');
  end if;
  if v_plantilla.hs_modo = 'obligatorio' and p_hs is null then
    return jsonb_build_object('ok', false, 'msg', 'Las hs son obligatorias en este checklist');
  end if;
  if p_km is not null and v_unidad.km_actuales is not null and p_km < v_unidad.km_actuales then
    return jsonb_build_object('ok', false, 'msg', 'El km ingresado (' || p_km || ') no puede ser menor al último registrado (' || v_unidad.km_actuales || ')');
  end if;
  if p_hs is not null and v_unidad.hs_actuales is not null and p_hs < v_unidad.hs_actuales then
    return jsonb_build_object('ok', false, 'msg', 'Las hs ingresadas (' || p_hs || ') no pueden ser menores a las últimas registradas (' || v_unidad.hs_actuales || ')');
  end if;

  -- Foto obligatoria: se valida todo antes de insertar nada.
  for v_respuesta in select * from jsonb_array_elements(p_respuestas)
  loop
    select * into v_item from checklist_items
     where id = (v_respuesta->>'id_item')::uuid and id_plantilla = p_id_plantilla;
    if found and v_item.foto_obligatoria and v_item.tipo_respuesta <> 'fecha' and v_item.dispara_novedad
       and v_item.valor_disparador is not null
       and lower(trim(v_respuesta->>'respuesta')) = lower(trim(v_item.valor_disparador))
       and coalesce(trim(v_respuesta->>'foto_url'), '') = '' then
      return jsonb_build_object('ok', false, 'msg', 'La pregunta "' || v_item.pregunta || '" requiere una foto');
    end if;
  end loop;

  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();

  insert into checklist_ejecuciones (empresa_id, id_plantilla, id_unidad, usuario_carga, ubicacion_url, firma_url, fotos_urls)
  values (v_empresa, p_id_plantilla, p_id_unidad, v_id_usuario, p_ubicacion_url, p_firma_url, p_fotos_urls)
  returning id into v_id_ejecucion;

  if p_km is not null or p_hs is not null then
    update unidades set km_actuales = coalesce(p_km, km_actuales), hs_actuales = coalesce(p_hs, hs_actuales)
    where id = p_id_unidad;
  end if;

  for v_respuesta in select * from jsonb_array_elements(p_respuestas)
  loop
    select * into v_item from checklist_items
     where id = (v_respuesta->>'id_item')::uuid and id_plantilla = p_id_plantilla;

    if not found then
      continue;
    end if;

    v_id_novedad := null;
    v_foto := nullif(trim(coalesce(v_respuesta->>'foto_url', '')), '');
    v_dispara := v_item.tipo_respuesta <> 'fecha' and v_item.dispara_novedad and v_item.valor_disparador is not null
       and lower(trim(v_respuesta->>'respuesta')) = lower(trim(v_item.valor_disparador));

    if v_dispara then
      insert into novedades (empresa_id, id_unidad, descripcion, tipo, usuario_carga, ubicacion_url, foto_url)
      values (
        v_empresa, p_id_unidad,
        coalesce(nullif(trim(v_item.novedad_descripcion), ''), v_item.pregunta),
        v_item.novedad_tipo, v_id_usuario, p_ubicacion_url, v_foto
      )
      returning id into v_id_novedad;
      v_novedades_generadas := v_novedades_generadas + 1;
    end if;

    insert into checklist_respuestas (id_ejecucion, id_item, respuesta, id_novedad_generada, foto_url)
    values (v_id_ejecucion, v_item.id, v_respuesta->>'respuesta', v_id_novedad, v_foto);
  end loop;

  return jsonb_build_object('ok', true, 'id_ejecucion', v_id_ejecucion, 'novedades_generadas', v_novedades_generadas);
end;
$$;

grant execute on function ejecutar_checklist(uuid, uuid, jsonb, text, text, text[], numeric, numeric) to authenticated;
