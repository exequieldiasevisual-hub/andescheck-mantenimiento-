-- =====================================================================
-- Permite eliminar un gasto de la Bitácora. Solo administrador/supervisor
-- (el chofer no borra, si se equivocó lo edita), y solo mientras el
-- viaje sigue 'En_curso' — misma restricción que editar_gasto_bitacora.
-- =====================================================================

create or replace function eliminar_gasto_bitacora(p_id_gasto uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_viaje bitacora_viajes%rowtype;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para eliminar este gasto');
  end if;

  select bv.* into v_viaje
    from bitacora_gastos bg join bitacora_viajes bv on bv.id = bg.id_viaje
    where bg.id = p_id_gasto and bv.empresa_id = empresa_actual();

  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Gasto no encontrado');
  end if;

  if v_viaje.estado <> 'En_curso' then
    return jsonb_build_object('ok', false, 'msg', 'El viaje ya no está en curso');
  end if;

  delete from bitacora_gastos where id = p_id_gasto;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function eliminar_gasto_bitacora(uuid) to authenticated;
