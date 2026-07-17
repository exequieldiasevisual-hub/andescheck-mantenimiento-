-- =====================================================================
-- Alta de una empresa nueva + su primer usuario administrador, en un
-- solo paso. No se puede hacer desde la app porque crear_usuario_admin
-- exige que YA exista un administrador logueado de esa empresa — una
-- empresa recién creada no tiene a nadie todavía (huevo y gallina).
--
-- Esta función corre solo por SQL Editor (no se le da grant a
-- "authenticated"), nunca desde la app.
-- =====================================================================

create or replace function alta_empresa_con_admin(
  p_alias text,
  p_razon_social text,
  p_usuario text,
  p_password text,
  p_nombre text
)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid;
  v_auth_id uuid := gen_random_uuid();
  v_email text;
  v_alias text := lower(trim(coalesce(p_alias, '')));
begin
  if v_alias = '' then
    return jsonb_build_object('ok', false, 'msg', 'El alias es obligatorio');
  end if;
  if p_razon_social is null or trim(p_razon_social) = '' then
    return jsonb_build_object('ok', false, 'msg', 'La razón social es obligatoria');
  end if;
  if exists (select 1 from empresas where alias = v_alias) then
    return jsonb_build_object('ok', false, 'msg', 'Ese alias ya está en uso');
  end if;
  if p_usuario is null or trim(p_usuario) = '' or p_password is null or length(p_password) < 6
     or p_nombre is null or trim(p_nombre) = '' then
    return jsonb_build_object('ok', false, 'msg', 'Faltan campos obligatorios (contraseña mínimo 6 caracteres)');
  end if;

  insert into empresas (alias, razon_social) values (v_alias, trim(p_razon_social))
  returning id into v_empresa;

  v_email := lower(trim(p_usuario)) || '@' || v_alias || '.andescheck.internal';

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
  values (v_auth_id, v_empresa, trim(p_nombre), trim(p_usuario), 'administrador');

  return jsonb_build_object('ok', true, 'id_empresa', v_empresa, 'alias', v_alias);
end;
$$;

-- Deliberadamente SIN "grant execute ... to authenticated" — esta función
-- solo se llama a mano desde el SQL Editor, nunca desde la app.

-- ---------------------------------------------------------------------
-- Ejemplo de uso (reemplazá los valores y corré el select):
-- ---------------------------------------------------------------------
-- select alta_empresa_con_admin(
--   'acme',                  -- alias: lo que el cliente escribe en "Código de empresa"
--   'ACME Transportes S.A.', -- razón social
--   'jperez',                -- usuario de acceso del primer administrador
--   'contraseña123',         -- contraseña (mínimo 6 caracteres)
--   'Juan Pérez'             -- nombre del administrador
-- );
