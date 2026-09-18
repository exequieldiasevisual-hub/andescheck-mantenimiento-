-- =====================================================================
-- Permite que administrador/supervisor también puedan rendir y firmar
-- un viaje (no solo el chofer asignado) — por si el chofer no puede
-- hacerlo él mismo (sin equipo, se dio de baja, etc.) y el admin tiene
-- que cerrar el viaje a mano.
-- =====================================================================

create or replace function rendir_viaje(p_id_viaje uuid, p_firma_url text default null)
returns jsonb language plpgsql security definer as $$
declare
  v_viaje bitacora_viajes%rowtype;
  v_id_usuario uuid;
begin
  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();
  select * into v_viaje from bitacora_viajes where id = p_id_viaje and empresa_id = empresa_actual();

  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Viaje no encontrado');
  end if;

  if rol_actual() not in ('administrador','supervisor') and v_viaje.id_chofer <> v_id_usuario then
    return jsonb_build_object('ok', false, 'msg', 'Solo el chofer asignado puede rendir este viaje');
  end if;

  if v_viaje.estado <> 'En_curso' then
    return jsonb_build_object('ok', false, 'msg', 'Este viaje ya fue rendido');
  end if;

  update bitacora_viajes
     set estado = 'Rendido', firma_url = coalesce(p_firma_url, firma_url), fecha_rendicion = now()
   where id = p_id_viaje;

  return jsonb_build_object('ok', true);
end;
$$;
