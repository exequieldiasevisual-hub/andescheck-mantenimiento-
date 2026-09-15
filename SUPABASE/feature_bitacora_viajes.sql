-- =====================================================================
-- Bitácora de viajes. El administrador crea el viaje (unidad, chofer,
-- origen/destino, ubicación en Maps, celular de contacto, km estimados,
-- saldo de viáticos + método). El chofer va cargando gastos sueltos con
-- foto de ticket durante el viaje, y al terminar rinde y firma — recién
-- ahí el administrador da el OK final que cierra el viaje.
--
-- IMPORTANTE: antes de correr este archivo hay que correr
-- feature_rol_chofer.sql (el rol 'chofer' tiene que existir ya).
--
-- Estados: 'En_curso' (chofer puede seguir cargando gastos) ->
-- 'Rendido' (chofer ya firmó, esperando aprobación) -> 'Aprobado' (cerrado).
-- =====================================================================

create table if not exists bitacora_viajes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  id_unidad uuid not null references unidades(id) on delete restrict,
  id_chofer uuid not null references usuarios(id),
  fecha date not null default current_date,
  origen text,
  destino text not null,
  ubicacion_maps_url text,
  celular_contacto text,
  km numeric(10,2),
  viaticos_monto numeric(12,2) not null default 0,
  viaticos_metodo text check (viaticos_metodo in ('Transferencia','Cheque','Efectivo')),
  estado text not null default 'En_curso' check (estado in ('En_curso','Rendido','Aprobado')),
  firma_url text,
  fecha_rendicion timestamptz,
  fecha_aprobacion timestamptz,
  aprobado_por uuid references usuarios(id),
  usuario_alta uuid references usuarios(id),
  fecha_alta timestamptz not null default now()
);
create index if not exists idx_bitacora_viajes_empresa on bitacora_viajes(empresa_id);
create index if not exists idx_bitacora_viajes_unidad on bitacora_viajes(id_unidad, fecha);
create index if not exists idx_bitacora_viajes_chofer on bitacora_viajes(id_chofer, fecha);

create table if not exists bitacora_gastos (
  id uuid primary key default gen_random_uuid(),
  id_viaje uuid not null references bitacora_viajes(id) on delete cascade,
  concepto text not null,
  monto numeric(12,2) not null check (monto >= 0),
  foto_url text,
  fecha_alta timestamptz not null default now()
);
create index if not exists idx_bitacora_gastos_viaje on bitacora_gastos(id_viaje);

alter table bitacora_viajes enable row level security;
alter table bitacora_gastos enable row level security;

-- Lectura: admin/supervisor ven todos los viajes de la empresa; el chofer
-- solo los suyos.
drop policy if exists "lectura_bitacora_viajes" on bitacora_viajes;
create policy "lectura_bitacora_viajes" on bitacora_viajes for select using (
  empresa_id = empresa_actual()
  and (
    rol_actual() in ('administrador','supervisor')
    or id_chofer = (select id from usuarios where auth_user_id = auth.uid())
  )
);
grant select on bitacora_viajes to authenticated;

drop policy if exists "lectura_bitacora_gastos" on bitacora_gastos;
create policy "lectura_bitacora_gastos" on bitacora_gastos for select using (
  exists (
    select 1 from bitacora_viajes v
    where v.id = bitacora_gastos.id_viaje
      and v.empresa_id = empresa_actual()
      and (
        rol_actual() in ('administrador','supervisor')
        or v.id_chofer = (select id from usuarios where auth_user_id = auth.uid())
      )
  )
);
grant select on bitacora_gastos to authenticated;
-- Sin policy de insert/update/delete directa en ninguna de las dos: todo pasa por RPC.

-- ---------------------------------------------------------------------
-- crear_viaje_bitacora: solo administrador/supervisor.
-- ---------------------------------------------------------------------
create or replace function crear_viaje_bitacora(
  p_id_unidad uuid, p_id_chofer uuid, p_fecha date, p_origen text, p_destino text,
  p_ubicacion_maps_url text, p_celular_contacto text, p_km numeric,
  p_viaticos_monto numeric, p_viaticos_metodo text
)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_id_usuario uuid;
  v_id_viaje uuid;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para crear viajes');
  end if;

  if p_destino is null or trim(p_destino) = '' then
    return jsonb_build_object('ok', false, 'msg', 'El destino es obligatorio');
  end if;

  if not exists (select 1 from unidades where id = p_id_unidad and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  if not exists (select 1 from usuarios where id = p_id_chofer and empresa_id = v_empresa and rol = 'chofer' and activo) then
    return jsonb_build_object('ok', false, 'msg', 'Chofer no encontrado');
  end if;

  if p_viaticos_monto > 0 and p_viaticos_metodo is null then
    return jsonb_build_object('ok', false, 'msg', 'Falta el método de los viáticos');
  end if;

  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();

  insert into bitacora_viajes (
    empresa_id, id_unidad, id_chofer, fecha, origen, destino, ubicacion_maps_url,
    celular_contacto, km, viaticos_monto, viaticos_metodo, usuario_alta
  )
  values (
    v_empresa, p_id_unidad, p_id_chofer, coalesce(p_fecha, current_date),
    nullif(trim(coalesce(p_origen, '')), ''), trim(p_destino), nullif(trim(coalesce(p_ubicacion_maps_url, '')), ''),
    nullif(trim(coalesce(p_celular_contacto, '')), ''), p_km, coalesce(p_viaticos_monto, 0), p_viaticos_metodo, v_id_usuario
  )
  returning id into v_id_viaje;

  return jsonb_build_object('ok', true, 'id_viaje', v_id_viaje);
end;
$$;
grant execute on function crear_viaje_bitacora(uuid, uuid, date, text, text, text, text, numeric, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- registrar_gasto_bitacora: el chofer asignado carga un gasto (o
-- admin/supervisor, por si hace falta cargarlo a mano). Solo mientras el
-- viaje sigue En_curso.
-- ---------------------------------------------------------------------
create or replace function registrar_gasto_bitacora(p_id_viaje uuid, p_concepto text, p_monto numeric, p_foto_url text default null)
returns jsonb language plpgsql security definer as $$
declare
  v_viaje bitacora_viajes%rowtype;
  v_id_usuario uuid;
  v_id_gasto uuid;
begin
  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();
  select * into v_viaje from bitacora_viajes where id = p_id_viaje and empresa_id = empresa_actual();

  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Viaje no encontrado');
  end if;

  if rol_actual() not in ('administrador','supervisor') and v_viaje.id_chofer <> v_id_usuario then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para cargar gastos en este viaje');
  end if;

  if v_viaje.estado <> 'En_curso' then
    return jsonb_build_object('ok', false, 'msg', 'El viaje ya fue rendido, no se pueden agregar más gastos');
  end if;

  if p_concepto is null or trim(p_concepto) = '' or p_monto is null or p_monto < 0 then
    return jsonb_build_object('ok', false, 'msg', 'Faltan campos obligatorios');
  end if;

  insert into bitacora_gastos (id_viaje, concepto, monto, foto_url)
  values (p_id_viaje, trim(p_concepto), p_monto, p_foto_url)
  returning id into v_id_gasto;

  return jsonb_build_object('ok', true, 'id_gasto', v_id_gasto);
end;
$$;
grant execute on function registrar_gasto_bitacora(uuid, text, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- rendir_viaje: el chofer asignado cierra su rendición y firma. Pasa a
-- 'Rendido', queda esperando el OK del administrador.
-- p_firma_url ahora tiene default null (ver fix_rendir_viaje_firma_opcional_offline.sql) —
-- se dropea antes por si este archivo se re-corre después de ese fix.
-- ---------------------------------------------------------------------
drop function if exists rendir_viaje(uuid, text);
create or replace function rendir_viaje(p_id_viaje uuid, p_firma_url text default null)
returns jsonb language plpgsql security definer as $$
declare
  v_viaje bitacora_viajes%rowtype;
  v_id_usuario uuid;
begin
  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();
  select * into v_viaje from bitacora_viajes where id = p_id_viaje and empresa_id = empresa_actual();

  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Viaje no encontrado');
  end if;

  if v_viaje.id_chofer <> v_id_usuario then
    return jsonb_build_object('ok', false, 'msg', 'Solo el chofer asignado puede rendir este viaje');
  end if;

  if v_viaje.estado <> 'En_curso' then
    return jsonb_build_object('ok', false, 'msg', 'Este viaje ya fue rendido');
  end if;

  update bitacora_viajes
     set estado = 'Rendido', firma_url = coalesce(p_firma_url, firma_url), fecha_rendicion = now()
   where id = p_id_viaje;

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function rendir_viaje(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- aprobar_viaje: administrador/supervisor da el OK final, queda cerrado.
-- ---------------------------------------------------------------------
create or replace function aprobar_viaje(p_id_viaje uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_id_usuario uuid;
  v_estado text;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para aprobar viajes');
  end if;

  select estado into v_estado from bitacora_viajes where id = p_id_viaje and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Viaje no encontrado');
  end if;
  if v_estado <> 'Rendido' then
    return jsonb_build_object('ok', false, 'msg', 'El viaje todavía no fue rendido por el chofer');
  end if;

  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();

  update bitacora_viajes
     set estado = 'Aprobado', fecha_aprobacion = now(), aprobado_por = v_id_usuario
   where id = p_id_viaje;

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function aprobar_viaje(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- eliminar_viaje: administrador — solo si todavía no fue rendido.
-- ---------------------------------------------------------------------
create or replace function eliminar_viaje_bitacora(p_id_viaje uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_estado text;
begin
  if rol_actual() <> 'administrador' then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para eliminar viajes');
  end if;

  select estado into v_estado from bitacora_viajes where id = p_id_viaje and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Viaje no encontrado');
  end if;
  if v_estado <> 'En_curso' then
    return jsonb_build_object('ok', false, 'msg', 'Solo se puede eliminar un viaje que todavía no fue rendido');
  end if;

  delete from bitacora_viajes where id = p_id_viaje;

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function eliminar_viaje_bitacora(uuid) to authenticated;
