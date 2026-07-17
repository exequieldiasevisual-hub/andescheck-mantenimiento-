-- =====================================================================
-- Panel de Empresas — un rol 'super_admin' de plataforma (no de una
-- empresa cliente) que puede ver la lista de empresas y dar de alta/baja,
-- sin acceso al día a día operativo de ninguna empresa cliente.
--
-- Deliberadamente NO se toca ninguna policy de RLS de tablas operativas
-- (unidades, ot_cabecera, stock, etc.) — todo el acceso cruzado entre
-- empresas pasa por estas funciones nuevas, auditables, gateadas por
-- rol_actual() = 'super_admin'. Correr DESPUÉS de
-- fix_rol_super_admin_enum.sql.
-- =====================================================================

-- La policy de lectura de "empresas" solo dejaba ver la empresa propia.
-- Un super_admin necesita ver el listado completo para el panel.
drop policy if exists "lectura_empresa_propia" on empresas;
create policy "lectura_empresa_propia" on empresas for select using (
  id = empresa_actual() or rol_actual() = 'super_admin'
);

-- ---------------------------------------------------------------------
-- get_empresas_resumen(): lista de empresas + métricas agregadas.
-- ---------------------------------------------------------------------
create or replace function get_empresas_resumen()
returns jsonb language plpgsql security definer as $$
begin
  if rol_actual() <> 'super_admin' then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  return jsonb_build_object(
    'ok', true,
    'empresas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'alias', e.alias,
        'razon_social', e.razon_social,
        'activo', e.activo,
        'fecha_alta', e.fecha_alta,
        'usuarios', (select count(*) from usuarios u where u.empresa_id = e.id and u.activo = true),
        'unidades', (select count(*) from unidades un where un.empresa_id = e.id and un.activo = true),
        'ot_abiertas', (select count(*) from ot_cabecera o where o.empresa_id = e.id and o.estado in ('Abierta','En_Curso'))
      ) order by e.fecha_alta desc)
      from empresas e
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function get_empresas_resumen() to authenticated;

-- ---------------------------------------------------------------------
-- alta_empresa_app(): crea empresa + su primer administrador, callable
-- desde la app (a diferencia de alta_empresa_con_admin, que es para
-- correr a mano una sola vez y bootstrapear el primer super_admin).
-- ---------------------------------------------------------------------
create or replace function alta_empresa_app(
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
  if rol_actual() <> 'super_admin' then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

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

grant execute on function alta_empresa_app(text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- toggle_empresa_activa(): desactivar/reactivar una empresa cliente.
-- No borra nada. Además de sacarla de empresas_login (bloquea el login
-- nuevo por alias), banea en auth.users a todos sus usuarios activos —
-- mismo mecanismo que desactivar_usuario_admin, así también corta
-- cualquier sesión ya iniciada, no solo los logins futuros.
-- ---------------------------------------------------------------------
create or replace function toggle_empresa_activa(p_id_empresa uuid, p_activo boolean)
returns jsonb language plpgsql security definer as $$
begin
  if rol_actual() <> 'super_admin' then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  update empresas set activo = p_activo where id = p_id_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Empresa no encontrada');
  end if;

  if not p_activo then
    -- Banea a TODOS, incluso a los que ya estaban desactivados individualmente
    -- (da igual, ya estaban baneados).
    update auth.users set banned_until = '2100-01-01'::timestamptz
     where id in (select auth_user_id from usuarios where empresa_id = p_id_empresa and auth_user_id is not null);
  else
    -- Solo levanta el baneo de los que siguen "activo" a nivel usuario —
    -- no reactiva a alguien que su propio administrador había desactivado
    -- por otro motivo, antes de que se desactivara toda la empresa.
    update auth.users set banned_until = null
     where id in (select auth_user_id from usuarios where empresa_id = p_id_empresa and auth_user_id is not null and activo = true);
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function toggle_empresa_activa(uuid, boolean) to authenticated;

-- =====================================================================
-- BOOTSTRAP: crear tu primera cuenta super_admin (correr una sola vez,
-- a mano, acá abajo — reemplazá los valores). Usa la función
-- alta_empresa_con_admin de feature_alta_empresa_nueva.sql, que hay que
-- haber corrido antes.
-- =====================================================================
-- select alta_empresa_con_admin(
--   'andescheck-admin',      -- alias interno, no es un cliente real
--   'AndesCheck Admin',      -- razón social interna
--   'tu_usuario',            -- tu usuario de acceso
--   'una_contraseña_fuerte', -- contraseña (mínimo 6 caracteres)
--   'Tu Nombre'
-- );
--
-- Esa función crea el usuario con rol 'administrador' — para subirlo a
-- 'super_admin', corré después:
--
-- update usuarios set rol = 'super_admin' where usuario = 'tu_usuario';
