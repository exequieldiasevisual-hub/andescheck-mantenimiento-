-- =====================================================================
-- Fix: eliminar un plan de mantenimiento ahora también pausa (activo =
-- false) todas las rutinas ya materializadas a partir de ese plan en
-- cualquier unidad — antes solo se sacaba el plan de la lista, pero las
-- rutinas seguían corriendo sueltas en cada unidad.
-- =====================================================================

create or replace function eliminar_plan_mantenimiento(p_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_id_actualizado uuid;
  v_id_usuario uuid;
  v_rutinas_pausadas int := 0;
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

  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();

  with pausadas as (
    update rutinas_mantenimiento
       set activo = false, motivo_pausa = 'Plan de mantenimiento eliminado', pausada_en = now(), pausada_por = v_id_usuario
     where id_plan_origen = p_id and empresa_id = v_empresa and activo = true
     returning id
  )
  select count(*) into v_rutinas_pausadas from pausadas;

  return jsonb_build_object('ok', true, 'rutinas_pausadas', v_rutinas_pausadas);
end;
$$;
