-- =====================================================================
-- Permite editar un gasto ya cargado en la Bitácora (concepto y monto),
-- con motivo de la modificación obligatorio para trazabilidad. Mismo
-- permiso y misma restricción de estado que registrar_gasto_bitacora:
-- el chofer asignado o admin/supervisor, solo mientras el viaje sigue
-- 'En_curso'.
-- =====================================================================

alter table bitacora_gastos add column if not exists motivo_edicion text;
alter table bitacora_gastos add column if not exists editado_por uuid references usuarios(id);
alter table bitacora_gastos add column if not exists fecha_edicion timestamptz;

create or replace function editar_gasto_bitacora(p_id_gasto uuid, p_concepto text, p_monto numeric, p_motivo text)
returns jsonb language plpgsql security definer as $$
declare
  v_viaje bitacora_viajes%rowtype;
  v_id_usuario uuid;
begin
  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();

  select bv.* into v_viaje
    from bitacora_gastos bg join bitacora_viajes bv on bv.id = bg.id_viaje
    where bg.id = p_id_gasto and bv.empresa_id = empresa_actual();

  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Gasto no encontrado');
  end if;

  if rol_actual() not in ('administrador','supervisor') and v_viaje.id_chofer <> v_id_usuario then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para editar este gasto');
  end if;

  if v_viaje.estado <> 'En_curso' then
    return jsonb_build_object('ok', false, 'msg', 'El viaje ya no está en curso');
  end if;

  if p_concepto is null or trim(p_concepto) = '' then
    return jsonb_build_object('ok', false, 'msg', 'Falta el concepto');
  end if;
  if p_motivo is null or trim(p_motivo) = '' then
    return jsonb_build_object('ok', false, 'msg', 'Falta el motivo de la modificación');
  end if;

  update bitacora_gastos set
    concepto = trim(p_concepto),
    monto = p_monto,
    motivo_edicion = trim(p_motivo),
    editado_por = v_id_usuario,
    fecha_edicion = now()
  where id = p_id_gasto;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function editar_gasto_bitacora(uuid, text, numeric, text) to authenticated;
