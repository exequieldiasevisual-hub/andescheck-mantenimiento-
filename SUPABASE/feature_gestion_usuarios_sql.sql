-- =====================================================================
-- Gestión de usuarios sin Edge Function — evita el problema de CORS que
-- causa verify_jwt=true (el gateway rechaza el preflight OPTIONS antes
-- de que la función pueda responderlo). En vez de eso, estas RPC insertan
-- directo en auth.users (con la contraseña hasheada con pgcrypto) dentro
-- de una función security definer protegida por rol_actual()='administrador'.
--
-- Nota de fragilidad: auth.users e identities son tablas internas de
-- Supabase Auth (GoTrue), no una API pública documentada. Este patrón
-- funciona con el esquema actual, pero podría necesitar ajustes si
-- Supabase cambia esas tablas en el futuro. La alternativa más robusta
-- (Admin API vía Edge Function) queda documentada en
-- functions/gestionar-usuario/index.ts por si se prefiere migrar después.
-- =====================================================================

-- ---------------------------------------------------------------------
-- crear_usuario_admin
-- Roles permitidos: administrador
-- Arma el email sintético usuario@<alias-empresa>.andescheck.internal
-- ---------------------------------------------------------------------
create or replace function crear_usuario_admin(p_usuario text, p_password text, p_nombre text, p_rol rol_usuario)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_alias text;
  v_email text;
  v_auth_id uuid := gen_random_uuid();
begin
  if rol_actual() <> 'administrador' then
    return jsonb_build_object('ok', false, 'msg', 'Solo el administrador puede crear usuarios');
  end if;

  if p_usuario is null or trim(p_usuario) = '' or p_password is null or length(p_password) < 6
     or p_nombre is null or trim(p_nombre) = '' then
    return jsonb_build_object('ok', false, 'msg', 'Faltan campos obligatorios (contraseña mínimo 6 caracteres)');
  end if;

  if exists (select 1 from usuarios where empresa_id = v_empresa and usuario = trim(p_usuario)) then
    return jsonb_build_object('ok', false, 'msg', 'Ese usuario ya existe en esta empresa');
  end if;

  select alias into v_alias from empresas where id = v_empresa;
  v_email := lower(trim(p_usuario)) || '@' || lower(v_alias) || '.andescheck.internal';

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    v_auth_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email, crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false,
    '', '', '', '', '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_auth_id, v_auth_id::text, 'email',
    jsonb_build_object('sub', v_auth_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    now(), now(), now()
  );

  insert into usuarios (auth_user_id, empresa_id, nombre, usuario, rol)
  values (v_auth_id, v_empresa, trim(p_nombre), trim(p_usuario), p_rol);

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- desactivar_usuario_admin / reactivar_usuario_admin
-- Roles permitidos: administrador. Solo sobre usuarios de la propia empresa.
-- ---------------------------------------------------------------------
create or replace function desactivar_usuario_admin(p_auth_user_id uuid)
returns jsonb language plpgsql security definer as $$
begin
  if rol_actual() <> 'administrador' then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  if not exists (select 1 from usuarios where auth_user_id = p_auth_user_id and empresa_id = empresa_actual()) then
    return jsonb_build_object('ok', false, 'msg', 'Usuario no encontrado en esta empresa');
  end if;

  update usuarios set activo = false where auth_user_id = p_auth_user_id;
  update auth.users set banned_until = '2100-01-01'::timestamptz where id = p_auth_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function reactivar_usuario_admin(p_auth_user_id uuid)
returns jsonb language plpgsql security definer as $$
begin
  if rol_actual() <> 'administrador' then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  if not exists (select 1 from usuarios where auth_user_id = p_auth_user_id and empresa_id = empresa_actual()) then
    return jsonb_build_object('ok', false, 'msg', 'Usuario no encontrado en esta empresa');
  end if;

  update usuarios set activo = true where auth_user_id = p_auth_user_id;
  update auth.users set banned_until = null where id = p_auth_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- cambiar_password_usuario_admin
-- Roles permitidos: administrador. Solo sobre usuarios de la propia empresa.
-- ---------------------------------------------------------------------
create or replace function cambiar_password_usuario_admin(p_auth_user_id uuid, p_password text)
returns jsonb language plpgsql security definer as $$
begin
  if rol_actual() <> 'administrador' then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  if p_password is null or length(p_password) < 6 then
    return jsonb_build_object('ok', false, 'msg', 'La contraseña debe tener al menos 6 caracteres');
  end if;

  if not exists (select 1 from usuarios where auth_user_id = p_auth_user_id and empresa_id = empresa_actual()) then
    return jsonb_build_object('ok', false, 'msg', 'Usuario no encontrado en esta empresa');
  end if;

  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
   where id = p_auth_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function crear_usuario_admin(text, text, text, rol_usuario) to authenticated;
grant execute on function desactivar_usuario_admin(uuid) to authenticated;
grant execute on function reactivar_usuario_admin(uuid) to authenticated;
grant execute on function cambiar_password_usuario_admin(uuid, text) to authenticated;
