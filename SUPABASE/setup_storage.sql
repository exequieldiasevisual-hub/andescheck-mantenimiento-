-- Buckets públicos de lectura, escritura restringida a autenticados de la
-- MISMA empresa. Reemplazan las carpetas de Drive AndesCheck_Fotos y
-- AndesCheck_Docs. Convención de path obligatoria: <empresa_id>/<archivo>
-- — el primer segmento del path es el tenant, y la policy lo valida contra
-- empresa_actual() antes de permitir insert/delete.

insert into storage.buckets (id, name, public)
values ('ot-fotos', 'ot-fotos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('unidad-docs', 'unidad-docs', true)
on conflict (id) do nothing;

create policy "lectura_publica_ot_fotos" on storage.objects
  for select using (bucket_id = 'ot-fotos');
create policy "escritura_propia_empresa_ot_fotos" on storage.objects
  for insert with check (bucket_id = 'ot-fotos' and (storage.foldername(name))[1] = empresa_actual()::text);
create policy "borrado_propia_empresa_ot_fotos" on storage.objects
  for delete using (bucket_id = 'ot-fotos' and (storage.foldername(name))[1] = empresa_actual()::text);

create policy "lectura_publica_unidad_docs" on storage.objects
  for select using (bucket_id = 'unidad-docs');
create policy "escritura_propia_empresa_unidad_docs" on storage.objects
  for insert with check (bucket_id = 'unidad-docs' and (storage.foldername(name))[1] = empresa_actual()::text);
create policy "borrado_propia_empresa_unidad_docs" on storage.objects
  for delete using (bucket_id = 'unidad-docs' and (storage.foldername(name))[1] = empresa_actual()::text);
