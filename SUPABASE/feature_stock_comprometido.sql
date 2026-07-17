-- =====================================================================
-- Feature: Stock comprometido
-- stock.stock_actual = físico en estantería. stock_comprometido = reservado
-- por OTs abiertas creadas desde una secuencia. stock_disponible es columna
-- generada (actual - comprometido) — nunca se guarda un valor derivado
-- que pueda desincronizarse.
--
-- secuencias_repuestos define qué y cuánto consume cada secuencia
-- (ej. "Service 10K" -> 1 Filtro de Aceite + 4 Litros de Aceite).
--
-- crear_ot con secuencia: SUMA a stock_comprometido (reserva).
-- cerrar_ot: RESTA de comprometido y de actual (consumo real), registra
--   el egreso en stock_movimientos.
-- anular_ot: RESTA de comprometido sin tocar actual (libera la reserva).
--
-- No bloquea la creación de la OT si el disponible queda negativo — el
-- frontend solo advierte ("Falta repuesto"), la reserva igual se hace,
-- como pide el requerimiento.
-- =====================================================================

alter table stock add column if not exists stock_comprometido numeric(12,2) not null default 0;
alter table stock add column if not exists stock_disponible numeric(12,2)
  generated always as (stock_actual - stock_comprometido) stored;

create table if not exists secuencias_repuestos (
  id uuid primary key default gen_random_uuid(),
  id_secuencia uuid not null references secuencias(id) on delete cascade,
  id_repuesto uuid not null references stock(id),
  cantidad numeric(12,2) not null
);
create index if not exists idx_secuencias_repuestos_secuencia on secuencias_repuestos(id_secuencia);

alter table secuencias_repuestos enable row level security;

create policy "lectura_secuencias_repuestos" on secuencias_repuestos for select using (
  exists (select 1 from secuencias s where s.id = secuencias_repuestos.id_secuencia and s.empresa_id = empresa_actual())
);
create policy "escritura_secuencias_repuestos" on secuencias_repuestos for all using (
  rol_actual() in ('administrador','supervisor')
  and exists (select 1 from secuencias s where s.id = secuencias_repuestos.id_secuencia and s.empresa_id = empresa_actual())
);

-- ---------------------------------------------------------------------
-- crear_ot — agrega reserva de stock_comprometido según secuencias_repuestos.
-- ---------------------------------------------------------------------
create or replace function crear_ot(
  p_id_unidad uuid,
  p_tipo text,
  p_descripcion text,
  p_prioridad text default null,
  p_fecha_est_cierre timestamptz default null,
  p_id_secuencia uuid default null,
  p_id_novedad_origen uuid default null,
  p_proveedor uuid default null,
  p_tecnicos_asignados uuid[] default '{}'
)
returns jsonb language plpgsql security definer as $$
declare
  v_rol rol_usuario;
  v_empresa uuid;
  v_id_usuario uuid;
  v_id_ot uuid;
  v_tarea record;
  v_repuesto record;
  v_checklist jsonb := '[]'::jsonb;
begin
  v_rol := rol_actual();
  v_empresa := empresa_actual();

  if v_rol not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para crear OT');
  end if;

  if not exists (select 1 from unidades where id = p_id_unidad and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  if p_id_secuencia is not null
     and not exists (select 1 from secuencias where id = p_id_secuencia and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Secuencia no encontrada');
  end if;

  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();

  if p_id_secuencia is not null then
    select coalesce(jsonb_agg(item || jsonb_build_object('checked', false)), '[]'::jsonb)
      into v_checklist
      from (select jsonb_array_elements(checklist_items) as item from secuencias where id = p_id_secuencia) s;
  end if;

  insert into ot_cabecera (empresa_id, numero_ot, id_unidad, tipo, descripcion, prioridad, fecha_est_cierre,
                           id_secuencia, id_novedad_origen, proveedor, tecnicos_asignados, supervisor, checklist_completado)
  values (v_empresa, generar_numero_ot(v_empresa), p_id_unidad, p_tipo, p_descripcion, p_prioridad, p_fecha_est_cierre,
          p_id_secuencia, p_id_novedad_origen, p_proveedor, p_tecnicos_asignados, v_id_usuario, v_checklist)
  returning id into v_id_ot;

  if p_id_secuencia is not null then
    for v_tarea in
      select orden, descripcion from secuencias_tareas
       where id_secuencia = p_id_secuencia order by orden
    loop
      insert into ot_tareas (id_ot, orden, descripcion)
      values (v_id_ot, v_tarea.orden, v_tarea.descripcion);
    end loop;

    for v_repuesto in
      select id_repuesto, cantidad from secuencias_repuestos where id_secuencia = p_id_secuencia
    loop
      update stock set stock_comprometido = stock_comprometido + v_repuesto.cantidad
       where id = v_repuesto.id_repuesto;
    end loop;
  end if;

  if p_id_novedad_origen is not null then
    update novedades
       set estado = 'Derivada_a_OT', id_ot_vinculada = v_id_ot
     where id = p_id_novedad_origen and empresa_id = v_empresa;
  end if;

  return jsonb_build_object('ok', true, 'id_ot', v_id_ot);
end;
$$;

-- ---------------------------------------------------------------------
-- cerrar_ot — al cerrar, el stock reservado se consume de verdad: resta
-- de comprometido y de actual, y deja el registro en stock_movimientos.
-- ---------------------------------------------------------------------
create or replace function cerrar_ot(p_id_ot uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_rol rol_usuario;
  v_empresa uuid;
  v_ot ot_cabecera%rowtype;
  v_tareas_pend int;
  v_checklist_pend int;
  v_estado_final estado_ot;
  v_id_usuario uuid;
  v_repuesto record;
begin
  v_rol := rol_actual();
  v_empresa := empresa_actual();

  if v_rol not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para cerrar OT');
  end if;

  select * into v_ot from ot_cabecera where id = p_id_ot and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'OT no encontrada');
  end if;

  if v_ot.estado in ('Cerrada','Cerrada_Vencida','Anulada') then
    return jsonb_build_object('ok', false, 'msg', 'La OT ya está ' || v_ot.estado);
  end if;

  select count(*) into v_tareas_pend
    from ot_tareas where id_ot = p_id_ot and estado <> 'Completada';

  if v_tareas_pend > 0 then
    return jsonb_build_object('ok', false, 'msg',
      '⛔ No se puede cerrar: ' || v_tareas_pend || ' tarea(s) sin completar');
  end if;

  select count(*) into v_checklist_pend
    from jsonb_array_elements(v_ot.checklist_completado) item
   where (item->>'requerido')::boolean is true and (item->>'checked')::boolean is not true;

  if v_checklist_pend > 0 then
    return jsonb_build_object('ok', false, 'msg',
      '⛔ No se puede cerrar: ' || v_checklist_pend || ' ítem(s) obligatorio(s) del checklist sin marcar');
  end if;

  v_estado_final := case
    when v_ot.fecha_est_cierre is not null and now() > v_ot.fecha_est_cierre
      then 'Cerrada_Vencida'
    else 'Cerrada'
  end;

  update ot_cabecera
     set estado = v_estado_final, fecha_cierre = now()
   where id = p_id_ot;

  if v_ot.id_novedad_origen is not null then
    update novedades set estado = 'Cerrada' where id = v_ot.id_novedad_origen;
  end if;

  if v_ot.id_secuencia is not null then
    select id into v_id_usuario from usuarios where auth_user_id = auth.uid();

    for v_repuesto in
      select id_repuesto, cantidad from secuencias_repuestos where id_secuencia = v_ot.id_secuencia
    loop
      update stock
         set stock_comprometido = stock_comprometido - v_repuesto.cantidad,
             stock_actual = stock_actual - v_repuesto.cantidad
       where id = v_repuesto.id_repuesto;

      insert into stock_movimientos (id_repuesto, tipo, cantidad, id_ot, usuario, observacion)
      values (v_repuesto.id_repuesto, 'egreso', v_repuesto.cantidad, p_id_ot, v_id_usuario, 'Consumo automático por cierre de OT (secuencia)');
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'estado', v_estado_final);
end;
$$;

-- ---------------------------------------------------------------------
-- anular_ot — libera la reserva de stock_comprometido sin tocar el físico
-- (nunca se llegó a consumir).
-- ---------------------------------------------------------------------
create or replace function anular_ot(p_id_ot uuid, p_motivo text)
returns jsonb language plpgsql security definer as $$
declare
  v_rol rol_usuario;
  v_empresa uuid;
  v_ot ot_cabecera%rowtype;
  v_repuesto record;
begin
  v_rol := rol_actual();
  v_empresa := empresa_actual();

  if v_rol not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para anular OT');
  end if;

  if p_motivo is null or trim(p_motivo) = '' then
    return jsonb_build_object('ok', false, 'msg', 'El motivo de anulación es obligatorio');
  end if;

  select * into v_ot from ot_cabecera where id = p_id_ot and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'OT no encontrada');
  end if;

  if v_ot.estado in ('Cerrada','Cerrada_Vencida','Anulada') then
    return jsonb_build_object('ok', false, 'msg', 'La OT ya está ' || v_ot.estado);
  end if;

  update ot_cabecera
     set estado = 'Anulada', fecha_cierre = now(), motivo_anulacion = trim(p_motivo)
   where id = p_id_ot;

  if v_ot.id_novedad_origen is not null then
    update novedades
       set estado = 'Pendiente', id_ot_vinculada = null
     where id = v_ot.id_novedad_origen;
  end if;

  if v_ot.id_secuencia is not null then
    for v_repuesto in
      select id_repuesto, cantidad from secuencias_repuestos where id_secuencia = v_ot.id_secuencia
    loop
      update stock set stock_comprometido = stock_comprometido - v_repuesto.cantidad
       where id = v_repuesto.id_repuesto;
    end loop;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;
