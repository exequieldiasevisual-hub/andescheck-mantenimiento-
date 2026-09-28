-- =====================================================================
-- Permite al administrador editar los datos de un usuario ya creado
-- (nombre, apellido, email, DNI, puesto, rol) — antes solo se podía crear,
-- cambiar contraseña y activar/desactivar.
-- Nombre y apellido se guardan siempre en mayúscula (mismo criterio que
-- patente_serie en Unidades), sin importar cómo los haya tipeado el admin.
-- =====================================================================

create or replace function editar_usuario_admin(
  p_id uuid, p_nombre text, p_apellido text, p_email text, p_dni text, p_puesto text, p_rol rol_usuario
)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  if rol_actual() <> 'administrador' then
    return jsonb_build_object('ok', false, 'msg', 'Solo el administrador puede editar usuarios');
  end if;

  if p_nombre is null or trim(p_nombre) = '' then
    return jsonb_build_object('ok', false, 'msg', 'El nombre es obligatorio');
  end if;

  if not exists (select 1 from usuarios where id = p_id and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Usuario no encontrado');
  end if;

  update usuarios set
    nombre = upper(trim(p_nombre)),
    apellido = nullif(upper(trim(coalesce(p_apellido, ''))), ''),
    email = nullif(trim(coalesce(p_email, '')), ''),
    dni = nullif(trim(coalesce(p_dni, '')), ''),
    puesto = nullif(trim(coalesce(p_puesto, '')), ''),
    rol = p_rol
  where id = p_id and empresa_id = v_empresa;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function editar_usuario_admin(uuid, text, text, text, text, text, rol_usuario) to authenticated;

-- Opcional: pasar a mayúscula los nombres/apellidos ya cargados (los
-- nuevos y editados ya quedan en mayúscula solos por la función de
-- arriba; esto es solo para prolijizar lo existente). Seguro de re-correr.
update usuarios set nombre = upper(nombre) where nombre <> upper(nombre);
update usuarios set apellido = upper(apellido) where apellido is not null and apellido <> upper(apellido);
