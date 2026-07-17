-- =====================================================================
-- Las rutinas de mantenimiento ligadas a un componente (rutinas_mantenimiento
-- .id_componente) siempre compararon contra el km/hs de la UNIDAD donde
-- está montado el componente, tanto para calcular Vencida/Próxima como al
-- cerrar la OT y reiniciar el contador. Eso hace que el mantenimiento por
-- componente se comporte igual que uno por unidad — pierde el sentido de
-- que el contador viaje con la pieza al reasignarla a otro vehículo.
--
-- Fix: cuando la rutina tiene id_componente, se usa
-- componentes_mantenibles.lectura_actual como lectura vigente en vez del
-- km/hs de la unidad. lectura_actual sigue actualizándose a mano (Editar
-- en Componentes) — no se toca el flujo de creación/cierre de OT.
-- =====================================================================

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
      when r.tipo_trigger in ('km','hs') then
        case
          when r.km_hs_ultimo is null
            or coalesce(c.lectura_actual, case r.tipo_trigger when 'km' then u.km_actuales else u.hs_actuales end) is null
            then 'Sin_base'
          when coalesce(c.lectura_actual, case r.tipo_trigger when 'km' then u.km_actuales else u.hs_actuales end)
            >= r.km_hs_ultimo + r.intervalo then 'Vencida'
          when (r.km_hs_ultimo + r.intervalo - coalesce(c.lectura_actual, case r.tipo_trigger when 'km' then u.km_actuales else u.hs_actuales end))
            <= (r.intervalo * 0.10) then 'Proxima'
          else 'Vigente'
        end
    end as estado_calculado
  from rutinas_mantenimiento r
  join unidades u on u.id = r.id_unidad
  left join componentes_mantenibles c on c.id = r.id_componente;

grant select on rutinas_calculado to authenticated;

-- Al cerrar la OT: si la rutina cumplida es de un componente, el contador
-- (km_hs_ultimo) y el valor registrado en rutina_cumplimientos toman la
-- lectura del componente, no el km/hs de la unidad.
create or replace function _resolver_cumplimiento_rutina() returns trigger language plpgsql security definer as $$
declare
  v_cump record;
  v_unidad unidades%rowtype;
  v_rutina rutinas_mantenimiento%rowtype;
  v_lectura numeric;
begin
  if old.estado in ('Abierta','En_Curso') and new.estado in ('Cerrada','Cerrada_Vencida') then
    select * into v_unidad from unidades where id = new.id_unidad;

    for v_cump in select * from rutina_cumplimientos where id_ot = new.id and estado = 'Programada' loop
      select * into v_rutina from rutinas_mantenimiento where id = v_cump.id_rutina;

      if v_rutina.id_componente is not null then
        select lectura_actual into v_lectura from componentes_mantenibles where id = v_rutina.id_componente;
      else
        v_lectura := coalesce(v_unidad.km_actuales, v_unidad.hs_actuales);
      end if;

      update rutina_cumplimientos
         set estado = 'Cumplida',
             cumplido_en = now(),
             km_hs_valor = v_lectura,
             fecha_valor = current_date
       where id = v_cump.id;

      update rutinas_mantenimiento r
         set km_hs_ultimo = case when r.tipo_trigger in ('km','hs') then coalesce(v_lectura, r.km_hs_ultimo) else r.km_hs_ultimo end,
             fecha_ultimo = case when r.tipo_trigger = 'dias' then current_date else r.fecha_ultimo end
       where r.id = v_cump.id_rutina;
    end loop;
  elsif old.estado in ('Abierta','En_Curso') and new.estado = 'Anulada' then
    update rutina_cumplimientos
       set estado = 'Anulada', anulado_en = now()
     where id_ot = new.id and estado = 'Programada';
  end if;
  return new;
end;
$$;
