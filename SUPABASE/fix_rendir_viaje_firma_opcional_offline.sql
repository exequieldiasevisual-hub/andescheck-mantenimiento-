-- =====================================================================
-- Permite rendir un viaje sin firma todavía cargada (caso: el chofer
-- rinde sin conexión, la rendición se encola y sincroniza sola, pero la
-- firma no se pudo subir a Storage sin señal). Antes esta función
-- rechazaba p_firma_url nulo/vacío en todos los casos.
-- =====================================================================

create or replace function rendir_viaje(p_id_viaje uuid, p_firma_url text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viaje bitacora_viajes%rowtype;
  v_usuario_id uuid;
begin
  select id into v_usuario_id from usuarios where auth_user_id = auth.uid();

  select * into v_viaje from bitacora_viajes where id = p_id_viaje and empresa_id = empresa_actual();
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Viaje no encontrado');
  end if;

  if v_viaje.id_chofer <> v_usuario_id then
    return jsonb_build_object('ok', false, 'msg', 'Solo el chofer asignado puede rendir el viaje');
  end if;

  if v_viaje.estado <> 'En_curso' then
    return jsonb_build_object('ok', false, 'msg', 'El viaje no está en curso');
  end if;

  update bitacora_viajes set
    estado = 'Rendido',
    firma_url = coalesce(p_firma_url, firma_url),
    fecha_rendicion = now()
  where id = p_id_viaje;

  return jsonb_build_object('ok', true);
end;
$$;
