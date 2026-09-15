-- =====================================================================
-- Costos de la empresa — resultado neto por unidad y por mes.
-- Reutiliza lo que ya existe: unidades.centro_costo (texto libre),
-- combustible_cargas y costos (OT) ya están cargados por unidad, así que
-- se suman automático. Lo único que se carga a mano acá es: facturado,
-- costos anuales prorrateables (seguro/RTO/patente), sueldo/931 del
-- chofer y costos indirectos por centro de costo.
-- =====================================================================

create table if not exists costos_empresa_facturado (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  id_unidad uuid not null references unidades(id) on delete cascade,
  mes date not null,
  monto numeric(14,2) not null default 0,
  usuario_alta uuid references usuarios(id),
  fecha_alta timestamptz not null default now(),
  unique (id_unidad, mes)
);

-- Genérico para no atarse a "seguro/RTO/patente" — cualquier costo anual
-- por unidad que se prorratea en 12 meses entra acá con su propio concepto.
create table if not exists costos_empresa_anual (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  id_unidad uuid not null references unidades(id) on delete cascade,
  anio int not null,
  concepto text not null,
  monto_anual numeric(14,2) not null default 0,
  usuario_alta uuid references usuarios(id),
  fecha_alta timestamptz not null default now(),
  unique (id_unidad, anio, concepto)
);

create table if not exists costos_empresa_sueldo_chofer (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  id_chofer uuid not null references usuarios(id),
  mes date not null,
  monto numeric(14,2) not null default 0,
  usuario_alta uuid references usuarios(id),
  fecha_alta timestamptz not null default now(),
  unique (id_chofer, mes)
);

-- Costos indirectos que no son de una unidad puntual sino de todo un
-- centro de costo (sueldo técnicos, servicios, impuesto municipal, etc.).
create table if not exists costos_empresa_centro (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  centro_costo text not null,
  mes date not null,
  concepto text not null,
  monto numeric(14,2) not null default 0,
  usuario_alta uuid references usuarios(id),
  fecha_alta timestamptz not null default now(),
  unique (centro_costo, mes, concepto)
);

alter table costos_empresa_facturado enable row level security;
alter table costos_empresa_anual enable row level security;
alter table costos_empresa_sueldo_chofer enable row level security;
alter table costos_empresa_centro enable row level security;

drop policy if exists lectura_costos_empresa_facturado on costos_empresa_facturado;
create policy lectura_costos_empresa_facturado on costos_empresa_facturado for select
  using (empresa_id = empresa_actual() and rol_actual() in ('administrador','supervisor','auditor'));

drop policy if exists lectura_costos_empresa_anual on costos_empresa_anual;
create policy lectura_costos_empresa_anual on costos_empresa_anual for select
  using (empresa_id = empresa_actual() and rol_actual() in ('administrador','supervisor','auditor'));

drop policy if exists lectura_costos_empresa_sueldo_chofer on costos_empresa_sueldo_chofer;
create policy lectura_costos_empresa_sueldo_chofer on costos_empresa_sueldo_chofer for select
  using (empresa_id = empresa_actual() and rol_actual() in ('administrador','supervisor','auditor'));

drop policy if exists lectura_costos_empresa_centro on costos_empresa_centro;
create policy lectura_costos_empresa_centro on costos_empresa_centro for select
  using (empresa_id = empresa_actual() and rol_actual() in ('administrador','supervisor','auditor'));

-- Todas las escrituras van por RPC (sin policies de insert/update/delete).

-- =====================================================================
-- RPCs de carga (administrador y supervisor)
-- =====================================================================

create or replace function guardar_facturado_masivo(p_filas jsonb)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_fila jsonb;
  v_cargados int := 0;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    insert into costos_empresa_facturado (empresa_id, id_unidad, mes, monto, usuario_alta)
    select v_empresa, (v_fila->>'id_unidad')::uuid,
           date_trunc('month', (v_fila->>'mes')::date)::date,
           (v_fila->>'monto')::numeric,
           (select id from usuarios where auth_user_id = auth.uid())
    where exists (select 1 from unidades u where u.id = (v_fila->>'id_unidad')::uuid and u.empresa_id = v_empresa)
    on conflict (id_unidad, mes) do update set monto = excluded.monto, usuario_alta = excluded.usuario_alta, fecha_alta = now();
    v_cargados := v_cargados + 1;
  end loop;

  return jsonb_build_object('ok', true, 'cargados', v_cargados);
end;
$$;

create or replace function guardar_costo_anual(p_id_unidad uuid, p_anio int, p_concepto text, p_monto_anual numeric)
returns jsonb language plpgsql security definer as $$
declare v_empresa uuid := empresa_actual();
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;
  if not exists (select 1 from unidades where id = p_id_unidad and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Unidad inválida');
  end if;
  if p_concepto is null or trim(p_concepto) = '' then
    return jsonb_build_object('ok', false, 'msg', 'Falta el concepto');
  end if;

  insert into costos_empresa_anual (empresa_id, id_unidad, anio, concepto, monto_anual, usuario_alta)
  values (v_empresa, p_id_unidad, p_anio, trim(p_concepto), coalesce(p_monto_anual, 0), (select id from usuarios where auth_user_id = auth.uid()))
  on conflict (id_unidad, anio, concepto) do update set monto_anual = excluded.monto_anual, usuario_alta = excluded.usuario_alta, fecha_alta = now();

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function eliminar_costo_anual(p_id uuid)
returns jsonb language plpgsql security definer as $$
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;
  delete from costos_empresa_anual where id = p_id and empresa_id = empresa_actual();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function guardar_sueldo_chofer(p_id_chofer uuid, p_mes date, p_monto numeric)
returns jsonb language plpgsql security definer as $$
declare v_empresa uuid := empresa_actual();
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;
  if not exists (select 1 from usuarios where id = p_id_chofer and empresa_id = v_empresa and rol = 'chofer') then
    return jsonb_build_object('ok', false, 'msg', 'Chofer inválido');
  end if;

  insert into costos_empresa_sueldo_chofer (empresa_id, id_chofer, mes, monto, usuario_alta)
  values (v_empresa, p_id_chofer, date_trunc('month', p_mes)::date, coalesce(p_monto, 0), (select id from usuarios where auth_user_id = auth.uid()))
  on conflict (id_chofer, mes) do update set monto = excluded.monto, usuario_alta = excluded.usuario_alta, fecha_alta = now();

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function eliminar_sueldo_chofer(p_id uuid)
returns jsonb language plpgsql security definer as $$
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;
  delete from costos_empresa_sueldo_chofer where id = p_id and empresa_id = empresa_actual();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function guardar_costo_centro(p_centro_costo text, p_mes date, p_concepto text, p_monto numeric)
returns jsonb language plpgsql security definer as $$
declare v_empresa uuid := empresa_actual();
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;
  if p_centro_costo is null or trim(p_centro_costo) = '' then
    return jsonb_build_object('ok', false, 'msg', 'Falta el centro de costo');
  end if;
  if p_concepto is null or trim(p_concepto) = '' then
    return jsonb_build_object('ok', false, 'msg', 'Falta el concepto');
  end if;

  insert into costos_empresa_centro (empresa_id, centro_costo, mes, concepto, monto, usuario_alta)
  values (v_empresa, trim(p_centro_costo), date_trunc('month', p_mes)::date, trim(p_concepto), coalesce(p_monto, 0), (select id from usuarios where auth_user_id = auth.uid()))
  on conflict (centro_costo, mes, concepto) do update set monto = excluded.monto, usuario_alta = excluded.usuario_alta, fecha_alta = now();

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function eliminar_costo_centro(p_id uuid)
returns jsonb language plpgsql security definer as $$
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;
  delete from costos_empresa_centro where id = p_id and empresa_id = empresa_actual();
  return jsonb_build_object('ok', true);
end;
$$;

-- =====================================================================
-- Reporte: resultado neto por unidad de un mes dado ('YYYY-MM-01')
-- =====================================================================

create or replace function get_resultado_neto(p_mes date)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_desde date := date_trunc('month', p_mes)::date;
  v_hasta date := v_desde + interval '1 month';
  v_anio int := extract(year from v_desde)::int;
begin
  if rol_actual() not in ('administrador','supervisor','auditor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para ver reportes');
  end if;

  return jsonb_build_object(
    'ok', true,
    'mes', to_char(v_desde, 'YYYY-MM'),
    'unidades', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id_unidad', u.id,
        'unidad', u.descripcion,
        'patente', u.patente_serie,
        'centro_costo', u.centro_costo,
        'facturado', f.monto,
        'combustible', comb.total,
        'mantenimiento', mant.total,
        'anual_prorateado', anual.total,
        'sueldo_chofer_prorateado', sueldo.total,
        'costo_centro_prorateado', centro.total,
        'km', bit.km,
        'resultado',
          coalesce(f.monto, 0) - coalesce(comb.total, 0) - coalesce(mant.total, 0)
          - coalesce(anual.total, 0) - coalesce(sueldo.total, 0) - coalesce(centro.total, 0)
      ) order by u.descripcion)
      from unidades u
      left join costos_empresa_facturado f on f.id_unidad = u.id and f.mes = v_desde
      left join lateral (
        select sum(cc.precio_total) as total from combustible_cargas cc
        where cc.id_unidad = u.id and cc.fecha >= v_desde and cc.fecha < v_hasta
      ) comb on true
      left join lateral (
        select sum(c.monto) as total from costos c join ot_cabecera ot on ot.id = c.id_ot
        where ot.id_unidad = u.id and c.fecha >= v_desde and c.fecha < v_hasta
      ) mant on true
      left join lateral (
        select sum(ca.monto_anual) / 12 as total from costos_empresa_anual ca
        where ca.id_unidad = u.id and ca.anio = v_anio
      ) anual on true
      left join lateral (
        -- El sueldo del chofer se reparte entre las unidades que manejó ese mes.
        select sum(sc.monto / nullif(cant.n, 0)) as total
        from bitacora_viajes bv
        join costos_empresa_sueldo_chofer sc on sc.id_chofer = bv.id_chofer and sc.mes = v_desde
        join lateral (
          select count(distinct bv2.id_unidad) as n from bitacora_viajes bv2
          where bv2.id_chofer = bv.id_chofer and bv2.fecha >= v_desde and bv2.fecha < v_hasta
        ) cant on true
        where bv.id_unidad = u.id and bv.fecha >= v_desde and bv.fecha < v_hasta
        group by bv.id_unidad
      ) sueldo on true
      left join lateral (
        select sum(cec.monto / nullif(cant_u.n, 0)) as total
        from costos_empresa_centro cec
        join lateral (
          select count(*) as n from unidades u2
          where u2.centro_costo = cec.centro_costo and u2.empresa_id = v_empresa and u2.activo
        ) cant_u on true
        where cec.centro_costo = u.centro_costo and cec.mes = v_desde and u.centro_costo is not null
      ) centro on true
      left join lateral (
        select sum(bv.km) as km from bitacora_viajes bv
        where bv.id_unidad = u.id and bv.fecha >= v_desde and bv.fecha < v_hasta
      ) bit on true
      where u.empresa_id = v_empresa and u.activo
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function guardar_facturado_masivo(jsonb) to authenticated;
grant execute on function guardar_costo_anual(uuid, int, text, numeric) to authenticated;
grant execute on function eliminar_costo_anual(uuid) to authenticated;
grant execute on function guardar_sueldo_chofer(uuid, date, numeric) to authenticated;
grant execute on function eliminar_sueldo_chofer(uuid) to authenticated;
grant execute on function guardar_costo_centro(text, date, text, numeric) to authenticated;
grant execute on function eliminar_costo_centro(uuid) to authenticated;
grant execute on function get_resultado_neto(date) to authenticated;
