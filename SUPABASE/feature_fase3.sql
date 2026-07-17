-- =====================================================================
-- Fase 3 — Catálogo de trabajos completo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Creador + fecha de alta (trazabilidad, igual patrón que documentos).
-- ---------------------------------------------------------------------
alter table catalogo_trabajos add column if not exists usuario_alta uuid references usuarios(id);
alter table catalogo_trabajos add column if not exists fecha_alta timestamptz not null default now();

create or replace function _set_alta_catalogo() returns trigger language plpgsql security definer as $$
begin
  new.usuario_alta := (select id from usuarios where auth_user_id = auth.uid());
  return new;
end;
$$;

drop trigger if exists trg_alta_catalogo on catalogo_trabajos;
create trigger trg_alta_catalogo before insert on catalogo_trabajos
for each row execute function _set_alta_catalogo();

-- ---------------------------------------------------------------------
-- 2) Dedup: no permitir dos trabajos activos con la misma categoría +
-- descripción (sin distinguir mayúsculas) en la misma empresa.
-- ---------------------------------------------------------------------
create unique index if not exists idx_catalogo_dedup
  on catalogo_trabajos (empresa_id, categoria, lower(descripcion))
  where activo;

-- ---------------------------------------------------------------------
-- 3) Categorías fijas — se guardan como configuración (igual patrón que
-- tipos_unidad, ciudades, etc.) para que el desplegable del formulario
-- las lea de ahí. Se cargan ahora para las empresas existentes...
-- ---------------------------------------------------------------------
insert into configuracion (empresa_id, seccion, clave, valor)
select e.id, 'categorias_trabajo', cat, cat
from empresas e, unnest(array['Motor','Frenos','Suspensión','Transmisión','Eléctrico','Hidráulico','Neumáticos','General']) as cat
on conflict (empresa_id, seccion, clave) do nothing;

-- ...y de acá en más, seed_catalogo_trabajos las siembra también para
-- cualquier empresa nueva (se movió antes del chequeo de "ya cargado"
-- para que corra siempre, incluso si el catálogo de trabajos ya existe).
create or replace function seed_catalogo_trabajos()
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_trabajos jsonb := '[
    ["Motor","Cambio de aceite y filtro de motor",1],
    ["Motor","Cambio de filtro de aire",0.5],
    ["Motor","Cambio de filtro de combustible",0.5],
    ["Motor","Cambio de bujías",1],
    ["Motor","Revisión de correa de distribución",0.5],
    ["Motor","Cambio de correa de distribución",3],
    ["Motor","Revisión del sistema de enfriamiento",0.5],
    ["Motor","Cambio de líquido refrigerante",1],
    ["Motor","Cambio de correa de accesorios",1],
    ["Motor","Diagnóstico de motor",2],
    ["Frenos","Cambio de pastillas de freno delanteras",1],
    ["Frenos","Cambio de pastillas de freno traseras",1],
    ["Frenos","Cambio de discos de freno delanteros",2],
    ["Frenos","Cambio de discos de freno traseros",2],
    ["Frenos","Sangrado del sistema de frenos",1],
    ["Frenos","Cambio de líquido de frenos",0.5],
    ["Frenos","Revisión general del sistema de frenos",1],
    ["Suspensión","Revisión de amortiguadores",0.5],
    ["Suspensión","Cambio de amortiguadores delanteros",2],
    ["Suspensión","Cambio de amortiguadores traseros",2],
    ["Suspensión","Cambio de bieletas de suspensión",1.5],
    ["Suspensión","Cambio de bujes de suspensión",2],
    ["Suspensión","Alineación y balanceo",1],
    ["Suspensión","Revisión de dirección y tren delantero",0.5],
    ["Transmisión","Cambio de aceite de caja de cambios",1],
    ["Transmisión","Revisión de embrague",1],
    ["Transmisión","Cambio de kit de embrague",4],
    ["Transmisión","Revisión de caja automática",1],
    ["Transmisión","Cambio de aceite diferencial",1],
    ["Eléctrico","Revisión y carga de batería",0.5],
    ["Eléctrico","Cambio de batería",0.5],
    ["Eléctrico","Revisión del alternador",1],
    ["Eléctrico","Revisión del sistema de arranque",1],
    ["Eléctrico","Diagnóstico eléctrico general",2],
    ["Hidráulico","Cambio de aceite hidráulico",1],
    ["Hidráulico","Revisión de mangueras hidráulicas",0.5],
    ["Hidráulico","Reparación de cilindro hidráulico",3],
    ["Neumáticos","Rotación de neumáticos",0.5],
    ["Neumáticos","Cambio de neumático",0.5],
    ["Neumáticos","Reparación de pinchazo",0.5],
    ["Neumáticos","Revisión de presión de neumáticos",0.25],
    ["General","Revisión preoperacional (pre-viaje)",0.5],
    ["General","Service de 10.000 km",2],
    ["General","Service de 20.000 km",3],
    ["General","Service de 40.000 km",4],
    ["General","Revisión de luces externas",0.25],
    ["General","Revisión de niveles generales",0.25],
    ["General","Limpieza general del vehículo",1]
  ]'::jsonb;
  v_item jsonb;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  insert into configuracion (empresa_id, seccion, clave, valor)
  select v_empresa, 'categorias_trabajo', cat, cat
  from unnest(array['Motor','Frenos','Suspensión','Transmisión','Eléctrico','Hidráulico','Neumáticos','General']) as cat
  on conflict (empresa_id, seccion, clave) do nothing;

  if exists (select 1 from catalogo_trabajos where empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Ya hay trabajos cargados en el catálogo de esta empresa');
  end if;

  for v_item in select * from jsonb_array_elements(v_trabajos)
  loop
    insert into catalogo_trabajos (empresa_id, categoria, descripcion, tiempo_estimado_hs)
    values (v_empresa, v_item->>0, v_item->>1, (v_item->>2)::numeric);
  end loop;

  return jsonb_build_object('ok', true, 'cargados', jsonb_array_length(v_trabajos));
end;
$$;

grant execute on function seed_catalogo_trabajos() to authenticated;

-- ---------------------------------------------------------------------
-- 4) agregar_trabajo_catalogo: RPC de alta que devuelve un mensaje claro
-- cuando el dedup (índice único) rechaza el insert, en vez de un error
-- crudo de Postgres.
-- ---------------------------------------------------------------------
create or replace function agregar_trabajo_catalogo(p_categoria text, p_descripcion text, p_tiempo_estimado_hs numeric)
returns jsonb language plpgsql security definer as $$
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  if p_categoria is null or trim(p_categoria) = '' or p_descripcion is null or trim(p_descripcion) = '' then
    return jsonb_build_object('ok', false, 'msg', 'Categoría y descripción son obligatorias');
  end if;

  insert into catalogo_trabajos (empresa_id, categoria, descripcion, tiempo_estimado_hs)
  values (empresa_actual(), trim(p_categoria), trim(p_descripcion), p_tiempo_estimado_hs);

  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'msg', 'Ya existe un trabajo con esa categoría y descripción');
end;
$$;

grant execute on function agregar_trabajo_catalogo(text, text, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- 5) Selección de catálogo dentro de la OT: agregar_tarea_ot admite un
-- id de catálogo opcional (precarga descripción) o descripción libre,
-- igual que agregarTarea() ya hacía por insert directo — se centraliza
-- en RPC para poder tirar el mismo mensaje de "sin permiso" ya usado
-- en el resto de las acciones de tareas.
-- ---------------------------------------------------------------------
create or replace function agregar_tarea_ot(p_id_ot uuid, p_id_catalogo uuid, p_descripcion text)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_descripcion text := p_descripcion;
  v_orden int;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  if not exists (select 1 from ot_cabecera where id = p_id_ot and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'OT no encontrada');
  end if;

  if p_id_catalogo is not null then
    select descripcion into v_descripcion from catalogo_trabajos where id = p_id_catalogo and empresa_id = v_empresa;
    if v_descripcion is null then
      return jsonb_build_object('ok', false, 'msg', 'Trabajo de catálogo no encontrado');
    end if;
  end if;

  if v_descripcion is null or trim(v_descripcion) = '' then
    return jsonb_build_object('ok', false, 'msg', 'La descripción es obligatoria');
  end if;

  select coalesce(max(orden), 0) + 1 into v_orden from ot_tareas where id_ot = p_id_ot;

  insert into ot_tareas (id_ot, orden, descripcion) values (p_id_ot, v_orden, trim(v_descripcion));

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function agregar_tarea_ot(uuid, uuid, text) to authenticated;
