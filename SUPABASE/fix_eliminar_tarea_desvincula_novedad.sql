-- ==== Fix: no se podían borrar tareas que resolvían una novedad ====
-- novedades.id_tarea_resolucion apunta a ot_tareas.id sin ON DELETE, así que
-- Postgres bloqueaba el DELETE con un error de clave foránea (la tarea
-- quedaba "atada" para siempre). Ahora, antes de borrar, si la tarea
-- resolvía una novedad, esa novedad vuelve a 'Aprobada' (pendiente de
-- resolver de nuevo) y se libera el vínculo — la tarea se puede borrar.

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
       set estado = 'Aprobada', id_ot_vinculada = null, id_tarea_resolucion = null
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
