-- =====================================================================
-- El chofer ahora también realiza checklists (escanea la patente y se le
-- abre el checklist de esa unidad):
--   1) ejecutar_checklist acepta el rol 'chofer' (mismo cuerpo que
--      fix_checklist_novedad_ubicacion.sql, solo cambia el chequeo de rol).
--   2) El chofer solo ve el historial de los checklists que él cargó
--      (el resto de los roles sigue viendo todos los de la empresa).
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
  if rol_actual() not in ('administrador','supervisor','tecnico','chofer') then
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

drop policy if exists "lectura_checklist_ejecuciones" on checklist_ejecuciones;
create policy "lectura_checklist_ejecuciones" on checklist_ejecuciones for select using (
  empresa_id = empresa_actual()
  and (
    rol_actual() <> 'chofer'
    or usuario_carga = (select id from usuarios where auth_user_id = auth.uid())
  )
);
