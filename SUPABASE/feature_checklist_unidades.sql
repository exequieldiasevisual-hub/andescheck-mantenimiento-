-- =====================================================================
-- Checklists configurables para unidades (distinto del checklist de
-- cierre de OT que ya existe en secuencias.checklist_items/
-- ot_cabecera.checklist_completado — ese es "tareas tildadas al cerrar
-- una OT", esto es "inspección de la unidad en sí", con historial propio
-- y automatización: una respuesta puntual puede generar una Novedad sola.
--
-- Un solo motor sirve tanto para checklist rápido diario (pocos ítems)
-- como para inspección periódica formal (muchos ítems) — la diferencia
-- es solo qué plantilla arman, no código distinto.
-- =====================================================================

create table if not exists checklist_plantillas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  nombre text not null,
  descripcion text,
  tipo_unidad text,               -- opcional: si se carga, solo aplica a ese tipo de unidad
  activo boolean not null default true,
  fecha_alta timestamptz not null default now()
);
create index if not exists idx_checklist_plantillas_empresa on checklist_plantillas(empresa_id);

create table if not exists checklist_items (
  id uuid primary key default gen_random_uuid(),
  id_plantilla uuid not null references checklist_plantillas(id) on delete cascade,
  orden int not null,
  pregunta text not null,
  tipo_respuesta text not null check (tipo_respuesta in ('si_no','estado','texto')),
  -- Automatización: si la respuesta coincide con valor_disparador, se genera
  -- una Novedad sola (no una OT directa, para no saltar el flujo de
  -- aprobación que ya existe). Solo aplica a si_no ('No') y estado ('Mal'
  -- o 'Regular') — en 'texto' no hay valor discreto para comparar.
  dispara_novedad boolean not null default false,
  valor_disparador text,
  novedad_tipo text,
  novedad_descripcion text
);
create index if not exists idx_checklist_items_plantilla on checklist_items(id_plantilla, orden);

create table if not exists checklist_ejecuciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  id_plantilla uuid not null references checklist_plantillas(id),
  id_unidad uuid not null references unidades(id) on delete restrict,
  fecha timestamptz not null default now(),
  usuario_carga uuid references usuarios(id),
  ubicacion_url text
);
create index if not exists idx_checklist_ejecuciones_unidad on checklist_ejecuciones(id_unidad, fecha);
create index if not exists idx_checklist_ejecuciones_empresa on checklist_ejecuciones(empresa_id);

create table if not exists checklist_respuestas (
  id uuid primary key default gen_random_uuid(),
  id_ejecucion uuid not null references checklist_ejecuciones(id) on delete cascade,
  id_item uuid not null references checklist_items(id),
  respuesta text not null,
  id_novedad_generada uuid references novedades(id)
);
create index if not exists idx_checklist_respuestas_ejecucion on checklist_respuestas(id_ejecucion);

alter table checklist_plantillas enable row level security;
alter table checklist_items enable row level security;
alter table checklist_ejecuciones enable row level security;
alter table checklist_respuestas enable row level security;

drop policy if exists "lectura_checklist_plantillas" on checklist_plantillas;
create policy "lectura_checklist_plantillas" on checklist_plantillas for select using (empresa_id = empresa_actual());
drop policy if exists "escritura_checklist_plantillas" on checklist_plantillas;
create policy "escritura_checklist_plantillas" on checklist_plantillas for all using (
  empresa_id = empresa_actual() and rol_actual() in ('administrador','supervisor')
);

drop policy if exists "lectura_checklist_items" on checklist_items;
create policy "lectura_checklist_items" on checklist_items for select using (
  exists (select 1 from checklist_plantillas p where p.id = checklist_items.id_plantilla and p.empresa_id = empresa_actual())
);
drop policy if exists "escritura_checklist_items" on checklist_items;
create policy "escritura_checklist_items" on checklist_items for all using (
  rol_actual() in ('administrador','supervisor')
  and exists (select 1 from checklist_plantillas p where p.id = checklist_items.id_plantilla and p.empresa_id = empresa_actual())
);

drop policy if exists "lectura_checklist_ejecuciones" on checklist_ejecuciones;
create policy "lectura_checklist_ejecuciones" on checklist_ejecuciones for select using (empresa_id = empresa_actual());

drop policy if exists "lectura_checklist_respuestas" on checklist_respuestas;
create policy "lectura_checklist_respuestas" on checklist_respuestas for select using (
  exists (select 1 from checklist_ejecuciones e where e.id = checklist_respuestas.id_ejecucion and e.empresa_id = empresa_actual())
);

-- Las ejecuciones/respuestas se insertan únicamente vía ejecutar_checklist()
-- (security definer) porque ahí también se generan las Novedades — no hay
-- policy de insert directa para estas dos tablas.

-- ---------------------------------------------------------------------
-- ejecutar_checklist: registra la ejecución + respuestas, y genera una
-- Novedad automática por cada respuesta que dispare (según la plantilla).
-- p_respuestas: jsonb array [{ "id_item": "...", "respuesta": "..." }]
-- ---------------------------------------------------------------------
create or replace function ejecutar_checklist(
  p_id_plantilla uuid, p_id_unidad uuid, p_respuestas jsonb, p_ubicacion_url text default null
)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_id_usuario uuid;
  v_id_ejecucion uuid;
  v_respuesta jsonb;
  v_item record;
  v_id_novedad uuid;
  v_novedades_generadas int := 0;
begin
  if rol_actual() not in ('administrador','supervisor','tecnico') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  if not exists (select 1 from checklist_plantillas where id = p_id_plantilla and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Plantilla no encontrada');
  end if;

  if not exists (select 1 from unidades where id = p_id_unidad and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();

  insert into checklist_ejecuciones (empresa_id, id_plantilla, id_unidad, usuario_carga, ubicacion_url)
  values (v_empresa, p_id_plantilla, p_id_unidad, v_id_usuario, p_ubicacion_url)
  returning id into v_id_ejecucion;

  for v_respuesta in select * from jsonb_array_elements(p_respuestas)
  loop
    select * into v_item from checklist_items
     where id = (v_respuesta->>'id_item')::uuid and id_plantilla = p_id_plantilla;

    if not found then
      continue;
    end if;

    v_id_novedad := null;

    if v_item.dispara_novedad and v_item.valor_disparador is not null
       and lower(trim(v_respuesta->>'respuesta')) = lower(trim(v_item.valor_disparador)) then
      insert into novedades (empresa_id, id_unidad, descripcion, tipo, usuario_carga)
      values (
        v_empresa, p_id_unidad,
        coalesce(nullif(trim(v_item.novedad_descripcion), ''), v_item.pregunta),
        v_item.novedad_tipo, v_id_usuario
      )
      returning id into v_id_novedad;
      v_novedades_generadas := v_novedades_generadas + 1;
    end if;

    insert into checklist_respuestas (id_ejecucion, id_item, respuesta, id_novedad_generada)
    values (v_id_ejecucion, v_item.id, v_respuesta->>'respuesta', v_id_novedad);
  end loop;

  return jsonb_build_object('ok', true, 'id_ejecucion', v_id_ejecucion, 'novedades_generadas', v_novedades_generadas);
end;
$$;

grant execute on function ejecutar_checklist(uuid, uuid, jsonb, text) to authenticated;
