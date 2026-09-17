-- =====================================================================
-- Corrige actualizar_km_hs_masivo: los mensajes de error de km/hs
-- regresivo mostraban la descripción (tipo de unidad) en vez de la
-- patente, que es lo que realmente identifica a la unidad para el
-- usuario al revisar una carga masiva con varias unidades del mismo tipo.
-- =====================================================================

create or replace function actualizar_km_hs_masivo(p_datos jsonb)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_item jsonb;
  v_unidad unidades%rowtype;
  v_km numeric;
  v_hs numeric;
  v_actualizadas int := 0;
  v_errores text[] := '{}';
  v_etiqueta text;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para actualizar km/hs');
  end if;

  if p_datos is null or jsonb_typeof(p_datos) <> 'array' then
    return jsonb_build_object('ok', false, 'msg', 'Datos inválidos');
  end if;

  for v_item in select * from jsonb_array_elements(p_datos) loop
    select * into v_unidad from unidades
     where id = (v_item->>'id_unidad')::uuid and empresa_id = v_empresa;
    if not found then
      v_errores := array_append(v_errores, 'Unidad no encontrada: ' || coalesce(v_item->>'id_unidad', '?'));
      continue;
    end if;

    v_etiqueta := coalesce(v_unidad.patente_serie, v_unidad.descripcion);

    v_km := nullif(v_item->>'km', '')::numeric;
    v_hs := nullif(v_item->>'hs', '')::numeric;

    if v_km is null and v_hs is null then
      continue;
    end if;

    if v_km is not null and v_unidad.km_actuales is not null and v_km < v_unidad.km_actuales then
      v_errores := array_append(v_errores, v_etiqueta || ': km ' || v_km || ' menor al último registrado (' || v_unidad.km_actuales || ')');
      continue;
    end if;

    if v_hs is not null and v_unidad.hs_actuales is not null and v_hs < v_unidad.hs_actuales then
      v_errores := array_append(v_errores, v_etiqueta || ': hs ' || v_hs || ' menor a las últimas registradas (' || v_unidad.hs_actuales || ')');
      continue;
    end if;

    update unidades
       set km_actuales = coalesce(v_km, km_actuales),
           hs_actuales = coalesce(v_hs, hs_actuales)
     where id = v_unidad.id;

    v_actualizadas := v_actualizadas + 1;
  end loop;

  return jsonb_build_object('ok', true, 'actualizadas', v_actualizadas, 'errores', to_jsonb(v_errores));
end;
$$;
