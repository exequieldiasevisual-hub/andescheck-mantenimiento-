-- ==== Fix: la novedad/rutina liberada debe volver al principio del aviso ====
-- Al borrar una tarea o anular una rutina, la novedad que quedaba enganchada
-- vuelve a 'Aprobada' — pero seguía con su fecha de creación original, así
-- que en el banner "Esta unidad tiene pendientes" (ordenado por fecha
-- descendente) podía aparecer enterrada al final en vez de arriba de todo.
-- Ahora se le pisa la fecha a "ahora" al liberarla, para que quede primera.

create or replace function eliminar_tarea_ot(p_id_tarea uuid, p_motivo text)
returns jsonb language plpgsql security definer as $$
declare
  v_rol rol_usuario;
  v_empresa uuid;
  v_tarea ot_tareas%rowtype;
  v_ot ot_cabecera%rowtype;
  v_id_usuario uuid;
  v_novedad novedades%rowtype;
begin
  v_rol := rol_actual();
  v_empresa := empresa_actual();

  if v_rol not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para eliminar tareas');
  end if;

  if p_motivo is null or trim(p_motivo) = '' then
    return jsonb_build_object('ok', false, 'msg', 'El motivo de eliminación es obligatorio');
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

  select * into v_novedad from novedades where id_tarea_resolucion = p_id_tarea;
  if found then
    update novedades
       set estado = 'Aprobada', id_ot_vinculada = null, id_tarea_resolucion = null, fecha = now()
     where id = v_novedad.id;

    insert into ot_seguimiento (id_ot, descripcion, usuario)
    values (v_tarea.id_ot,
            '↩ Novedad "' || v_novedad.descripcion || '" vuelve a Aprobada — la tarea que la resolvía fue eliminada',
            v_id_usuario);
  end if;

  delete from ot_tareas where id = p_id_tarea;

  insert into ot_seguimiento (id_ot, descripcion, usuario)
  values (v_tarea.id_ot,
          '🗑 Tarea eliminada — Motivo: ' || trim(p_motivo) || ' (tarea: "' || v_tarea.descripcion || '")',
          v_id_usuario);

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function anular_rutina_en_ot(p_id_ot uuid, p_id_rutina uuid, p_motivo text)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_ot ot_cabecera%rowtype;
  v_rutina rutinas_mantenimiento%rowtype;
  v_id_usuario uuid;
  v_cantidad int;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para anular rutinas');
  end if;

  if p_motivo is null or trim(p_motivo) = '' then
    return jsonb_build_object('ok', false, 'msg', 'El motivo de la anulación es obligatorio');
  end if;

  select * into v_ot from ot_cabecera where id = p_id_ot and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'OT no encontrada');
  end if;

  select * into v_rutina from rutinas_mantenimiento where id = p_id_rutina and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Rutina no encontrada');
  end if;

  select count(*) into v_cantidad from ot_tareas where id_ot = p_id_ot and id_rutina_origen = p_id_rutina;
  if v_cantidad = 0 then
    return jsonb_build_object('ok', false, 'msg', 'Esta OT no tiene tareas de esa rutina');
  end if;

  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();

  update novedades
     set estado = 'Aprobada', id_ot_vinculada = null, id_tarea_resolucion = null, fecha = now()
   where id_tarea_resolucion in (select id from ot_tareas where id_ot = p_id_ot and id_rutina_origen = p_id_rutina);

  update rutina_cumplimientos
     set estado = 'Anulada', anulado_en = now(), observaciones = trim(p_motivo)
   where id_ot = p_id_ot and id_rutina = p_id_rutina and estado = 'Programada';

  delete from ot_tareas where id_ot = p_id_ot and id_rutina_origen = p_id_rutina;

  insert into ot_seguimiento (id_ot, descripcion, usuario)
  values (p_id_ot,
          '🗑 Rutina "' || v_rutina.descripcion || '" anulada en esta OT — Motivo: ' || trim(p_motivo) || ' (' || v_cantidad || ' tarea(s) eliminada(s))',
          v_id_usuario);

  return jsonb_build_object('ok', true);
end;
$$;
