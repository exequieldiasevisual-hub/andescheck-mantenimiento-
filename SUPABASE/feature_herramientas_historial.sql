-- ==== Historial de herramientas ====
-- Registra snapshot anterior de estado/certificacion via trigger.
-- Mismo patron que unidad_docs_historial.

create table if not exists herramientas_historial (
  id uuid primary key default gen_random_uuid(),
  id_herramienta uuid not null references herramientas(id) on delete cascade,
  fecha timestamptz not null default now(),
  usuario uuid references usuarios(id),
  estado_anterior estado_herramienta,
  fecha_vencimiento_certificacion_anterior date,
  doc_certificacion_url_anterior text
);
create index if not exists idx_herramientas_historial_herramienta on herramientas_historial(id_herramienta);
alter table herramientas_historial enable row level security;

create policy "lectura_herramientas_historial" on herramientas_historial for select using (
  exists (select 1 from herramientas h where h.id = herramientas_historial.id_herramienta and h.empresa_id = empresa_actual())
);
grant select on herramientas_historial to authenticated;

create or replace function _log_edicion_herramienta() returns trigger language plpgsql security definer as $$
begin
  if (new.estado is distinct from old.estado)
     or (new.fecha_vencimiento_certificacion is distinct from old.fecha_vencimiento_certificacion)
     or (new.doc_certificacion_url is distinct from old.doc_certificacion_url) then
    insert into herramientas_historial (id_herramienta, usuario, estado_anterior, fecha_vencimiento_certificacion_anterior, doc_certificacion_url_anterior)
    values (old.id, (select id from usuarios where auth_user_id = auth.uid()), old.estado, old.fecha_vencimiento_certificacion, old.doc_certificacion_url);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_edicion_herramienta on herramientas;
create trigger trg_log_edicion_herramienta before update on herramientas
for each row execute function _log_edicion_herramienta();
