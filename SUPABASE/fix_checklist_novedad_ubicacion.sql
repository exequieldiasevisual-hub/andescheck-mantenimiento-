-- =====================================================================
-- Fix: las novedades automaticas que genera un checklist (dispara_novedad,
-- tanto las inmediatas de si_no/estado como las de vencimiento por fecha)
-- no llevaban la geolocalizacion, a pesar de que el checklist si la
-- captura al ejecutarse. Se les agrega ubicacion_url = la del checklist.
-- =====================================================================

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

create or replace function generar_alertas_checklist_vencimiento()
returns void language plpgsql security definer as $$
declare
  v_r record;
  v_id_novedad uuid;
begin
  for v_r in
    select r.id as id_respuesta, r.respuesta, e.empresa_id, e.id_unidad, e.usuario_carga, e.ubicacion_url,
           i.novedad_tipo, i.novedad_descripcion, i.pregunta, u.descripcion as unidad_descripcion
    from checklist_respuestas r
    join checklist_items i on i.id = r.id_item
    join checklist_ejecuciones e on e.id = r.id_ejecucion
    join unidades u on u.id = e.id_unidad
    where i.tipo_respuesta = 'fecha'
      and i.dispara_novedad
      and i.valor_disparador ~ '^\d+$'
      and r.id_novedad_generada is null
      and r.respuesta ~ '^\d{4}-\d{2}-\d{2}$'
      and (r.respuesta::date - (i.valor_disparador::int)) <= current_date
  loop
    insert into novedades (empresa_id, id_unidad, descripcion, tipo, usuario_carga, ubicacion_url)
    values (
      v_r.empresa_id, v_r.id_unidad,
      coalesce(nullif(trim(v_r.novedad_descripcion), ''),
        v_r.pregunta || ' — vence ' || v_r.respuesta || ' (' || v_r.unidad_descripcion || ')'),
      v_r.novedad_tipo, v_r.usuario_carga, v_r.ubicacion_url
    )
    returning id into v_id_novedad;

    update checklist_respuestas set id_novedad_generada = v_id_novedad where id = v_r.id_respuesta;
  end loop;
end;
$$;
