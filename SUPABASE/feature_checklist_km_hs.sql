-- =====================================================================
-- Km / Hs en el checklist + regla "no se puede cargar un valor anterior
-- al registrado".
--   1) checklist_plantillas.km_modo / hs_modo: 'no' (no lo pide),
--      'opcional' o 'obligatorio' — se define al armar la plantilla.
--   2) ejecutar_checklist recibe p_km / p_hs: valida obligatoriedad y que
--      no sean menores al último valor de la unidad (igual se permite) y
--      actualiza la unidad (el trigger trg_log_km_hs deja el historial).
--   3) crear_carga_combustible aplica la misma regla al km/hs que trae.
-- Requiere fix_checklist_rol_chofer.sql ya corrido (mantiene el rol chofer).
-- =====================================================================

alter table checklist_plantillas add column if not exists km_modo text not null default 'no'
  check (km_modo in ('no','opcional','obligatorio'));
alter table checklist_plantillas add column if not exists hs_modo text not null default 'no'
  check (hs_modo in ('no','opcional','obligatorio'));

-- Cambia la firma (dos parámetros nuevos): se borra la anterior para no
-- dejar dos funciones con el mismo nombre.
drop function if exists ejecutar_checklist(uuid, uuid, jsonb, text, text, text[]);

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

    if v_item.tipo_respuesta <> 'fecha' and v_item.dispara_novedad and v_item.valor_disparador is not null
       and lower(trim(v_respuesta->>'respuesta')) = lower(trim(v_item.valor_disparador)) then
      insert into novedades (empresa_id, id_unidad, descripcion, tipo, usuario_carga, ubicacion_url)
      values (
        v_empresa, p_id_unidad,
        coalesce(nullif(trim(v_item.novedad_descripcion), ''), v_item.pregunta),
        v_item.novedad_tipo, v_id_usuario, p_ubicacion_url
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

grant execute on function ejecutar_checklist(uuid, uuid, jsonb, text, text, text[], numeric, numeric) to authenticated;

-- =====================================================================
-- crear_carga_combustible: mismo cuerpo que feature_combustible.sql, más la
-- regla de no aceptar km/hs menores a los registrados en la unidad.
-- =====================================================================
create or replace function crear_carga_combustible(
  p_id_unidad uuid, p_fecha timestamptz, p_origen text, p_estacion text,
  p_litros numeric, p_precio_unitario numeric, p_precio_total numeric,
  p_km_actuales numeric, p_hs_actuales numeric, p_comprobante_url text
)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_id_usuario uuid;
  v_id_carga uuid;
  v_unidad unidades%rowtype;
begin
  if rol_actual() not in ('administrador','supervisor','tecnico') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  select * into v_unidad from unidades where id = p_id_unidad and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  if p_litros is null or p_litros <= 0 then
    return jsonb_build_object('ok', false, 'msg', 'Los litros deben ser mayores a cero');
  end if;

  if p_origen not in ('Tanque propio','Estación externa') then
    return jsonb_build_object('ok', false, 'msg', 'Origen inválido');
  end if;

  if p_km_actuales is not null and v_unidad.km_actuales is not null and p_km_actuales < v_unidad.km_actuales then
    return jsonb_build_object('ok', false, 'msg', 'El km ingresado (' || p_km_actuales || ') no puede ser menor al último registrado (' || v_unidad.km_actuales || ')');
  end if;
  if p_hs_actuales is not null and v_unidad.hs_actuales is not null and p_hs_actuales < v_unidad.hs_actuales then
    return jsonb_build_object('ok', false, 'msg', 'Las hs ingresadas (' || p_hs_actuales || ') no pueden ser menores a las últimas registradas (' || v_unidad.hs_actuales || ')');
  end if;

  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();

  insert into combustible_cargas (
    empresa_id, id_unidad, fecha, origen, estacion, litros, precio_unitario,
    precio_total, km_actuales, hs_actuales, comprobante_url, usuario_carga
  ) values (
    v_empresa, p_id_unidad, coalesce(p_fecha, now()), p_origen, nullif(trim(coalesce(p_estacion,'')), ''), p_litros,
    p_precio_unitario, p_precio_total, p_km_actuales, p_hs_actuales, p_comprobante_url, v_id_usuario
  ) returning id into v_id_carga;

  if p_km_actuales is not null or p_hs_actuales is not null then
    update unidades set km_actuales = coalesce(p_km_actuales, km_actuales), hs_actuales = coalesce(p_hs_actuales, hs_actuales)
    where id = p_id_unidad;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id_carga);
end;
$$;

grant execute on function crear_carga_combustible(uuid, timestamptz, text, text, numeric, numeric, numeric, numeric, numeric, text) to authenticated;
