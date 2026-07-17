-- ==== Aplicar un plan de mantenimiento a TODAS las unidades que correspondan ====
-- aplicar_plan_a_unidad ya existe pero es unidad por unidad. Esto agrega la
-- versión masiva: recorre todas las unidades activas que matchean el alcance
-- del plan (tipo_unidad / mision / componente_tipo) y todavía no tienen una
-- rutina activa originada en ese plan, y se la crea.

create or replace function aplicar_plan_a_todas_las_unidades(p_id_plan uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_plan planes_mantenimiento%rowtype;
  v_unidad record;
  v_resultado jsonb;
  v_creadas int := 0;
  v_omitidas int := 0;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para gestionar rutinas de mantenimiento');
  end if;

  select * into v_plan from planes_mantenimiento where id = p_id_plan and empresa_id = v_empresa and activo = true;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Plan no encontrado');
  end if;

  for v_unidad in
    select u.id from unidades u
    where u.empresa_id = v_empresa and u.activo = true
      and (
        (v_plan.alcance = 'tipo_unidad' and u.tipo = v_plan.alcance_valor)
        or (v_plan.alcance = 'mision' and u.tipo_mision = v_plan.alcance_valor)
        or (v_plan.alcance = 'componente_tipo' and exists (
          select 1 from componentes_asignaciones ca
          join componentes_mantenibles c on c.id = ca.id_componente
          where ca.id_unidad = u.id and ca.hasta is null and c.tipo = v_plan.alcance_valor and c.activo = true
        ))
      )
      and not exists (
        select 1 from rutinas_mantenimiento r
        where r.id_plan_origen = p_id_plan and r.id_unidad = u.id and r.activo = true
      )
  loop
    v_resultado := aplicar_plan_a_unidad(p_id_plan, v_unidad.id);
    if (v_resultado->>'ok')::boolean then
      v_creadas := v_creadas + coalesce((v_resultado->>'creadas')::int, 0);
    else
      v_omitidas := v_omitidas + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'creadas', v_creadas, 'omitidas', v_omitidas);
end;
$$;

grant execute on function aplicar_plan_a_todas_las_unidades(uuid) to authenticated;
