-- =====================================================================
-- Fase 2 — Historiales y trazabilidad.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Historial de Km/Hs de unidades — vía trigger, así queda registrado
-- sin importar por dónde se actualice (fila de Unidades, o al crear una
-- OT con lectura de km/hs).
-- ---------------------------------------------------------------------
create table if not exists unidad_km_hs_historial (
  id uuid primary key default gen_random_uuid(),
  id_unidad uuid not null references unidades(id) on delete cascade,
  km_actuales numeric(12,2),
  hs_actuales numeric(12,2),
  fecha timestamptz not null default now(),
  usuario uuid references usuarios(id)
);
create index if not exists idx_unidad_km_hs_historial_unidad on unidad_km_hs_historial(id_unidad);
alter table unidad_km_hs_historial enable row level security;

create policy "lectura_km_hs_historial" on unidad_km_hs_historial for select using (
  exists (select 1 from unidades u where u.id = unidad_km_hs_historial.id_unidad and u.empresa_id = empresa_actual())
);
grant select on unidad_km_hs_historial to authenticated;

create or replace function _log_km_hs_unidad() returns trigger language plpgsql security definer as $$
begin
  if (new.km_actuales is distinct from old.km_actuales) or (new.hs_actuales is distinct from old.hs_actuales) then
    insert into unidad_km_hs_historial (id_unidad, km_actuales, hs_actuales, usuario)
    values (new.id, new.km_actuales, new.hs_actuales, (select id from usuarios where auth_user_id = auth.uid()));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_km_hs on unidades;
create trigger trg_log_km_hs after update on unidades
for each row execute function _log_km_hs_unidad();

-- ---------------------------------------------------------------------
-- 2) Egreso de stock: registrar a quién se le transfiere. La tabla ya
-- era inmutable (nunca tuvo policy de UPDATE/DELETE) — solo faltaba el
-- campo destinatario.
-- ---------------------------------------------------------------------
alter table stock_movimientos add column if not exists destinatario text;

drop function if exists movimiento_stock(uuid, tipo_movimiento_stock, numeric, uuid, text);

create function movimiento_stock(
  p_id_repuesto uuid,
  p_tipo tipo_movimiento_stock,
  p_cantidad numeric,
  p_id_ot uuid default null,
  p_observacion text default null,
  p_destinatario text default null
)
returns jsonb language plpgsql security definer as $$
declare
  v_rol rol_usuario;
  v_empresa uuid;
  v_id_usuario uuid;
  v_stock_actual numeric;
begin
  v_rol := rol_actual();
  v_empresa := empresa_actual();

  if v_rol not in ('administrador','supervisor','tecnico') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para registrar movimiento de stock');
  end if;

  if p_cantidad <= 0 then
    return jsonb_build_object('ok', false, 'msg', 'La cantidad debe ser mayor a cero');
  end if;

  if p_tipo = 'egreso' and (p_destinatario is null or trim(p_destinatario) = '') then
    return jsonb_build_object('ok', false, 'msg', 'El destinatario es obligatorio para un egreso');
  end if;

  select stock_actual into v_stock_actual
    from stock where id = p_id_repuesto and empresa_id = v_empresa for update;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Repuesto no encontrado');
  end if;

  if p_id_ot is not null and not exists (select 1 from ot_cabecera where id = p_id_ot and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'OT no encontrada');
  end if;

  if p_tipo = 'egreso' and v_stock_actual - p_cantidad < 0 then
    return jsonb_build_object('ok', false, 'msg', 'Stock insuficiente');
  end if;

  update stock
     set stock_actual = stock_actual + (case when p_tipo = 'ingreso' then p_cantidad else -p_cantidad end)
   where id = p_id_repuesto;

  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();

  insert into stock_movimientos (id_repuesto, tipo, cantidad, id_ot, usuario, observacion, destinatario)
  values (p_id_repuesto, p_tipo, p_cantidad, p_id_ot, v_id_usuario, p_observacion, p_destinatario);

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function movimiento_stock(uuid, tipo_movimiento_stock, numeric, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3) Documentos: edición + historial de cambios (trigger, snapshot del
-- valor anterior de los campos editables) + "última actualización".
-- ---------------------------------------------------------------------
alter table unidad_docs add column if not exists actualizado_en timestamptz;
alter table unidad_docs add column if not exists actualizado_por uuid references usuarios(id);

create table if not exists unidad_docs_historial (
  id uuid primary key default gen_random_uuid(),
  id_documento uuid not null references unidad_docs(id) on delete cascade,
  fecha timestamptz not null default now(),
  usuario uuid references usuarios(id),
  fecha_vigencia_desde_anterior date,
  fecha_vigencia_hasta_anterior date,
  observaciones_anterior text
);
create index if not exists idx_unidad_docs_historial_doc on unidad_docs_historial(id_documento);
alter table unidad_docs_historial enable row level security;

create policy "lectura_docs_historial" on unidad_docs_historial for select using (
  exists (
    select 1 from unidad_docs d join unidades u on u.id = d.id_unidad
    where d.id = unidad_docs_historial.id_documento and u.empresa_id = empresa_actual()
  )
);
grant select on unidad_docs_historial to authenticated;

create or replace function _log_edicion_doc() returns trigger language plpgsql security definer as $$
begin
  insert into unidad_docs_historial (id_documento, usuario, fecha_vigencia_desde_anterior, fecha_vigencia_hasta_anterior, observaciones_anterior)
  values (old.id, (select id from usuarios where auth_user_id = auth.uid()), old.fecha_vigencia_desde, old.fecha_vigencia_hasta, old.observaciones);
  new.actualizado_en := now();
  new.actualizado_por := (select id from usuarios where auth_user_id = auth.uid());
  return new;
end;
$$;

drop trigger if exists trg_log_edicion_doc on unidad_docs;
create trigger trg_log_edicion_doc before update on unidad_docs
for each row execute function _log_edicion_doc();

-- RPC para editar (numero y unidad no se tocan — solo lo que puede cambiar
-- con el tiempo: vigencia, archivo, observaciones).
create or replace function actualizar_documento_unidad(
  p_id uuid, p_fecha_vigencia_desde date, p_fecha_vigencia_hasta date,
  p_archivo_url text, p_observaciones text
)
returns jsonb language plpgsql security definer as $$
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  update unidad_docs
     set fecha_vigencia_desde = p_fecha_vigencia_desde,
         fecha_vigencia_hasta = p_fecha_vigencia_hasta,
         archivo_url = coalesce(p_archivo_url, archivo_url),
         observaciones = p_observaciones
   where id = p_id
     and exists (select 1 from unidades u where u.id = unidad_docs.id_unidad and u.empresa_id = empresa_actual());

  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Documento no encontrado');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function actualizar_documento_unidad(uuid, date, date, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4) Geolocalización en novedades — solo un link a mapa, no tracking en
-- vivo. El frontend captura lat/long del navegador al crear la novedad.
-- ---------------------------------------------------------------------
alter table novedades add column if not exists ubicacion_url text;
