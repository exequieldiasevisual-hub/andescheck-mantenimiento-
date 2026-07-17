-- ==== Rutinas: columnas de lectura actual, última actualización y "faltan" ====
-- Agrega el timestamp de cuándo se actualizó por última vez el km/hs de la
-- unidad (no existía en ningún lado) vía trigger, y lo expone en
-- rutinas_calculado junto con las lecturas actuales que la vista ya traía.

alter table unidades add column if not exists km_hs_actualizado_en timestamptz;

update unidades
   set km_hs_actualizado_en = now()
 where km_hs_actualizado_en is null
   and (km_actuales is not null or hs_actuales is not null);

create or replace function set_km_hs_actualizado_en()
returns trigger language plpgsql as $$
begin
  if new.km_actuales is distinct from old.km_actuales or new.hs_actuales is distinct from old.hs_actuales then
    new.km_hs_actualizado_en := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_km_hs_actualizado_en on unidades;
create trigger trg_km_hs_actualizado_en
  before update on unidades
  for each row execute function set_km_hs_actualizado_en();

drop view if exists rutinas_calculado;

create view rutinas_calculado as
  select
    r.*,
    u.descripcion as unidad_descripcion,
    u.km_actuales as unidad_km_actuales,
    u.hs_actuales as unidad_hs_actuales,
    u.km_hs_actualizado_en as unidad_km_hs_actualizado_en,
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
