-- ==== Fix: convertir tarea a novedad debe sacar la tarea de la lista ====
-- Antes solo anotaba la conversión en observaciones y la tarea seguía viva
-- (Pendiente) en la OT. Ahora se elimina la tarea (igual que eliminar_tarea_ot)
-- y el rastro de la conversión queda en el timeline de la OT (ot_seguimiento),
-- no en un campo de una fila que va a desaparecer.

create or replace function convertir_tarea_a_novedad(p_id_tarea uuid, p_descripcion text)
returns jsonb language plpgsql security definer as $$
declare
  v_rol rol_usuario;
  v_empresa uuid;
  v_tarea ot_tareas%rowtype;
  v_ot ot_cabecera%rowtype;
  v_id_usuario uuid;
  v_id_novedad uuid;
begin
  v_rol := rol_actual();
  v_empresa := empresa_actual();

  if v_rol not in ('administrador','supervisor','tecnico') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  select * into v_tarea from ot_tareas where id = p_id_tarea;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Tarea no encontrada');
  end if;

  select * into v_ot from ot_cabecera where id = v_tarea.id_ot and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Tarea no encontrada');
  end if;

  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();

  insert into novedades (empresa_id, id_unidad, descripcion, tipo, usuario_carga)
  values (v_empresa, v_ot.id_unidad, p_descripcion, 'Derivada de OT', v_id_usuario)
  returning id into v_id_novedad;

  delete from ot_tareas where id = p_id_tarea;

  insert into ot_seguimiento (id_ot, descripcion, usuario)
  values (v_tarea.id_ot,
          '📋 Tarea convertida a novedad — "' || v_tarea.descripcion || '" (novedad: ' || v_id_novedad || ')',
          v_id_usuario);

  return jsonb_build_object('ok', true, 'id_novedad', v_id_novedad);
end;
$$;

grant execute on function convertir_tarea_a_novedad(uuid, text) to authenticated;
