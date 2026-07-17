-- =====================================================================
-- Mejoras varias: perfil de usuario completo, PDF en seguimiento,
-- km/hs registrado al crear OT.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Usuarios: perfil completo (nombre/apellido separados, contacto, puesto)
-- ---------------------------------------------------------------------
alter table usuarios add column if not exists apellido text;
alter table usuarios add column if not exists email text;
alter table usuarios add column if not exists dni text;
alter table usuarios add column if not exists puesto text;

-- Reemplaza crear_usuario_admin para incluir los nuevos campos (misma razón
-- que crear_ot más abajo: cambia la firma, hay que borrar la vieja).
drop function if exists crear_usuario_admin(text, text, text, rol_usuario);

create or replace function crear_usuario_admin(
  p_usuario text, p_password text, p_nombre text, p_apellido text,
  p_email text, p_dni text, p_puesto text, p_rol rol_usuario
)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_alias text;
  v_email_login text;
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
  v_email_login := lower(trim(p_usuario)) || '@' || lower(v_alias) || '.andescheck.internal';

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    v_auth_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email_login, crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false,
    '', '', '', '', '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_auth_id, v_auth_id::text, 'email',
    jsonb_build_object('sub', v_auth_id::text, 'email', v_email_login, 'email_verified', true, 'phone_verified', false),
    now(), now(), now()
  );

  insert into usuarios (auth_user_id, empresa_id, nombre, apellido, email, dni, puesto, usuario, rol)
  values (v_auth_id, v_empresa, trim(p_nombre), nullif(trim(p_apellido), ''), nullif(trim(p_email), ''),
          nullif(trim(p_dni), ''), nullif(trim(p_puesto), ''), trim(p_usuario), p_rol);

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function crear_usuario_admin(text, text, text, text, text, text, text, rol_usuario) to authenticated;

-- ---------------------------------------------------------------------
-- Seguimiento: un PDF además de la foto
-- ---------------------------------------------------------------------
alter table ot_seguimiento add column if not exists documento_url text;

-- ---------------------------------------------------------------------
-- crear_ot: agrega registro de km/hs de la unidad al momento de abrir la OT
-- (actualiza unidades.km_actuales / hs_actuales si vienen informados).
-- Se agregan 2 parámetros nuevos al final → cambia el tipo de firma, así
-- que hay que borrar la versión vieja explícitamente o quedan las dos
-- funciones superpuestas (ambigüedad al llamar por nombre).
-- ---------------------------------------------------------------------
drop function if exists crear_ot(uuid, text, text, text, timestamptz, uuid, uuid, uuid, uuid[]);

create or replace function crear_ot(
  p_id_unidad uuid,
  p_tipo text,
  p_descripcion text,
  p_prioridad text default null,
  p_fecha_est_cierre timestamptz default null,
  p_id_secuencia uuid default null,
  p_id_novedad_origen uuid default null,
  p_proveedor uuid default null,
  p_tecnicos_asignados uuid[] default '{}',
  p_km_actuales numeric default null,
  p_hs_actuales numeric default null
)
returns jsonb language plpgsql security definer as $$
declare
  v_rol rol_usuario;
  v_empresa uuid;
  v_id_usuario uuid;
  v_id_ot uuid;
  v_tarea record;
  v_repuesto record;
  v_checklist jsonb := '[]'::jsonb;
begin
  v_rol := rol_actual();
  v_empresa := empresa_actual();

  if v_rol not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para crear OT');
  end if;

  if not exists (select 1 from unidades where id = p_id_unidad and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  if p_id_secuencia is not null
     and not exists (select 1 from secuencias where id = p_id_secuencia and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Secuencia no encontrada');
  end if;

  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();

  if p_km_actuales is not null or p_hs_actuales is not null then
    update unidades
       set km_actuales = coalesce(p_km_actuales, km_actuales),
           hs_actuales = coalesce(p_hs_actuales, hs_actuales)
     where id = p_id_unidad;
  end if;

  if p_id_secuencia is not null then
    select coalesce(jsonb_agg(item || jsonb_build_object('checked', false)), '[]'::jsonb)
      into v_checklist
      from (select jsonb_array_elements(checklist_items) as item from secuencias where id = p_id_secuencia) s;
  end if;

  insert into ot_cabecera (empresa_id, numero_ot, id_unidad, tipo, descripcion, prioridad, fecha_est_cierre,
                           id_secuencia, id_novedad_origen, proveedor, tecnicos_asignados, supervisor, checklist_completado)
  values (v_empresa, generar_numero_ot(v_empresa), p_id_unidad, p_tipo, p_descripcion, p_prioridad, p_fecha_est_cierre,
          p_id_secuencia, p_id_novedad_origen, p_proveedor, p_tecnicos_asignados, v_id_usuario, v_checklist)
  returning id into v_id_ot;

  if p_id_secuencia is not null then
    for v_tarea in
      select orden, descripcion from secuencias_tareas
       where id_secuencia = p_id_secuencia order by orden
    loop
      insert into ot_tareas (id_ot, orden, descripcion)
      values (v_id_ot, v_tarea.orden, v_tarea.descripcion);
    end loop;

    for v_repuesto in
      select id_repuesto, cantidad from secuencias_repuestos where id_secuencia = p_id_secuencia
    loop
      update stock set stock_comprometido = stock_comprometido + v_repuesto.cantidad
       where id = v_repuesto.id_repuesto;
    end loop;
  end if;

  if p_id_novedad_origen is not null then
    update novedades
       set estado = 'Derivada_a_OT', id_ot_vinculada = v_id_ot
     where id = p_id_novedad_origen and empresa_id = v_empresa;
  end if;

  return jsonb_build_object('ok', true, 'id_ot', v_id_ot);
end;
$$;

grant execute on function crear_ot(uuid, text, text, text, timestamptz, uuid, uuid, uuid, uuid[], numeric, numeric) to authenticated;
