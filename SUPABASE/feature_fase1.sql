-- =====================================================================
-- Fase 1 — Propuesta de mejora: correcciones de backend.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Número de documento autonumerado (DOC-YYYY-NNNN por empresa), igual
-- patrón que generar_numero_ot — reemplaza la carga libre.
-- ---------------------------------------------------------------------
create table if not exists doc_numero_contador (
  empresa_id uuid not null references empresas(id),
  anio int not null,
  contador int not null default 0,
  primary key (empresa_id, anio)
);
alter table doc_numero_contador enable row level security;

create or replace function generar_numero_documento(p_empresa_id uuid) returns text as $$
declare
  v_anio int := extract(year from now());
  v_contador int;
begin
  insert into doc_numero_contador (empresa_id, anio, contador) values (p_empresa_id, v_anio, 1)
    on conflict (empresa_id, anio) do update set contador = doc_numero_contador.contador + 1
    returning contador into v_contador;
  return 'DOC-' || v_anio || '-' || lpad(v_contador::text, 4, '0');
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------
-- guardar_documento_unidad: crea el documento con numero autogenerado
-- (reemplaza el insert directo desde el frontend, que dejaba escribir
-- cualquier cosa en "numero").
-- ---------------------------------------------------------------------
create or replace function guardar_documento_unidad(
  p_id_unidad uuid, p_tipo text, p_fecha_vigencia_desde date,
  p_fecha_vigencia_hasta date, p_archivo_url text, p_observaciones text
)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_id_usuario uuid;
  v_id_doc uuid;
  v_numero text;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  if not exists (select 1 from unidades where id = p_id_unidad and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();
  v_numero := generar_numero_documento(v_empresa);

  insert into unidad_docs (id_unidad, tipo, numero, fecha_vigencia_desde, fecha_vigencia_hasta, archivo_url, observaciones, usuario)
  values (p_id_unidad, p_tipo, v_numero, p_fecha_vigencia_desde, p_fecha_vigencia_hasta, p_archivo_url, p_observaciones, v_id_usuario)
  returning id into v_id_doc;

  return jsonb_build_object('ok', true, 'id', v_id_doc, 'numero', v_numero);
end;
$$;

grant execute on function guardar_documento_unidad(uuid, text, date, date, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- cerrar_ot: la fecha estimada de cierre pasa a ser obligatoria también
-- del lado del servidor (defensa en profundidad, no solo el frontend).
-- No cambia la firma de crear_ot, solo agrega la validación adentro.
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
  p_tecnicos_asignados uuid[] default '{}',
  p_km_actuales numeric default null,
  p_hs_actuales numeric default null,
  p_observaciones text default null
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
  v_km_previo numeric;
  v_hs_previo numeric;
begin
  v_rol := rol_actual();
  v_empresa := empresa_actual();

  if v_rol not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para crear OT');
  end if;

  if p_fecha_est_cierre is null then
    return jsonb_build_object('ok', false, 'msg', 'La fecha estimada de cierre es obligatoria');
  end if;

  if not exists (select 1 from unidades where id = p_id_unidad and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  if p_id_secuencia is not null
     and not exists (select 1 from secuencias where id = p_id_secuencia and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Secuencia no encontrada');
  end if;

  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();

  if p_km_actuales is not null or p_hs_actuales is not null then
    select km_actuales, hs_actuales into v_km_previo, v_hs_previo from unidades where id = p_id_unidad;

    if p_km_actuales is not null and v_km_previo is not null and p_km_actuales < v_km_previo then
      return jsonb_build_object('ok', false, 'msg', 'El km ingresado no puede ser menor al último registrado (' || v_km_previo || ')');
    end if;
    if p_hs_actuales is not null and v_hs_previo is not null and p_hs_actuales < v_hs_previo then
      return jsonb_build_object('ok', false, 'msg', 'Las hs ingresadas no pueden ser menores a las últimas registradas (' || v_hs_previo || ')');
    end if;

    update unidades
       set km_actuales = coalesce(p_km_actuales, km_actuales),
           hs_actuales = coalesce(p_hs_actuales, hs_actuales)
     where id = p_id_unidad;
  end if;

  if p_id_secuencia is not null then
    select coalesce(jsonb_agg(item || jsonb_build_object('checked', false)), '[]'::jsonb)
      into v_checklist
      from (select jsonb_array_elements(checklist_items) as item from secuencias where id = p_id_secuencia) s;
  end if;

  insert into ot_cabecera (empresa_id, numero_ot, id_unidad, tipo, descripcion, prioridad, fecha_est_cierre,
                           id_secuencia, id_novedad_origen, proveedor, tecnicos_asignados, supervisor,
                           checklist_completado, observaciones)
  values (v_empresa, generar_numero_ot(v_empresa), p_id_unidad, p_tipo, p_descripcion, p_prioridad, p_fecha_est_cierre,
          p_id_secuencia, p_id_novedad_origen, p_proveedor, p_tecnicos_asignados, v_id_usuario,
          v_checklist, p_observaciones)
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
