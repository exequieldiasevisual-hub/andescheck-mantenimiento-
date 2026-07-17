-- ==== Rutinas v2: historial de cumplimientos + 5 estados + catalogo real ====
-- Corrige que Vencido/Vigente no alcanzaban para anticipar trabajos próximos.
-- Vincula las tareas de rutina con el catálogo real de trabajos.
-- Agrega historial de cumplimientos y una base inicial correcta para rutinas existentes.

alter table rutina_tareas add column if not exists id_catalogo uuid references catalogo_trabajos(id);

alter table rutinas_mantenimiento add column if not exists motivo_pausa text;
alter table rutinas_mantenimiento add column if not exists pausada_en timestamptz;
alter table rutinas_mantenimiento add column if not exists pausada_por uuid references usuarios(id);

-- Antes de reescribir la vista, las rutinas que nunca tuvieron un cumplimiento
-- (km_hs_ultimo/fecha_ultimo null) arrancan desde el valor ACTUAL de la unidad,
-- para no dejarlas todas en "Sin_base" innecesariamente al desplegar esto.

update rutinas_mantenimiento r
   set km_hs_ultimo = u.km_actuales
  from unidades u
 where u.id = r.id_unidad
   and r.tipo_trigger = 'km'
   and r.km_hs_ultimo is null
   and u.km_actuales is not null;

update rutinas_mantenimiento r
   set km_hs_ultimo = u.hs_actuales
  from unidades u
 where u.id = r.id_unidad
   and r.tipo_trigger = 'hs'
   and r.km_hs_ultimo is null
   and u.hs_actuales is not null;

update rutinas_mantenimiento
   set fecha_ultimo = current_date
 where tipo_trigger = 'dias' and fecha_ultimo is null;

create table if not exists rutina_cumplimientos (
  id uuid primary key default gen_random_uuid(),
  id_rutina uuid not null references rutinas_mantenimiento(id) on delete cascade,
  id_ot uuid references ot_cabecera(id),
  estado text not null default 'Programada' check (estado in ('Programada','Cumplida','Anulada')),
  origen text not null check (origen in ('ot_nueva','ot_existente')),
  km_hs_valor numeric(12,2),
  fecha_valor date,
  tareas_snapshot jsonb not null default '[]'::jsonb,
  usuario uuid references usuarios(id),
  observaciones text,
  creado_en timestamptz not null default now(),
  cumplido_en timestamptz,
  anulado_en timestamptz
);
create index if not exists idx_rutina_cumplimientos_rutina on rutina_cumplimientos(id_rutina);
create index if not exists idx_rutina_cumplimientos_ot on rutina_cumplimientos(id_ot);

-- Solo puede haber UN cumplimiento Programada abierto por rutina a la vez —
-- evita doble clic / dos usuarios programando el mismo cumplimiento en paralelo.
create unique index if not exists idx_rutina_cumplimientos_una_programada
  on rutina_cumplimientos(id_rutina) where estado = 'Programada';

alter table rutina_cumplimientos enable row level security;

create policy "lectura_rutina_cumplimientos" on rutina_cumplimientos for select using (
  exists (select 1 from rutinas_mantenimiento r where r.id = rutina_cumplimientos.id_rutina and r.empresa_id = empresa_actual())
);
grant select on rutina_cumplimientos to authenticated;
-- Sin policy de insert/update/delete directo: todo pasa por RPCs (otra tarea).

-- Sin_base: nunca tuvo lectura util para comparar (defensivo, no deberia pasar
--   con rutinas nuevas post-backfill, pero cubre datos legacy).
-- Vigente: al dia.
-- Proxima: falta <=10% del intervalo (km/hs) o <=7 dias (dias) — antes solo
--   funcionaba la anticipacion para "dias", ahora tambien para km/hs.
-- Vencida: ya paso el limite.
-- Pausada: rutina desactivada (activo = false), tiene prioridad sobre todo lo demas.

drop view if exists rutinas_calculado;

create view rutinas_calculado as
  select
    r.*,
    u.descripcion as unidad_descripcion,
    u.km_actuales as unidad_km_actuales,
    u.hs_actuales as unidad_hs_actuales,
    case r.tipo_trigger
      when 'km' then r.km_hs_ultimo + r.intervalo
      when 'hs' then r.km_hs_ultimo + r.intervalo
      else null
    end as proximo_km_hs,
    case when r.tipo_trigger = 'dias' and r.fecha_ultimo is not null
      then (r.fecha_ultimo + (r.intervalo || ' days')::interval)::date
      else null
    end as proxima_fecha,
    case
      when not r.activo then 'Pausada'
      when r.tipo_trigger = 'dias' then
        case
          when r.fecha_ultimo is null then 'Sin_base'
          when (r.fecha_ultimo + (r.intervalo || ' days')::interval)::date < current_date then 'Vencida'
          when (r.fecha_ultimo + (r.intervalo || ' days')::interval)::date <= current_date + interval '7 days' then 'Proxima'
          else 'Vigente'
        end
      when r.tipo_trigger = 'km' then
        case
          when r.km_hs_ultimo is null or u.km_actuales is null then 'Sin_base'
          when u.km_actuales >= r.km_hs_ultimo + r.intervalo then 'Vencida'
          when (r.km_hs_ultimo + r.intervalo - u.km_actuales) <= (r.intervalo * 0.10) then 'Proxima'
          else 'Vigente'
        end
      when r.tipo_trigger = 'hs' then
        case
          when r.km_hs_ultimo is null or u.hs_actuales is null then 'Sin_base'
          when u.hs_actuales >= r.km_hs_ultimo + r.intervalo then 'Vencida'
          when (r.km_hs_ultimo + r.intervalo - u.hs_actuales) <= (r.intervalo * 0.10) then 'Proxima'
          else 'Vigente'
        end
    end as estado_calculado
  from rutinas_mantenimiento r
  join unidades u on u.id = r.id_unidad;

grant select on rutinas_calculado to authenticated;
