-- Resetea la contraseña de la cuenta super_admin sin necesitar la anterior.
-- 1) Correr primero buscar_super_admin.sql para confirmar el id_usuario.
-- 2) Reemplazar los dos valores de abajo (ID_USUARIO_ACA y NUEVA_CONTRASENA_ACA).
-- 3) Correr este bloque completo.

do $$
declare
  v_id_usuario uuid := 'ID_USUARIO_ACA';       -- id_usuario que devolvió buscar_super_admin.sql
  v_password text := 'NUEVA_CONTRASENA_ACA';   -- la contraseña nueva que quieras poner
  v_auth_user_id uuid;
begin
  select auth_user_id into v_auth_user_id from usuarios where id = v_id_usuario;

  if v_auth_user_id is null then
    raise exception 'No se encontró auth_user_id para ese id_usuario';
  end if;

  update auth.users
     set encrypted_password = crypt(v_password, gen_salt('bf')),
         updated_at = now()
   where id = v_auth_user_id;

  raise notice 'Contraseña actualizada correctamente';
end $$;
