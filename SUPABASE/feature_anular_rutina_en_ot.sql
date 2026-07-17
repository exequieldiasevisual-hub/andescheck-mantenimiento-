-- ==== Alternativa 1: borrar 1 tarea de una rutina no debe romper trazabilidad ====
-- Cuando una tarea pertenece a una rutina (id_rutina_origen), borrarla sola
-- rompía la trazabilidad del ciclo: la rutina igual se marcaba "Cumplida" al
-- cerrar la OT aunque faltara una tarea. Esta función da el segundo camino
-- (el primero, "convertir en novedad", ya existía): anular la rutina COMPLETA
-- en esta OT — borra sus N tareas y marca el cumplimiento como Anulada, para
-- que la rutina quede pendiente de reprogramarse entera, sin mentir sobre
-- qué se hizo.

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

  -- Cualquier novedad que alguna de estas tareas resolvía vuelve a Aprobada,
  -- igual que al borrar una tarea suelta (mismo motivo: no dejar una
  -- novedad "resuelta" apuntando a una tarea que ya no existe).
  update novedades
     set estado = 'Aprobada', id_ot_vinculada = null, id_tarea_resolucion = null
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

grant execute on function anular_rutina_en_ot(uuid, uuid, text) to authenticated;
