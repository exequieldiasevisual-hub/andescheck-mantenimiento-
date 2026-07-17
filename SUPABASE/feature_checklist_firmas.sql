-- =====================================================================
-- Feature: Checklist obligatorio + Firmas digitales de cierre de OT
-- Checklist: plantilla en secuencias.checklist_items (jsonb), copiada a
-- ot_cabecera.checklist_completado al crear la OT. cerrar_ot() valida que
-- todo ítem con requerido:true tenga checked:true — la validación real
-- vive en el servidor, no solo en el botón deshabilitado del frontend.
-- Firmas: tabla ot_firmas (mismo patrón que os_firmas de LB Hidráulica) +
-- bucket ot-firmas con paths <empresa_id>/<id_ot>/... como ot-fotos.
-- =====================================================================

alter table secuencias add column if not exists checklist_items jsonb not null default '[]'::jsonb;
alter table ot_cabecera add column if not exists checklist_completado jsonb not null default '[]'::jsonb;

create table if not exists ot_firmas (
  id uuid primary key default gen_random_uuid(),
  id_ot uuid not null references ot_cabecera(id) on delete cascade,
  proceso text not null check (proceso in ('tecnico','supervisor')),
  firma_url text not null,
  fecha timestamptz not null default now(),
  usuario uuid references usuarios(id)
);
create index if not exists idx_ot_firmas_ot on ot_firmas(id_ot);

alter table ot_firmas enable row level security;

create policy "lectura_ot_firmas" on ot_firmas for select using (
  exists (select 1 from ot_cabecera o where o.id = ot_firmas.id_ot and o.empresa_id = empresa_actual())
);
create policy "escritura_ot_firmas" on ot_firmas for insert with check (
  rol_actual() in ('administrador','supervisor','tecnico')
  and exists (select 1 from ot_cabecera o where o.id = ot_firmas.id_ot and o.empresa_id = empresa_actual())
);

-- ---------------------------------------------------------------------
-- crear_ot — agrega copia de checklist_items de la secuencia (si tiene)
-- a ot_cabecera.checklist_completado, con checked:false en cada ítem.
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
-- cerrar_ot — agrega validación de checklist: todo ítem con
-- requerido:true en checklist_completado debe tener checked:true.
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

  return jsonb_build_object('ok', true, 'estado', v_estado_final);
end;
$$;

-- ---------------------------------------------------------------------
-- actualizar_checklist_ot
-- Roles permitidos: administrador, supervisor, tecnico
-- Reemplaza el jsonb completo — el frontend manda el array actualizado
-- cada vez que el técnico tilda un ítem.
-- ---------------------------------------------------------------------
create or replace function actualizar_checklist_ot(p_id_ot uuid, p_checklist jsonb)
returns jsonb language plpgsql security definer as $$
declare
  v_rol rol_usuario;
  v_empresa uuid;
begin
  v_rol := rol_actual();
  v_empresa := empresa_actual();

  if v_rol not in ('administrador','supervisor','tecnico') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  update ot_cabecera set checklist_completado = p_checklist
   where id = p_id_ot and empresa_id = v_empresa;

  if not found then
    return jsonb_build_object('ok', false, 'msg', 'OT no encontrada');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- guardar_firma_ot
-- Roles permitidos: administrador, supervisor, tecnico
-- La imagen ya fue subida a Storage por el frontend (bucket ot-firmas,
-- path <empresa_id>/<id_ot>/<proceso>-<timestamp>.png) — acá solo se
-- registra la URL resultante.
-- ---------------------------------------------------------------------
create or replace function guardar_firma_ot(p_id_ot uuid, p_proceso text, p_firma_url text)
returns jsonb language plpgsql security definer as $$
declare
  v_rol rol_usuario;
  v_empresa uuid;
  v_id_usuario uuid;
begin
  v_rol := rol_actual();
  v_empresa := empresa_actual();

  if v_rol not in ('administrador','supervisor','tecnico') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  if not exists (select 1 from ot_cabecera where id = p_id_ot and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'OT no encontrada');
  end if;

  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();

  insert into ot_firmas (id_ot, proceso, firma_url, usuario)
  values (p_id_ot, p_proceso, p_firma_url, v_id_usuario);

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function actualizar_checklist_ot(uuid, jsonb) to authenticated;
grant execute on function guardar_firma_ot(uuid, text, text) to authenticated;

-- Bucket para firmas — mismo patrón de paths por empresa que ot-fotos/unidad-docs.
insert into storage.buckets (id, name, public)
values ('ot-firmas', 'ot-firmas', true)
on conflict (id) do nothing;

create policy "lectura_publica_ot_firmas" on storage.objects
  for select using (bucket_id = 'ot-firmas');
create policy "escritura_propia_empresa_ot_firmas" on storage.objects
  for insert with check (bucket_id = 'ot-firmas' and (storage.foldername(name))[1] = empresa_actual()::text);
