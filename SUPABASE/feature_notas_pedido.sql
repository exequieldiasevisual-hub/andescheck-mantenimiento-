-- =====================================================================
-- Notas de pedido (pedido interno de material desde una unidad).
--   Circuito: chofer/técnico/jefe de taller la crean (Pendiente) ->
--   administrador/supervisor aprueba o rechaza (motivo obligatorio) ->
--   Aprobada -> el admin la marca Cumplida cargando el costo total, que
--   se registra como otro gasto de la unidad (otros_gastos_unidad) y por
--   lo tanto suma solo al resultado neto de Reportes.
--   Cada ítem: producto (texto libre), cantidad, foto OBLIGATORIA, obs.
--   id_cliente evita duplicados cuando una nota encolada offline se
--   reintenta.
-- =====================================================================

create table if not exists notas_pedido (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  numero int not null,
  id_cliente uuid,
  id_unidad uuid not null references unidades(id) on delete cascade,
  id_solicitante uuid not null references usuarios(id),
  fecha timestamptz not null default now(),
  prioridad text not null default 'normal' check (prioridad in ('normal','urgente')),
  observacion text,
  estado text not null default 'Pendiente' check (estado in ('Pendiente','Aprobada','Rechazada','Cumplida')),
  id_resolutor uuid references usuarios(id),
  fecha_resolucion timestamptz,
  motivo_rechazo text,
  monto numeric(12,2),
  id_gasto uuid references otros_gastos_unidad(id) on delete set null,
  fecha_cumplida timestamptz,
  unique (empresa_id, numero)
);
create unique index if not exists idx_notas_pedido_id_cliente
  on notas_pedido(empresa_id, id_cliente) where id_cliente is not null;
create index if not exists idx_notas_pedido_unidad on notas_pedido(id_unidad, fecha);

create table if not exists notas_pedido_items (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  id_nota uuid not null references notas_pedido(id) on delete cascade,
  producto text not null,
  cantidad numeric(12,2) not null check (cantidad > 0),
  foto_url text not null,
  observacion text
);
create index if not exists idx_notas_pedido_items_nota on notas_pedido_items(id_nota);

alter table notas_pedido enable row level security;
alter table notas_pedido_items enable row level security;

drop policy if exists lectura_notas_pedido on notas_pedido;
create policy lectura_notas_pedido on notas_pedido for select using (
  empresa_id = empresa_actual()
  and (
    rol_actual() in ('administrador','supervisor','auditor')
    or id_solicitante = (select id from usuarios where auth_user_id = auth.uid())
  )
);

drop policy if exists lectura_notas_pedido_items on notas_pedido_items;
create policy lectura_notas_pedido_items on notas_pedido_items for select using (
  empresa_id = empresa_actual()
  and exists (select 1 from notas_pedido n where n.id = id_nota)  -- hereda la policy de la nota
);

-- =====================================================================
-- crear_nota_pedido
-- p_items: [{"producto": "...", "cantidad": 2, "foto_url": "...", "observacion": "..."}]
-- =====================================================================
create or replace function crear_nota_pedido(
  p_id_unidad uuid,
  p_prioridad text,
  p_observacion text,
  p_items jsonb,
  p_id_cliente uuid default null
) returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_usuario uuid;
  v_id uuid;
  v_numero int;
  v_item jsonb;
begin
  if rol_actual() not in ('administrador','supervisor','jefe_taller','tecnico','chofer') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para crear notas de pedido');
  end if;
  select id into v_usuario from usuarios where auth_user_id = auth.uid();

  if not exists (select 1 from unidades where id = p_id_unidad and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Unidad inválida');
  end if;
  if coalesce(p_prioridad, 'normal') not in ('normal','urgente') then
    return jsonb_build_object('ok', false, 'msg', 'Prioridad inválida');
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('ok', false, 'msg', 'Cargá al menos un producto');
  end if;

  -- Reintento de una nota ya creada (cola offline): no se duplica.
  if p_id_cliente is not null then
    select id, numero into v_id, v_numero from notas_pedido
    where empresa_id = v_empresa and id_cliente = p_id_cliente;
    if found then
      return jsonb_build_object('ok', true, 'id', v_id, 'numero', v_numero, 'repetida', true);
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce(trim(v_item->>'producto'), '') = '' then
      return jsonb_build_object('ok', false, 'msg', 'Todos los productos necesitan nombre');
    end if;
    if coalesce((v_item->>'cantidad')::numeric, 0) <= 0 then
      return jsonb_build_object('ok', false, 'msg', 'Todas las cantidades deben ser mayores a 0');
    end if;
    if coalesce(trim(v_item->>'foto_url'), '') = '' then
      return jsonb_build_object('ok', false, 'msg', 'La foto es obligatoria en cada producto');
    end if;
  end loop;

  -- Numeración correlativa por empresa (el lock evita números repetidos).
  perform pg_advisory_xact_lock(hashtext('notas_pedido_' || v_empresa::text));
  select coalesce(max(numero), 0) + 1 into v_numero from notas_pedido where empresa_id = v_empresa;

  insert into notas_pedido (empresa_id, numero, id_cliente, id_unidad, id_solicitante, prioridad, observacion)
  values (v_empresa, v_numero, p_id_cliente, p_id_unidad, v_usuario, coalesce(p_prioridad, 'normal'), nullif(trim(p_observacion), ''))
  returning id into v_id;

  insert into notas_pedido_items (empresa_id, id_nota, producto, cantidad, foto_url, observacion)
  select v_empresa, v_id, trim(i->>'producto'), (i->>'cantidad')::numeric, i->>'foto_url', nullif(trim(i->>'observacion'), '')
  from jsonb_array_elements(p_items) i;

  return jsonb_build_object('ok', true, 'id', v_id, 'numero', v_numero);
end;
$$;

-- =====================================================================
-- resolver_nota_pedido: aprobar o rechazar (motivo obligatorio al rechazar)
-- =====================================================================
create or replace function resolver_nota_pedido(
  p_id uuid,
  p_aprobar boolean,
  p_motivo text default null
) returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_usuario uuid;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Solo administrador o supervisor pueden resolver notas');
  end if;
  select id into v_usuario from usuarios where auth_user_id = auth.uid();

  if not p_aprobar and coalesce(trim(p_motivo), '') = '' then
    return jsonb_build_object('ok', false, 'msg', 'El motivo del rechazo es obligatorio');
  end if;

  update notas_pedido
     set estado = case when p_aprobar then 'Aprobada' else 'Rechazada' end,
         id_resolutor = v_usuario,
         fecha_resolucion = now(),
         motivo_rechazo = case when p_aprobar then null else trim(p_motivo) end
   where id = p_id and empresa_id = v_empresa and estado = 'Pendiente';

  if not found then
    return jsonb_build_object('ok', false, 'msg', 'La nota no existe o ya fue resuelta');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- =====================================================================
-- cumplir_nota_pedido: Aprobada -> Cumplida, carga el costo total como
-- otro gasto de la unidad.
-- =====================================================================
create or replace function cumplir_nota_pedido(
  p_id uuid,
  p_monto numeric
) returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_usuario uuid;
  v_nota notas_pedido%rowtype;
  v_gasto uuid;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Solo administrador o supervisor pueden cumplir notas');
  end if;
  if p_monto is null or p_monto < 0 then
    return jsonb_build_object('ok', false, 'msg', 'Ingresá el costo (0 si no tuvo costo)');
  end if;
  select id into v_usuario from usuarios where auth_user_id = auth.uid();

  select * into v_nota from notas_pedido
  where id = p_id and empresa_id = v_empresa and estado = 'Aprobada' for update;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'La nota no existe o no está aprobada');
  end if;

  insert into otros_gastos_unidad (empresa_id, id_unidad, fecha, concepto, monto, usuario_alta)
  values (v_empresa, v_nota.id_unidad, now(), 'Nota de pedido #' || v_nota.numero, p_monto, v_usuario)
  returning id into v_gasto;

  update notas_pedido
     set estado = 'Cumplida', monto = p_monto, id_gasto = v_gasto, fecha_cumplida = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'id_gasto', v_gasto);
end;
$$;

-- Realtime: el admin ve entrar notas nuevas sin recargar.
do $$
begin
  alter publication supabase_realtime add table notas_pedido;
exception
  when duplicate_object then null;
end $$;
