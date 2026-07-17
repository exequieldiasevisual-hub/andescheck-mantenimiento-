-- ==== Cambio de misión con impacto previo ====
-- get_impacto_cambio_mision es de solo lectura: muestra la vista previa antes de confirmar.
-- cambiar_mision_con_decisiones aplica el cambio con una decisión explícita por cada rutina pendiente de la misión anterior.
-- Nunca se cierra ninguna rutina en silencio.

create or replace function get_impacto_cambio_mision(p_id_unidad uuid, p_nueva_mision text)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_unidad unidades%rowtype;
begin
  select * into v_unidad from unidades where id = p_id_unidad and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  return jsonb_build_object(
    'ok', true,
    'mision_actual', v_unidad.tipo_mision,
    'mision_nueva', p_nueva_mision,
    'planes_a_desactivar', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id_rutina', r.id, 'descripcion', r.descripcion, 'estado_calculado', rc.estado_calculado,
        'tiene_programada', exists (select 1 from rutina_cumplimientos cu where cu.id_rutina = r.id and cu.estado = 'Programada')
      ))
      from rutinas_mantenimiento r
      join rutinas_calculado rc on rc.id = r.id
      join planes_mantenimiento p on p.id = r.id_plan_origen
      where r.id_unidad = p_id_unidad and r.activo = true
        and p.alcance = 'mision' and p.alcance_valor = v_unidad.tipo_mision
    ), '[]'::jsonb),
    'planes_a_activar_sugeridos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'descripcion', p.descripcion))
      from planes_mantenimiento p
      where p.empresa_id = v_empresa and p.activo = true
        and p.alcance = 'mision' and p.alcance_valor = p_nueva_mision
        and not exists (
          select 1 from rutinas_mantenimiento r2
          where r2.id_plan_origen = p.id and r2.id_unidad = p_id_unidad and r2.activo = true
        )
    ), '[]'::jsonb),
    'continuan_activos', coalesce((
      select count(*) from rutinas_mantenimiento r
      where r.id_unidad = p_id_unidad and r.activo = true
        and (r.id_plan_origen is null or not exists (
          select 1 from planes_mantenimiento p where p.id = r.id_plan_origen and p.alcance = 'mision' and p.alcance_valor = v_unidad.tipo_mision
        ))
    ), 0),
    'pendientes', coalesce((
      select jsonb_agg(jsonb_build_object('id_rutina', r.id, 'descripcion', r.descripcion, 'estado_calculado', rc.estado_calculado))
      from rutinas_mantenimiento r
      join rutinas_calculado rc on rc.id = r.id
      join planes_mantenimiento p on p.id = r.id_plan_origen
      where r.id_unidad = p_id_unidad and r.activo = true
        and p.alcance = 'mision' and p.alcance_valor = v_unidad.tipo_mision
        and rc.estado_calculado in ('Vencida', 'Proxima')
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function get_impacto_cambio_mision(uuid, text) to authenticated;

create or replace function cambiar_mision_con_decisiones(p_id_unidad uuid, p_nueva_mision text, p_decisiones jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_resultado jsonb;
  v_decision jsonb;
  v_id_rutina uuid;
  v_tipo_decision text;
  v_motivo text;
  v_id_plan_transferir uuid;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para cambiar la misión de la unidad');
  end if;

  if not exists (select 1 from unidades where id = p_id_unidad and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  for v_decision in select * from jsonb_array_elements(p_decisiones) loop
    v_tipo_decision := v_decision->>'decision';
    if v_tipo_decision not in ('mantener','transferir','cancelar','absorbida') then
      return jsonb_build_object('ok', false, 'msg', 'Decisión inválida para una rutina pendiente');
    end if;
    if v_tipo_decision = 'cancelar' and (v_decision->>'motivo' is null or trim(v_decision->>'motivo') = '') then
      return jsonb_build_object('ok', false, 'msg', 'El motivo es obligatorio para cancelar una rutina pendiente');
    end if;
  end loop;

  v_resultado := cambiar_mision(p_id_unidad, p_nueva_mision);
  if not (v_resultado->>'ok')::boolean then
    return v_resultado;
  end if;

  for v_decision in select * from jsonb_array_elements(p_decisiones) loop
    v_id_rutina := (v_decision->>'id_rutina')::uuid;
    v_tipo_decision := v_decision->>'decision';
    v_motivo := v_decision->>'motivo';
    v_id_plan_transferir := nullif(v_decision->>'id_plan_transferir', '')::uuid;

    if v_tipo_decision = 'mantener' then
      -- no se toca: sigue activa hasta que se complete por su cuenta.
      continue;
    elsif v_tipo_decision = 'cancelar' then
      update rutinas_mantenimiento
         set activo = false, motivo_pausa = '[Cancelada por cambio de misión] ' || trim(v_motivo),
             pausada_en = now(), pausada_por = (select id from usuarios where auth_user_id = auth.uid())
       where id = v_id_rutina and id_unidad = p_id_unidad;
    elsif v_tipo_decision = 'absorbida' then
      update rutinas_mantenimiento
         set activo = false, motivo_pausa = '[Absorbida por nueva intervención] ' || coalesce(trim(v_motivo), 'Sin observaciones'),
             pausada_en = now(), pausada_por = (select id from usuarios where auth_user_id = auth.uid())
       where id = v_id_rutina and id_unidad = p_id_unidad;
    elsif v_tipo_decision = 'transferir' then
      update rutinas_mantenimiento
         set activo = false, motivo_pausa = '[Transferida por cambio de misión]',
             pausada_en = now(), pausada_por = (select id from usuarios where auth_user_id = auth.uid())
       where id = v_id_rutina and id_unidad = p_id_unidad;

      if v_id_plan_transferir is not null then
        perform aplicar_plan_a_unidad(v_id_plan_transferir, p_id_unidad);
      end if;
    end if;
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function cambiar_mision_con_decisiones(uuid, text, jsonb) to authenticated;
