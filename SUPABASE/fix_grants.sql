-- El reset (drop schema public cascade) se llevó puesto los grants por
-- default que Supabase configura de fábrica para anon/authenticated.
-- RLS solo restringe FILAS — sin este GRANT de base, Postgres deniega
-- el acceso a la tabla entera antes de evaluar ninguna policy.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema public to anon;

alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;
