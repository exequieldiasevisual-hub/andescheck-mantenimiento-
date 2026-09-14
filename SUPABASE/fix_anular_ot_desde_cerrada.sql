-- =====================================================================
-- Fix: anular_ot() solo dejaba anular OTs Abiertas/En_Curso — no una ya
-- Cerrada. Se relaja para permitir anular desde cualquier estado, salvo
-- que ya esté Anulada. La OT nunca se borra: cambia a estado 'Anulada'
-- con motivo_anulacion obligatorio, y sigue viéndose en el listado.
-- =====================================================================

create or replace function anular_ot(p_id_ot uuid, p_motivo text)
returns jsonb language plpgsql security definer as $$
declare
  v_rol rol_usuario;
  v_empresa uuid;
  v_ot ot_cabecera%rowtype;
begin
  v_rol := rol_actual();
  v_empresa := empresa_actual();

  if v_rol not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para anular OT');
  end if;

  if p_motivo is null or trim(p_motivo) = '' then
    return jsonb_build_object('ok', false, 'msg', 'El motivo de anulación es obligatorio');
  end if;

  select * into v_ot from ot_cabecera where id = p_id_ot and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'OT no encontrada');
  end if;

  if v_ot.estado = 'Anulada' then
    return jsonb_build_object('ok', false, 'msg', 'La OT ya está Anulada');
  end if;

  -- fecha_cierre solo se pisa si todavía no tenía una (OT que nunca se
  -- había cerrado) — si ya estaba Cerrada, se conserva la fecha real.
  update ot_cabecera
     set estado = 'Anulada', motivo_anulacion = trim(p_motivo), fecha_cierre = coalesce(fecha_cierre, now())
   where id = p_id_ot;

  if v_ot.id_novedad_origen is not null then
    update novedades
       set estado = 'Pendiente', id_ot_vinculada = null
     where id = v_ot.id_novedad_origen;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;
