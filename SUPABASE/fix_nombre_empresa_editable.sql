-- El campo "Nombre empresa" en Configuración → General guardaba en
-- configuracion.parametros.nombre_empresa, un valor que ningún otro
-- lugar del sistema lee — el nombre real que se muestra en el Sidebar,
-- el login y los impresos de OT es empresas.razon_social, que hasta
-- ahora no tenía ninguna pantalla para editarlo (ni siquiera política
-- de RLS que lo permitiera). Esta función lo habilita.

create or replace function actualizar_nombre_empresa(p_razon_social text)
returns jsonb language plpgsql security definer as $$
begin
  if rol_actual() <> 'administrador' then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  if p_razon_social is null or trim(p_razon_social) = '' then
    return jsonb_build_object('ok', false, 'msg', 'El nombre de la empresa es obligatorio');
  end if;

  update empresas set razon_social = trim(p_razon_social) where id = empresa_actual();

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function actualizar_nombre_empresa(text) to authenticated;
