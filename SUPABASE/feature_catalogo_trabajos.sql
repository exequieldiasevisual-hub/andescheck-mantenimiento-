-- =====================================================================
-- Catálogo de trabajos — RPC de seed con los 47 trabajos pre-cargados
-- del sistema original (8 categorías). Se corre 1 vez por empresa desde
-- Configuración → pestaña Catálogo → "Cargar catálogo estándar".
-- No pisa nada si ya hay trabajos cargados (evita duplicar al reintentar).
-- =====================================================================

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
