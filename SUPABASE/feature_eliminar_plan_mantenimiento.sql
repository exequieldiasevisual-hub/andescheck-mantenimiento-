-- =====================================================================
-- Eliminar (dar de baja) un plan de mantenimiento. Baja lógica (activo =
-- false), igual patrón que unidades/catálogo — no se borra la fila para
-- no romper el historial ni las rutinas ya materializadas desde este
-- plan (rutinas_mantenimiento.id_plan_origen sigue apuntando a él).
-- =====================================================================

create or replace function eliminar_plan_mantenimiento(p_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_id_actualizado uuid;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para eliminar planes de mantenimiento');
  end if;

  update planes_mantenimiento
     set activo = false
   where id = p_id and empresa_id = v_empresa
   returning id into v_id_actualizado;

  if v_id_actualizado is null then
    return jsonb_build_object('ok', false, 'msg', 'Plan no encontrado');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function eliminar_plan_mantenimiento(uuid) to authenticated;
