-- Logo de la empresa: la columna empresas.logo_url ya existía en el
-- esquema (y hasta se cargaba en getUsuarioActual) pero no había bucket
-- de Storage, ni política de RLS que permita guardarla, ni control en
-- la app para subir el archivo. Mismo patrón que setup_storage.sql:
-- path <empresa_id>/<archivo>, público de lectura, escritura restringida
-- a la propia empresa.

insert into storage.buckets (id, name, public)
values ('logos-empresa', 'logos-empresa', true)
on conflict (id) do nothing;

create policy "lectura_publica_logos_empresa" on storage.objects
  for select using (bucket_id = 'logos-empresa');
create policy "escritura_propia_empresa_logos_empresa" on storage.objects
  for insert with check (bucket_id = 'logos-empresa' and (storage.foldername(name))[1] = empresa_actual()::text);
create policy "borrado_propia_empresa_logos_empresa" on storage.objects
  for delete using (bucket_id = 'logos-empresa' and (storage.foldername(name))[1] = empresa_actual()::text);

create or replace function actualizar_logo_empresa(p_logo_url text)
returns jsonb language plpgsql security definer as $$
begin
  if rol_actual() <> 'administrador' then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  update empresas set logo_url = nullif(trim(coalesce(p_logo_url, '')), '') where id = empresa_actual();

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function actualizar_logo_empresa(text) to authenticated;
