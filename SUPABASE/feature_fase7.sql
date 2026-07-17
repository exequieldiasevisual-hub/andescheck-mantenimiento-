-- =====================================================================
-- Fase 7 — Stock multi-depósito.
--
-- stock.stock_actual sigue siendo el TOTAL físico (suma de todos los
-- depósitos) — nada que ya lea esa columna (stock_disponible, reservas
-- de secuencias en crear_ot/cerrar_ot/anular_ot) se rompe. Lo nuevo es
-- el desglose por depósito (stock_por_deposito) + movimientos que ahora
-- exigen depósito, + transferencias entre depósitos.
--
-- ponytail: las reservas de secuencias (stock_comprometido) siguen sin
-- distinguir depósito — reservan contra el total, no contra uno en
-- particular. Si hace falta reservar por depósito específico, es una
-- fase aparte; no la until agregamos según necesidad real.
-- =====================================================================

create table if not exists depositos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  nombre text not null,
  activo boolean not null default true,
  unique (empresa_id, nombre)
);
create index if not exists idx_depositos_empresa on depositos(empresa_id);
alter table depositos enable row level security;

create policy "lectura_depositos" on depositos for select using (empresa_id = empresa_actual());
create policy "escritura_depositos" on depositos for all using (empresa_id = empresa_actual() and rol_actual() in ('administrador','supervisor'));

create table if not exists stock_por_deposito (
  id uuid primary key default gen_random_uuid(),
  id_repuesto uuid not null references stock(id) on delete cascade,
  id_deposito uuid not null references depositos(id) on delete cascade,
  cantidad numeric(12,2) not null default 0,
  unique (id_repuesto, id_deposito)
);
create index if not exists idx_stock_por_deposito_repuesto on stock_por_deposito(id_repuesto);
alter table stock_por_deposito enable row level security;

create policy "lectura_stock_por_deposito" on stock_por_deposito for select using (
  exists (select 1 from stock s where s.id = stock_por_deposito.id_repuesto and s.empresa_id = empresa_actual())
);
create policy "escritura_stock_por_deposito" on stock_por_deposito for all using (
  rol_actual() in ('administrador','supervisor')
  and exists (select 1 from stock s where s.id = stock_por_deposito.id_repuesto and s.empresa_id = empresa_actual())
);

-- ---------------------------------------------------------------------
-- Migración: cada empresa con stock cargado recibe un "Depósito
-- Principal", y todo el stock_actual existente se le asigna ahí (así
-- el desglose por depósito arranca consistente con el total actual).
-- ---------------------------------------------------------------------
insert into depositos (empresa_id, nombre)
select distinct empresa_id, 'Depósito Principal' from stock
on conflict (empresa_id, nombre) do nothing;

insert into stock_por_deposito (id_repuesto, id_deposito, cantidad)
select s.id, d.id, s.stock_actual
from stock s
join depositos d on d.empresa_id = s.empresa_id and d.nombre = 'Depósito Principal'
on conflict (id_repuesto, id_deposito) do nothing;

-- ---------------------------------------------------------------------
-- movimiento_stock: ahora exige depósito. Ingreso/egreso impactan el
-- desglose por depósito y recalculan stock.stock_actual como la suma.
-- ---------------------------------------------------------------------
drop function if exists movimiento_stock(uuid, tipo_movimiento_stock, numeric, uuid, text, text);

create function movimiento_stock(
  p_id_repuesto uuid,
  p_tipo tipo_movimiento_stock,
  p_cantidad numeric,
  p_id_deposito uuid,
  p_id_ot uuid default null,
  p_observacion text default null,
  p_destinatario text default null
)
returns jsonb language plpgsql security definer as $$
declare
  v_rol rol_usuario;
  v_empresa uuid;
  v_id_usuario uuid;
  v_cantidad_deposito numeric;
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

  if not exists (select 1 from stock where id = p_id_repuesto and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Repuesto no encontrado');
  end if;

  if not exists (select 1 from depositos where id = p_id_deposito and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Depósito no encontrado');
  end if;

  if p_id_ot is not null and not exists (select 1 from ot_cabecera where id = p_id_ot and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'OT no encontrada');
  end if;

  select coalesce(cantidad, 0) into v_cantidad_deposito
    from stock_por_deposito where id_repuesto = p_id_repuesto and id_deposito = p_id_deposito;

  if p_tipo = 'egreso' and coalesce(v_cantidad_deposito, 0) - p_cantidad < 0 then
    return jsonb_build_object('ok', false, 'msg', 'Stock insuficiente en ese depósito');
  end if;

  insert into stock_por_deposito (id_repuesto, id_deposito, cantidad)
  values (p_id_repuesto, p_id_deposito, case when p_tipo = 'ingreso' then p_cantidad else -p_cantidad end)
  on conflict (id_repuesto, id_deposito)
  do update set cantidad = stock_por_deposito.cantidad + excluded.cantidad;

  update stock
     set stock_actual = (select coalesce(sum(cantidad), 0) from stock_por_deposito where id_repuesto = p_id_repuesto)
   where id = p_id_repuesto;

  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();

  insert into stock_movimientos (id_repuesto, tipo, cantidad, id_ot, usuario, observacion, destinatario)
  values (p_id_repuesto, p_tipo, p_cantidad, p_id_ot, v_id_usuario, p_observacion, p_destinatario);

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function movimiento_stock(uuid, tipo_movimiento_stock, numeric, uuid, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- transferir_stock: mueve cantidad de un depósito a otro. No cambia
-- stock.stock_actual (el total no varía, solo cómo se reparte) — sí
-- queda registrado en stock_movimientos como par egreso/ingreso para
-- mantener trazabilidad.
-- ---------------------------------------------------------------------
create or replace function transferir_stock(
  p_id_repuesto uuid, p_id_deposito_origen uuid, p_id_deposito_destino uuid,
  p_cantidad numeric, p_observacion text default null
)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_id_usuario uuid;
  v_cantidad_origen numeric;
  v_nombre_origen text;
  v_nombre_destino text;
  v_nota text;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para transferir stock');
  end if;

  if p_id_deposito_origen = p_id_deposito_destino then
    return jsonb_build_object('ok', false, 'msg', 'El depósito de origen y destino no pueden ser el mismo');
  end if;

  if p_cantidad <= 0 then
    return jsonb_build_object('ok', false, 'msg', 'La cantidad debe ser mayor a cero');
  end if;

  if not exists (select 1 from stock where id = p_id_repuesto and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Repuesto no encontrado');
  end if;

  select nombre into v_nombre_origen from depositos where id = p_id_deposito_origen and empresa_id = v_empresa;
  select nombre into v_nombre_destino from depositos where id = p_id_deposito_destino and empresa_id = v_empresa;
  if v_nombre_origen is null or v_nombre_destino is null then
    return jsonb_build_object('ok', false, 'msg', 'Depósito no encontrado');
  end if;

  select coalesce(cantidad, 0) into v_cantidad_origen
    from stock_por_deposito where id_repuesto = p_id_repuesto and id_deposito = p_id_deposito_origen;

  if coalesce(v_cantidad_origen, 0) - p_cantidad < 0 then
    return jsonb_build_object('ok', false, 'msg', 'Stock insuficiente en el depósito de origen');
  end if;

  update stock_por_deposito set cantidad = cantidad - p_cantidad
   where id_repuesto = p_id_repuesto and id_deposito = p_id_deposito_origen;

  insert into stock_por_deposito (id_repuesto, id_deposito, cantidad)
  values (p_id_repuesto, p_id_deposito_destino, p_cantidad)
  on conflict (id_repuesto, id_deposito) do update set cantidad = stock_por_deposito.cantidad + excluded.cantidad;

  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();
  v_nota := 'Transferencia: ' || v_nombre_origen || ' → ' || v_nombre_destino || coalesce(' — ' || nullif(trim(p_observacion), ''), '');

  insert into stock_movimientos (id_repuesto, tipo, cantidad, usuario, observacion)
  values (p_id_repuesto, 'egreso', p_cantidad, v_id_usuario, v_nota);
  insert into stock_movimientos (id_repuesto, tipo, cantidad, usuario, observacion)
  values (p_id_repuesto, 'ingreso', p_cantidad, v_id_usuario, v_nota);

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function transferir_stock(uuid, uuid, uuid, numeric, text) to authenticated;
