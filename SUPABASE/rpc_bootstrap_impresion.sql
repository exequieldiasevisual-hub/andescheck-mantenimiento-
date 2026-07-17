-- =====================================================================
-- AndesCheck Mantenimiento — Endpoints compuestos
-- Replican getBootstrap() y getOTParaImprimir() de gs.js.
-- Ambos acotados a empresa_actual() — nunca reciben empresa_id del cliente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- get_bootstrap
-- 1 sola llamada al login: config + técnicos activos + catálogo + proveedores
-- ---------------------------------------------------------------------
create or replace function get_bootstrap()
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  return jsonb_build_object(
    'empresa', (select jsonb_build_object('id', id, 'razon_social', razon_social, 'logo_url', logo_url)
                from empresas where id = v_empresa),
    'configuracion', (select coalesce(jsonb_object_agg(seccion || '.' || clave, valor), '{}'::jsonb)
                      from configuracion where empresa_id = v_empresa),
    'tecnicos', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'nombre', u.nombre) order by u.nombre), '[]'::jsonb)
                 from usuarios u where u.empresa_id = v_empresa and u.rol = 'tecnico' and u.activo = true),
    'catalogo', (select coalesce(jsonb_agg(to_jsonb(c) order by c.categoria, c.descripcion), '[]'::jsonb)
                 from catalogo_trabajos c where c.empresa_id = v_empresa and c.activo = true),
    'proveedores', (select coalesce(jsonb_agg(to_jsonb(p) order by p.razon_social), '[]'::jsonb)
                    from proveedores p where p.empresa_id = v_empresa and p.activo = true)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- get_ot_para_imprimir
-- OT + unidad + tareas + costos + seguimiento + datos de la empresa,
-- para armar el layout de impresión / envío por mail en el frontend.
-- ---------------------------------------------------------------------
create or replace function get_ot_para_imprimir(p_id_ot uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_ot ot_cabecera%rowtype;
begin
  select * into v_ot from ot_cabecera where id = p_id_ot and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'OT no encontrada');
  end if;

  return jsonb_build_object(
    'ok', true,
    'ot', to_jsonb(v_ot),
    'unidad', (select to_jsonb(u) from unidades u where u.id = v_ot.id_unidad),
    'tareas', (select coalesce(jsonb_agg(to_jsonb(t) order by t.orden), '[]'::jsonb)
               from ot_tareas t where t.id_ot = p_id_ot),
    'costos', (select coalesce(jsonb_agg(to_jsonb(c) order by c.fecha), '[]'::jsonb)
               from costos c where c.id_ot = p_id_ot),
    'total_costos', (select coalesce(sum(monto), 0) from costos where id_ot = p_id_ot),
    'seguimiento', (select coalesce(jsonb_agg(to_jsonb(s) order by s.fecha desc), '[]'::jsonb)
                    from ot_seguimiento s where s.id_ot = p_id_ot),
    'empresa', (select jsonb_build_object('razon_social', razon_social, 'logo_url', logo_url)
                from empresas where id = v_empresa)
  );
end;
$$;

grant execute on function get_bootstrap() to authenticated;
grant execute on function get_ot_para_imprimir(uuid) to authenticated;
