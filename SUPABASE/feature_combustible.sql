-- =====================================================================
-- Módulo de control de combustible.
-- Reutiliza el bucket 'ot-fotos' para el comprobante (misma policy que
-- novedades: solo exige que el primer segmento del path sea la empresa).
-- =====================================================================

alter table unidades add column if not exists capacidad_tanque_litros numeric(10,2);

create table if not exists combustible_cargas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  id_unidad uuid not null references unidades(id) on delete restrict,
  fecha timestamptz not null default now(),
  origen text not null check (origen in ('Tanque propio','Estación externa')),
  estacion text,
  litros numeric(10,2) not null check (litros > 0),
  precio_unitario numeric(12,2),
  precio_total numeric(12,2),
  km_actuales numeric(12,2),
  hs_actuales numeric(12,2),
  comprobante_url text,
  usuario_carga uuid references usuarios(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_combustible_empresa on combustible_cargas(empresa_id);
create index if not exists idx_combustible_unidad on combustible_cargas(id_unidad, fecha);

alter table combustible_cargas enable row level security;

drop policy if exists "lectura_combustible" on combustible_cargas;
create policy "lectura_combustible" on combustible_cargas for select using (empresa_id = empresa_actual());

drop policy if exists "escritura_combustible" on combustible_cargas;
create policy "escritura_combustible" on combustible_cargas for insert with check (
  empresa_id = empresa_actual() and rol_actual() in ('administrador','supervisor','tecnico')
);

drop policy if exists "edicion_combustible" on combustible_cargas;
create policy "edicion_combustible" on combustible_cargas for update using (
  empresa_id = empresa_actual() and rol_actual() in ('administrador','supervisor')
);

drop policy if exists "borrado_combustible" on combustible_cargas;
create policy "borrado_combustible" on combustible_cargas for delete using (
  empresa_id = empresa_actual() and rol_actual() in ('administrador','supervisor')
);

-- ---------------------------------------------------------------------
-- crear_carga_combustible: registra una carga y, si vienen km/hs, actualiza
-- la unidad (mismo patrón que crear_ot).
-- ---------------------------------------------------------------------
create or replace function crear_carga_combustible(
  p_id_unidad uuid, p_fecha timestamptz, p_origen text, p_estacion text,
  p_litros numeric, p_precio_unitario numeric, p_precio_total numeric,
  p_km_actuales numeric, p_hs_actuales numeric, p_comprobante_url text
)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_id_usuario uuid;
  v_id_carga uuid;
begin
  if rol_actual() not in ('administrador','supervisor','tecnico') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  if not exists (select 1 from unidades where id = p_id_unidad and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  if p_litros is null or p_litros <= 0 then
    return jsonb_build_object('ok', false, 'msg', 'Los litros deben ser mayores a cero');
  end if;

  if p_origen not in ('Tanque propio','Estación externa') then
    return jsonb_build_object('ok', false, 'msg', 'Origen inválido');
  end if;

  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();

  insert into combustible_cargas (
    empresa_id, id_unidad, fecha, origen, estacion, litros, precio_unitario,
    precio_total, km_actuales, hs_actuales, comprobante_url, usuario_carga
  ) values (
    v_empresa, p_id_unidad, coalesce(p_fecha, now()), p_origen, nullif(trim(coalesce(p_estacion,'')), ''), p_litros,
    p_precio_unitario, p_precio_total, p_km_actuales, p_hs_actuales, p_comprobante_url, v_id_usuario
  ) returning id into v_id_carga;

  if p_km_actuales is not null or p_hs_actuales is not null then
    update unidades set km_actuales = coalesce(p_km_actuales, km_actuales), hs_actuales = coalesce(p_hs_actuales, hs_actuales)
    where id = p_id_unidad;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id_carga);
end;
$$;

grant execute on function crear_carga_combustible(uuid, timestamptz, text, text, numeric, numeric, numeric, numeric, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- get_cargas_combustible: listado con rendimiento calculado (km u horas
-- por litro, contra la carga anterior de la misma unidad).
-- ---------------------------------------------------------------------
create or replace function get_cargas_combustible(p_desde date default null, p_hasta date default null, p_id_unidad uuid default null)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  return coalesce((
    with base as (
      select
        c.id, c.fecha, c.origen, c.estacion, c.litros, c.precio_unitario, c.precio_total,
        c.km_actuales, c.hs_actuales, c.comprobante_url,
        u.descripcion as unidad_descripcion, u.patente_serie as unidad_patente,
        coalesce(uu.nombre, 'Sin asignar') as cargado_por,
        lag(c.km_actuales) over (partition by c.id_unidad order by c.fecha) as km_anterior,
        lag(c.hs_actuales) over (partition by c.id_unidad order by c.fecha) as hs_anterior
      from combustible_cargas c
      join unidades u on u.id = c.id_unidad
      left join usuarios uu on uu.id = c.usuario_carga
      where c.empresa_id = v_empresa
        and (p_id_unidad is null or c.id_unidad = p_id_unidad)
        and (p_desde is null or c.fecha::date >= p_desde)
        and (p_hasta is null or c.fecha::date <= p_hasta)
    )
    select jsonb_agg(jsonb_build_object(
      'id', id, 'fecha', fecha, 'unidad', unidad_descripcion, 'patente', unidad_patente,
      'origen', origen, 'estacion', estacion, 'litros', litros, 'precio_unitario', precio_unitario,
      'precio_total', precio_total, 'km_actuales', km_actuales, 'hs_actuales', hs_actuales,
      'comprobante_url', comprobante_url, 'cargado_por', cargado_por,
      'rendimiento', case
        when km_actuales is not null and km_anterior is not null and km_actuales > km_anterior and litros > 0
          then round(((km_actuales - km_anterior) / litros)::numeric, 2)
        when hs_actuales is not null and hs_anterior is not null and hs_actuales > hs_anterior and litros > 0
          then round(((hs_actuales - hs_anterior) / litros)::numeric, 2)
        else null
      end,
      'unidad_rendimiento', case when km_actuales is not null and km_anterior is not null then 'km/l' when hs_actuales is not null and hs_anterior is not null then 'hs/l' else null end
    ) order by fecha desc)
    from base
  ), '[]'::jsonb);
end;
$$;

grant execute on function get_cargas_combustible(date, date, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- get_alertas_combustible: desvíos detectados (control de combustible).
-- Umbrales fijos por ahora (30% consumo, 20% precio, 30 días sin carga);
-- si hace falta ajustarlos, se puede llevar a Configuración más adelante.
-- ---------------------------------------------------------------------
create or replace function get_alertas_combustible()
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_umbral_consumo numeric := 0.30;
  v_umbral_precio numeric := 0.20;
  v_dias_sin_carga int := 30;
  v_min_baseline int := 3;
begin
  return coalesce((
    with cargas as (
      select
        c.id, c.id_unidad, c.fecha, c.litros, c.precio_unitario, c.km_actuales, c.hs_actuales,
        u.descripcion as unidad, u.patente_serie as patente, u.capacidad_tanque_litros,
        lag(c.km_actuales) over w as km_anterior,
        lag(c.hs_actuales) over w as hs_anterior
      from combustible_cargas c
      join unidades u on u.id = c.id_unidad
      where c.empresa_id = v_empresa
      window w as (partition by c.id_unidad order by c.fecha)
    ),
    rendimiento as (
      select *,
        case
          when km_actuales is not null and km_anterior is not null and km_actuales > km_anterior and litros > 0
            then (km_actuales - km_anterior) / litros
          when hs_actuales is not null and hs_anterior is not null and hs_actuales > hs_anterior and litros > 0
            then (hs_actuales - hs_anterior) / litros
          else null
        end as valor_rendimiento,
        case
          when km_actuales is not null and km_anterior is not null then km_actuales - km_anterior
          when hs_actuales is not null and hs_anterior is not null then hs_actuales - hs_anterior
          else null
        end as recorrido
      from cargas
    ),
    baseline as (
      select id_unidad, avg(valor_rendimiento) as prom_rendimiento, count(*) as n_rendimiento, avg(recorrido) as prom_recorrido
      from rendimiento where valor_rendimiento is not null
      group by id_unidad
    ),
    precio_mes as (
      select date_trunc('month', fecha) as mes, avg(precio_unitario) as prom_precio
      from combustible_cargas where empresa_id = v_empresa and precio_unitario is not null
      group by 1
    ),
    alertas as (
      -- 1: consumo anómalo vs. el propio promedio histórico de la unidad
      select 1 as prio, r.fecha, r.id::text as id,
        coalesce(r.patente, 's/patente') || ' — ' || r.unidad as titulo,
        'Consumo ' || round(abs(r.valor_rendimiento - b.prom_rendimiento) / b.prom_rendimiento * 100) || '% ' ||
          (case when r.valor_rendimiento < b.prom_rendimiento then 'peor' else 'mejor' end) || ' que su habitual' as detalle
      from rendimiento r
      join baseline b on b.id_unidad = r.id_unidad
      where r.valor_rendimiento is not null and b.n_rendimiento >= v_min_baseline and b.prom_rendimiento > 0
        and abs(r.valor_rendimiento - b.prom_rendimiento) / b.prom_rendimiento >= v_umbral_consumo

      union all
      -- 2: carga sin recorrido coherente desde la anterior
      select 2, r.fecha, r.id::text,
        coalesce(r.patente, 's/patente') || ' — ' || r.unidad,
        'Cargó de nuevo con muy poco recorrido desde la última carga'
      from rendimiento r
      join baseline b on b.id_unidad = r.id_unidad
      where r.recorrido is not null and b.prom_recorrido > 0 and b.n_rendimiento >= v_min_baseline
        and r.recorrido < b.prom_recorrido * 0.10

      union all
      -- 3: litros superan la capacidad del tanque de la unidad
      select 3, r.fecha, r.id::text,
        coalesce(r.patente, 's/patente') || ' — ' || r.unidad,
        'Cargó ' || r.litros || ' litros, más que la capacidad del tanque (' || r.capacidad_tanque_litros || ' L)'
      from rendimiento r
      where r.capacidad_tanque_litros is not null and r.litros > r.capacidad_tanque_litros

      union all
      -- 4: precio por litro fuera del promedio del mes
      select 4, r.fecha, r.id::text,
        coalesce(r.patente, 's/patente') || ' — ' || r.unidad,
        'Precio por litro ' || round(abs(r.precio_unitario - pm.prom_precio) / pm.prom_precio * 100) || '% fuera del promedio del mes'
      from rendimiento r
      join precio_mes pm on pm.mes = date_trunc('month', r.fecha)
      where r.precio_unitario is not null and pm.prom_precio > 0
        and abs(r.precio_unitario - pm.prom_precio) / pm.prom_precio >= v_umbral_precio

      union all
      -- 5: unidad sin cargar hace mucho pero con actividad reciente (OT abierta en los últimos 30 días)
      select 5, now(), u.id::text,
        coalesce(u.patente_serie, 's/patente') || ' — ' || u.descripcion,
        case when ultima.fecha is null then 'Nunca cargó combustible en el sistema'
             else 'Sin cargar combustible hace ' || (current_date - ultima.fecha::date) || ' día(s)' end
      from unidades u
      left join (select id_unidad, max(fecha) as fecha from combustible_cargas where empresa_id = v_empresa group by id_unidad) ultima
        on ultima.id_unidad = u.id
      where u.empresa_id = v_empresa and u.activo = true
        and (ultima.fecha is null or ultima.fecha < now() - (v_dias_sin_carga || ' days')::interval)
        and exists (select 1 from ot_cabecera ot where ot.id_unidad = u.id and ot.fecha_apertura > now() - interval '30 days')
    )
    select jsonb_agg(jsonb_build_object('tipo', 'combustible', 'id', id, 'fecha', fecha, 'titulo', titulo, 'detalle', detalle) order by prio, fecha desc)
    from alertas
  ), '[]'::jsonb);
end;
$$;

grant execute on function get_alertas_combustible() to authenticated;

-- ---------------------------------------------------------------------
-- get_dashboard: se suma la cola de alertas de combustible + un contador,
-- mismo patrón que las demás fuentes de la cola (OT/rutinas/documentos/
-- novedades). Nota: a diferencia de esas, esta cola no se filtra por
-- centro de costo/tipo/ciudad todavía.
-- ---------------------------------------------------------------------
create or replace function get_dashboard(p_centros text[] default null, p_tipos text[] default null, p_ciudades text[] default null)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_semaforo jsonb;
  v_cola jsonb;
  v_alertas_combustible jsonb := get_alertas_combustible();
begin
  p_centros := nullif(p_centros, '{}'::text[]);
  p_tipos := nullif(p_tipos, '{}'::text[]);
  p_ciudades := nullif(p_ciudades, '{}'::text[]);

  select jsonb_build_object(
    'verde', count(*) filter (where salud >= 80),
    'ambar', count(*) filter (where salud between 50 and 79),
    'rojo', count(*) filter (where salud < 50)
  ) into v_semaforo
  from (select (e->>'salud')::int as salud from jsonb_array_elements(get_salud_flota(p_centros, p_tipos, p_ciudades)) e) s;

  select coalesce(jsonb_agg(jsonb_build_object(
    'tipo', tipo, 'id', id, 'fecha', fecha, 'titulo', titulo, 'detalle', detalle
  ) order by prio, fecha), '[]'::jsonb) into v_cola
  from (
    select * from (
      -- 1: OTs vencidas (abiertas con fecha estimada de cierre pasada)
      select 1 as prio, 'ot'::text as tipo, ot.id::text as id, ot.fecha_est_cierre as fecha,
             ot.numero_ot || ' — ' || u.descripcion as titulo,
             'Vencida hace ' || (current_date - ot.fecha_est_cierre::date) || ' día(s)' as detalle
      from ot_cabecera ot join unidades u on u.id = ot.id_unidad
      where ot.empresa_id = v_empresa and ot.estado in ('Abierta','En_Curso')
        and ot.fecha_est_cierre is not null and ot.fecha_est_cierre::date < current_date
        and (p_centros is null or u.centro_costo = any(p_centros))
        and (p_tipos is null or u.tipo = any(p_tipos))
        and (p_ciudades is null or u.ciudad = any(p_ciudades))
      union all
      -- 2: OTs que vencen hoy
      select 2, 'ot', ot.id::text, ot.fecha_est_cierre,
             ot.numero_ot || ' — ' || u.descripcion,
             'Vence HOY'
      from ot_cabecera ot join unidades u on u.id = ot.id_unidad
      where ot.empresa_id = v_empresa and ot.estado in ('Abierta','En_Curso')
        and ot.fecha_est_cierre::date = current_date
        and (p_centros is null or u.centro_costo = any(p_centros))
        and (p_tipos is null or u.tipo = any(p_tipos))
        and (p_ciudades is null or u.ciudad = any(p_ciudades))
      union all
      -- 3: rutinas vencidas
      select 3, 'rutina', r.id::text, now(),
             r.descripcion || ' — ' || r.unidad_descripcion,
             'Rutina vencida'
      from rutinas_calculado r join unidades u on u.id = r.id_unidad
      where r.empresa_id = v_empresa and r.activo = true and r.estado_calculado = 'Vencida'
        and (p_centros is null or u.centro_costo = any(p_centros))
        and (p_tipos is null or u.tipo = any(p_tipos))
        and (p_ciudades is null or u.ciudad = any(p_ciudades))
      union all
      -- 4: documentos vencidos o por vencer
      select 4, 'documento', d.id::text, d.fecha_vigencia_hasta::timestamptz,
             trim(coalesce(d.numero, '') || ' ' || d.tipo) || ' — ' || u.descripcion,
             case when d.estado_calculado = 'Vencido' then 'Documento vencido' else 'Vence ' || to_char(d.fecha_vigencia_hasta, 'DD/MM') end
      from unidad_docs_calculado d join unidades u on u.id = d.id_unidad
      where u.empresa_id = v_empresa and d.estado_calculado in ('Vencido', 'Por vencer')
        and (p_centros is null or u.centro_costo = any(p_centros))
        and (p_tipos is null or u.tipo = any(p_tipos))
        and (p_ciudades is null or u.ciudad = any(p_ciudades))
      union all
      -- 5: novedades sin gestionar hace mas de 48 horas
      select 5, 'novedad', n.id::text, n.fecha,
             u.descripcion || ': ' || n.descripcion,
             'Sin gestionar hace ' || extract(day from now() - n.fecha) || ' día(s)'
      from novedades n join unidades u on u.id = n.id_unidad
      where n.empresa_id = v_empresa and n.estado = 'Pendiente' and n.fecha < now() - interval '48 hours'
        and (p_centros is null or u.centro_costo = any(p_centros))
        and (p_tipos is null or u.tipo = any(p_tipos))
        and (p_ciudades is null or u.ciudad = any(p_ciudades))
      union all
      -- 6: alertas de combustible (desvíos de consumo, precio, tanque, sin carga)
      select 6, e->>'tipo', e->>'id', (e->>'fecha')::timestamptz, e->>'titulo', e->>'detalle'
      from jsonb_array_elements(v_alertas_combustible) e
    ) eventos
    order by prio, fecha
    limit 30
  ) cola_limitada;

  return jsonb_build_object(
    'unidades_activas', (
      select count(*) from unidades u where u.empresa_id = v_empresa and u.activo = true
        and (p_centros is null or u.centro_costo = any(p_centros))
        and (p_tipos is null or u.tipo = any(p_tipos))
        and (p_ciudades is null or u.ciudad = any(p_ciudades))
    ),
    'unidades_total', (
      select count(*) from unidades u where u.empresa_id = v_empresa
        and (p_centros is null or u.centro_costo = any(p_centros))
        and (p_tipos is null or u.tipo = any(p_tipos))
        and (p_ciudades is null or u.ciudad = any(p_ciudades))
    ),
    'ot_abiertas', (
      select count(*) from ot_cabecera ot join unidades u on u.id = ot.id_unidad
      where ot.empresa_id = v_empresa and ot.estado in ('Abierta','En_Curso')
        and (p_centros is null or u.centro_costo = any(p_centros))
        and (p_tipos is null or u.tipo = any(p_tipos))
        and (p_ciudades is null or u.ciudad = any(p_ciudades))
    ),
    'rutinas_vencidas', (
      select count(*) from rutinas_calculado r join unidades u on u.id = r.id_unidad
      where r.empresa_id = v_empresa and r.activo = true and r.estado_calculado = 'Vencida'
        and (p_centros is null or u.centro_costo = any(p_centros))
        and (p_tipos is null or u.tipo = any(p_tipos))
        and (p_ciudades is null or u.ciudad = any(p_ciudades))
    ),
    'novedades_pendientes', (
      select count(*) from novedades n join unidades u on u.id = n.id_unidad
      where n.empresa_id = v_empresa and n.estado = 'Pendiente'
        and (p_centros is null or u.centro_costo = any(p_centros))
        and (p_tipos is null or u.tipo = any(p_tipos))
        and (p_ciudades is null or u.ciudad = any(p_ciudades))
    ),
    'stock_critico', (select count(*) from stock where empresa_id = v_empresa and activo = true and stock_actual <= stock_minimo),
    'docs_vencidos', (
      select count(*) from unidad_docs_calculado d join unidades u on u.id = d.id_unidad
      where u.empresa_id = v_empresa and d.estado_calculado = 'Vencido'
        and (p_centros is null or u.centro_costo = any(p_centros))
        and (p_tipos is null or u.tipo = any(p_tipos))
        and (p_ciudades is null or u.ciudad = any(p_ciudades))
    ),
    'docs_por_vencer', (
      select count(*) from unidad_docs_calculado d join unidades u on u.id = d.id_unidad
      where u.empresa_id = v_empresa and d.estado_calculado = 'Por vencer'
        and (p_centros is null or u.centro_costo = any(p_centros))
        and (p_tipos is null or u.tipo = any(p_tipos))
        and (p_ciudades is null or u.ciudad = any(p_ciudades))
    ),
    'combustible_alertas', jsonb_array_length(v_alertas_combustible),
    'semaforo', v_semaforo,
    'cola', v_cola
  );
end;
$$;
