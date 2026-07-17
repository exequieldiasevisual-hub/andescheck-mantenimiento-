-- Cambia el alias de login de la empresa de prueba (ya renombrada a
-- "AndesCheck" por rename_empresa_muestra.sql) a "andescheck".
--
-- El alias forma parte del email sintético de cada usuario
-- (usuario@alias.andescheck.internal) — cambiar solo empresas.alias
-- dejaría a todos sus usuarios sin poder loguearse, porque el sistema
-- buscaría un email que ya no coincide con ninguno. Este script
-- actualiza el alias Y reconstruye el email de cada usuario de la
-- empresa en el mismo paso.

do $$
declare
  v_id_empresa uuid;
  v_alias_nuevo text := 'andescheck';
  r record;
begin
  select id into v_id_empresa from empresas where razon_social = 'AndesCheck';
  if v_id_empresa is null then
    raise exception 'No se encontró ninguna empresa con razón social "AndesCheck" — corré primero rename_empresa_muestra.sql';
  end if;

  update empresas set alias = v_alias_nuevo where id = v_id_empresa;

  for r in
    select u.auth_user_id, u.usuario
    from usuarios u
    where u.empresa_id = v_id_empresa and u.auth_user_id is not null
  loop
    update auth.users
       set email = lower(r.usuario) || '@' || v_alias_nuevo || '.andescheck.internal'
     where id = r.auth_user_id;

    update auth.identities
       set identity_data = identity_data || jsonb_build_object('email', lower(r.usuario) || '@' || v_alias_nuevo || '.andescheck.internal')
     where user_id = r.auth_user_id;
  end loop;
end $$;
