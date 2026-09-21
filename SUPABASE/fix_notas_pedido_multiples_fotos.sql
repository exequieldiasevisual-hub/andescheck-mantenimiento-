-- =====================================================================
-- Notas de pedido: hasta 3 fotos por producto (mínimo 1).
-- Se agrega notas_pedido_items.fotos_urls (text[]); foto_url queda como la
-- primera foto (columna original, obligatoria). Correr DESPUÉS de
-- feature_notas_pedido.sql. crear_nota_pedido ahora recibe en cada ítem
-- "fotos_urls": [...] (1 a 3 URLs).
-- =====================================================================

alter table notas_pedido_items add column if not exists fotos_urls text[];
update notas_pedido_items set fotos_urls = array[foto_url] where fotos_urls is null;

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
  v_cant_fotos int;
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
    v_cant_fotos := case when jsonb_typeof(v_item->'fotos_urls') = 'array' then jsonb_array_length(v_item->'fotos_urls') else 0 end;
    if v_cant_fotos < 1 then
      return jsonb_build_object('ok', false, 'msg', 'La foto es obligatoria en cada producto');
    end if;
    if v_cant_fotos > 3 then
      return jsonb_build_object('ok', false, 'msg', 'Máximo 3 fotos por producto');
    end if;
  end loop;

  -- Numeración correlativa por empresa (el lock evita números repetidos).
  perform pg_advisory_xact_lock(hashtext('notas_pedido_' || v_empresa::text));
  select coalesce(max(numero), 0) + 1 into v_numero from notas_pedido where empresa_id = v_empresa;

  insert into notas_pedido (empresa_id, numero, id_cliente, id_unidad, id_solicitante, prioridad, observacion)
  values (v_empresa, v_numero, p_id_cliente, p_id_unidad, v_usuario, coalesce(p_prioridad, 'normal'), nullif(trim(p_observacion), ''))
  returning id into v_id;

  insert into notas_pedido_items (empresa_id, id_nota, producto, cantidad, foto_url, fotos_urls, observacion)
  select v_empresa, v_id, trim(i->>'producto'), (i->>'cantidad')::numeric,
         i->'fotos_urls'->>0,
         array(select jsonb_array_elements_text(i->'fotos_urls')),
         nullif(trim(i->>'observacion'), '')
  from jsonb_array_elements(p_items) i;

  return jsonb_build_object('ok', true, 'id', v_id, 'numero', v_numero);
end;
$$;
