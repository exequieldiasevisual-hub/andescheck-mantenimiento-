-- =====================================================================
-- Importación masiva del remito de combustible que exporta la estación
-- de servicio (Excel). Cubre:
--  - Mapeo persistente patente-del-remito -> unidad, para las patentes
--    que no matchean directo (typos, códigos internos tipo RETRO/MAQUINA).
--  - Líneas de combustible real -> combustible_cargas (como haría una
--    carga manual, origen 'Estación externa').
--  - Líneas que no son combustible (ej. AdBlue) -> otros_gastos_unidad,
--    un costo directo por unidad que se suma solo en Costos de la
--    empresa junto con combustible y mantenimiento.
--  - remito_externo es la clave de deduplicación: reimportar el mismo
--    archivo (o un rango de fechas solapado) no duplica nada.
-- =====================================================================

alter table combustible_cargas add column if not exists remito_externo text;
alter table combustible_cargas add column if not exists chofer_externo text;
create unique index if not exists idx_combustible_remito_externo
  on combustible_cargas(empresa_id, remito_externo) where remito_externo is not null;

create table if not exists mapeo_patente_externa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  patente_texto text not null,
  id_unidad uuid not null references unidades(id) on delete cascade,
  usuario_alta uuid references usuarios(id),
  fecha_alta timestamptz not null default now(),
  unique (empresa_id, patente_texto)
);

create table if not exists otros_gastos_unidad (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  id_unidad uuid not null references unidades(id) on delete cascade,
  fecha timestamptz not null default now(),
  concepto text not null,
  monto numeric(12,2) not null,
  remito_externo text,
  chofer_externo text,
  usuario_alta uuid references usuarios(id),
  fecha_alta timestamptz not null default now()
);
create index if not exists idx_otros_gastos_unidad on otros_gastos_unidad(id_unidad, fecha);
create unique index if not exists idx_otros_gastos_remito_externo
  on otros_gastos_unidad(empresa_id, remito_externo) where remito_externo is not null;

alter table mapeo_patente_externa enable row level security;
alter table otros_gastos_unidad enable row level security;

drop policy if exists lectura_mapeo_patente_externa on mapeo_patente_externa;
create policy lectura_mapeo_patente_externa on mapeo_patente_externa for select
  using (empresa_id = empresa_actual() and rol_actual() in ('administrador','supervisor'));

drop policy if exists lectura_otros_gastos_unidad on otros_gastos_unidad;
create policy lectura_otros_gastos_unidad on otros_gastos_unidad for select
  using (empresa_id = empresa_actual() and rol_actual() in ('administrador','supervisor','auditor'));

-- =====================================================================
-- guardar_mapeo_patente_externa: resuelve a mano una patente del remito
-- que no matchea ninguna unidad. Queda guardado para las próximas
-- importaciones.
-- =====================================================================
create or replace function guardar_mapeo_patente_externa(p_patente_texto text, p_id_unidad uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_patente_norm text := upper(regexp_replace(coalesce(p_patente_texto, ''), '\s+', '', 'g'));
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;
  if v_patente_norm = '' then
    return jsonb_build_object('ok', false, 'msg', 'Falta la patente');
  end if;
  if not exists (select 1 from unidades where id = p_id_unidad and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Unidad inválida');
  end if;

  insert into mapeo_patente_externa (empresa_id, patente_texto, id_unidad, usuario_alta)
  values (v_empresa, v_patente_norm, p_id_unidad, (select id from usuarios where auth_user_id = auth.uid()))
  on conflict (empresa_id, patente_texto) do update set id_unidad = excluded.id_unidad;

  return jsonb_build_object('ok', true);
end;
$$;

-- =====================================================================
-- importar_remito_combustible: recibe las filas ya parseadas del Excel
-- (el frontend clasifica combustible vs. otro gasto y arma la clave de
-- deduplicación remito_externo). Devuelve cuántas se importaron, cuántas
-- ya existían (duplicadas) y qué patentes no matchearon ninguna unidad.
-- =====================================================================
create or replace function importar_remito_combustible(p_filas jsonb)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_usuario uuid := (select id from usuarios where auth_user_id = auth.uid());
  v_fila jsonb;
  v_patente_norm text;
  v_id_unidad uuid;
  v_insertado_id uuid;
  v_importados_combustible int := 0;
  v_importados_otros int := 0;
  v_duplicados int := 0;
  v_sin_match jsonb := '[]'::jsonb;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_patente_norm := upper(regexp_replace(coalesce(v_fila->>'patente_texto', ''), '\s+', '', 'g'));
    v_id_unidad := null;

    select id_unidad into v_id_unidad from mapeo_patente_externa
      where empresa_id = v_empresa and patente_texto = v_patente_norm;

    if v_id_unidad is null then
      select id into v_id_unidad from unidades
        where empresa_id = v_empresa
          and upper(regexp_replace(patente_serie, '\s+', '', 'g')) = v_patente_norm
        limit 1;
    end if;

    if v_id_unidad is null then
      if not (v_sin_match @> to_jsonb(v_patente_norm)) then
        v_sin_match := v_sin_match || to_jsonb(v_patente_norm);
      end if;
      continue;
    end if;

    if (v_fila->>'es_combustible')::boolean then
      insert into combustible_cargas (
        empresa_id, id_unidad, fecha, origen, estacion, litros, precio_unitario, precio_total,
        km_actuales, remito_externo, chofer_externo, usuario_carga
      ) values (
        v_empresa, v_id_unidad, (v_fila->>'fecha')::timestamptz, 'Estación externa', v_fila->>'estacion',
        (v_fila->>'litros')::numeric, (v_fila->>'precio_unitario')::numeric, (v_fila->>'precio_total')::numeric,
        (v_fila->>'km')::numeric, v_fila->>'remito_externo', v_fila->>'chofer_externo', v_usuario
      )
      on conflict (empresa_id, remito_externo) where remito_externo is not null do nothing
      returning id into v_insertado_id;

      if v_insertado_id is not null then v_importados_combustible := v_importados_combustible + 1;
      else v_duplicados := v_duplicados + 1;
      end if;
    else
      insert into otros_gastos_unidad (
        empresa_id, id_unidad, fecha, concepto, monto, remito_externo, chofer_externo, usuario_alta
      ) values (
        v_empresa, v_id_unidad, (v_fila->>'fecha')::timestamptz, v_fila->>'concepto',
        (v_fila->>'precio_total')::numeric, v_fila->>'remito_externo', v_fila->>'chofer_externo', v_usuario
      )
      on conflict (empresa_id, remito_externo) where remito_externo is not null do nothing
      returning id into v_insertado_id;

      if v_insertado_id is not null then v_importados_otros := v_importados_otros + 1;
      else v_duplicados := v_duplicados + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'importados_combustible', v_importados_combustible,
    'importados_otros', v_importados_otros,
    'duplicados', v_duplicados,
    'patentes_sin_match', v_sin_match
  );
end;
$$;

grant execute on function guardar_mapeo_patente_externa(text, uuid) to authenticated;
grant execute on function importar_remito_combustible(jsonb) to authenticated;
