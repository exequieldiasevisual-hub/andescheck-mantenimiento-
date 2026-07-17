-- =====================================================================
-- Fase 8 — Rutinas de Mantenimiento (reemplaza Preventivos por completo).
--
-- Cambio de fondo (ítem #31 de la propuesta): se deja de pedir "próximo
-- km/hs/fecha" a mano. El usuario carga UNA vez el intervalo (cada
-- cuántos km/hs/días se repite) y el sistema calcula el próximo
-- vencimiento solo, comparando contra el km/hs actual de la unidad (o
-- la fecha de hoy) — igual que preventivos_calculado ya hacía con
-- "vencido/vigente", pero ahora también con el valor "próximo".
-- =====================================================================

-- Todo este bloque está armado para poder re-correrse sin romper si el
-- script ya avanzó parcialmente en un intento anterior (como pasó acá:
-- el rename de tabla/columna ya había corrido, y falló recién al borrar
-- km_hs_proximo porque la vieja vista preventivos_calculado todavía
-- dependía de esa columna — había que dropear la vista ANTES de tocar
-- columnas, no después).
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'preventivos') then
    alter table preventivos rename to rutinas_mantenimiento;
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'rutinas_mantenimiento' and column_name = 'valor_trigger') then
    alter table rutinas_mantenimiento rename column valor_trigger to intervalo;
  end if;
end $$;

drop view if exists preventivos_calculado;
drop view if exists rutinas_calculado;

alter table rutinas_mantenimiento drop column if exists km_hs_proximo;
alter table rutinas_mantenimiento drop column if exists fecha_proxima;
alter table rutinas_mantenimiento drop column if exists estado;

create view rutinas_calculado as
  select
    r.*,
    u.descripcion as unidad_descripcion,
    u.km_actuales as unidad_km_actuales,
    u.hs_actuales as unidad_hs_actuales,
    case r.tipo_trigger
      when 'km' then coalesce(r.km_hs_ultimo, 0) + r.intervalo
      when 'hs' then coalesce(r.km_hs_ultimo, 0) + r.intervalo
      else null
    end as proximo_km_hs,
    case when r.tipo_trigger = 'dias'
      then (coalesce(r.fecha_ultimo, current_date) + (r.intervalo || ' days')::interval)::date
      else null
    end as proxima_fecha,
    case
      when r.tipo_trigger = 'dias' then
        case when (coalesce(r.fecha_ultimo, current_date) + (r.intervalo || ' days')::interval)::date < current_date
          then 'Vencido' else 'Vigente' end
      when r.tipo_trigger = 'km' then
        case when u.km_actuales is not null and u.km_actuales >= coalesce(r.km_hs_ultimo, 0) + r.intervalo
          then 'Vencido' else 'Vigente' end
      when r.tipo_trigger = 'hs' then
        case when u.hs_actuales is not null and u.hs_actuales >= coalesce(r.km_hs_ultimo, 0) + r.intervalo
          then 'Vencido' else 'Vigente' end
    end as estado_calculado
  from rutinas_mantenimiento r
  join unidades u on u.id = r.id_unidad;

grant select on rutinas_calculado to authenticated;

-- ---------------------------------------------------------------------
-- cumplir_rutina — da por cumplida la rutina (avanza el "último" al
-- valor actual de la unidad, o a hoy si es por días) y opcionalmente
-- genera la OT correspondiente en el mismo paso.
-- ---------------------------------------------------------------------
create or replace function cumplir_rutina(
  p_id_rutina uuid,
  p_crear_ot boolean default true,
  p_prioridad text default 'Media',
  p_fecha_est_cierre timestamptz default null
)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_rutina rutinas_mantenimiento%rowtype;
  v_unidad unidades%rowtype;
  v_resultado jsonb;
  v_id_ot uuid;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para gestionar rutinas de mantenimiento');
  end if;

  select * into v_rutina from rutinas_mantenimiento where id = p_id_rutina and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Rutina no encontrada');
  end if;

  select * into v_unidad from unidades where id = v_rutina.id_unidad;

  if p_crear_ot then
    if p_fecha_est_cierre is null then
      return jsonb_build_object('ok', false, 'msg', 'La fecha estimada de cierre es obligatoria');
    end if;
    v_resultado := crear_ot(v_rutina.id_unidad, 'Preventivo', v_rutina.descripcion, p_prioridad, p_fecha_est_cierre);
    if not (v_resultado->>'ok')::boolean then
      return v_resultado;
    end if;
    v_id_ot := (v_resultado->>'id_ot')::uuid;
  end if;

  update rutinas_mantenimiento
     set km_hs_ultimo = case v_rutina.tipo_trigger
           when 'km' then coalesce(v_unidad.km_actuales, km_hs_ultimo)
           when 'hs' then coalesce(v_unidad.hs_actuales, km_hs_ultimo)
           else km_hs_ultimo end,
         fecha_ultimo = case when v_rutina.tipo_trigger = 'dias' then current_date else fecha_ultimo end
   where id = p_id_rutina;

  return jsonb_build_object('ok', true, 'id_ot', v_id_ot);
end;
$$;

grant execute on function cumplir_rutina(uuid, boolean, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- Dashboard: mismo conteo de siempre, solo renombra la clave y la
-- fuente (preventivos_vencidos → rutinas_vencidas).
-- ---------------------------------------------------------------------
create or replace function get_dashboard()
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  return jsonb_build_object(
    'unidades_activas', (select count(*) from unidades where empresa_id = v_empresa and activo = true),
    'ot_abiertas', (select count(*) from ot_cabecera where empresa_id = v_empresa and estado in ('Abierta','En_Curso')),
    'rutinas_vencidas', (select count(*) from rutinas_calculado where empresa_id = v_empresa and activo = true and estado_calculado = 'Vencido'),
    'novedades_pendientes', (select count(*) from novedades where empresa_id = v_empresa and estado = 'Pendiente'),
    'stock_critico', (select count(*) from stock where empresa_id = v_empresa and activo = true and stock_actual <= stock_minimo),
    'docs_vencidos', (select count(*) from unidad_docs_calculado d join unidades u on u.id = d.id_unidad where u.empresa_id = v_empresa and d.estado_calculado = 'Vencido'),
    'docs_por_vencer', (select count(*) from unidad_docs_calculado d join unidades u on u.id = d.id_unidad where u.empresa_id = v_empresa and d.estado_calculado = 'Por vencer')
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Cron de alertas: mismo criterio que antes (vencido, o a <=7 días si
-- es por fecha), ahora sobre rutinas_calculado.
-- ---------------------------------------------------------------------
select cron.unschedule('alertas-preventivos-diario')
  where exists (select 1 from cron.job where jobname = 'alertas-preventivos-diario');

create or replace function generar_alertas_rutinas()
returns void language plpgsql security definer as $$
declare
  v_rutina record;
begin
  for v_rutina in
    select * from rutinas_calculado
    where activo = true
      and (estado_calculado = 'Vencido' or proxima_fecha <= current_date + interval '7 days')
      and not exists (
        select 1 from alertas a
        where a.tipo = 'rutina_mantenimiento' and a.id_referencia = rutinas_calculado.id and a.estado = 'Pendiente'
      )
  loop
    insert into alertas (empresa_id, tipo, id_referencia, descripcion, estado, link_wsp)
    values (
      v_rutina.empresa_id,
      'rutina_mantenimiento',
      v_rutina.id,
      case when v_rutina.estado_calculado = 'Vencido'
        then 'Rutina VENCIDA: ' || v_rutina.descripcion || ' — ' || v_rutina.unidad_descripcion
        else 'Rutina próxima a vencer (7 días): ' || v_rutina.descripcion || ' — ' || v_rutina.unidad_descripcion
      end,
      'Pendiente',
      'https://wa.me/?text=' || replace(v_rutina.descripcion || ' - ' || v_rutina.unidad_descripcion, ' ', '%20')
    );
  end loop;
end;
$$;

select cron.schedule('alertas-rutinas-diario', '0 7 * * *', $$select generar_alertas_rutinas()$$);

drop function if exists generar_alertas_preventivos();
