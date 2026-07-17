-- ==== Plazos de alerta de rutinas configurables (Configuración > General) ====
-- Antes el umbral de "Próxima" estaba fijo en el código: 7 días para rutinas
-- por días, 10% del intervalo para rutinas por km/hs. Ahora se lee de la
-- tabla configuracion (seccion='alertas_rutinas'), por empresa, con esos
-- mismos valores como default si todavía no se configuró nada.

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
          when (r.fecha_ultimo + (r.intervalo || ' days')::interval)::date <= current_date + (
            coalesce((select valor::numeric from configuracion where empresa_id = r.empresa_id and seccion = 'alertas_rutinas' and clave = 'dias'), 7) || ' days'
          )::interval then 'Proxima'
          else 'Vigente'
        end
      when r.tipo_trigger = 'km' then
        case
          when r.km_hs_ultimo is null or u.km_actuales is null then 'Sin_base'
          when u.km_actuales >= r.km_hs_ultimo + r.intervalo then 'Vencida'
          when (r.km_hs_ultimo + r.intervalo - u.km_actuales) <= (
            r.intervalo * coalesce((select valor::numeric from configuracion where empresa_id = r.empresa_id and seccion = 'alertas_rutinas' and clave = 'km_pct'), 10) / 100.0
          ) then 'Proxima'
          else 'Vigente'
        end
      when r.tipo_trigger = 'hs' then
        case
          when r.km_hs_ultimo is null or u.hs_actuales is null then 'Sin_base'
          when u.hs_actuales >= r.km_hs_ultimo + r.intervalo then 'Vencida'
          when (r.km_hs_ultimo + r.intervalo - u.hs_actuales) <= (
            r.intervalo * coalesce((select valor::numeric from configuracion where empresa_id = r.empresa_id and seccion = 'alertas_rutinas' and clave = 'hs_pct'), 10) / 100.0
          ) then 'Proxima'
          else 'Vigente'
        end
    end as estado_calculado
  from rutinas_mantenimiento r
  join unidades u on u.id = r.id_unidad;

grant select on rutinas_calculado to authenticated;
