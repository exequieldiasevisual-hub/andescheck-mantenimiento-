-- =====================================================================
-- Bloque operativo de OT: vista de lista con progreso + estado Vencida,
-- RPC para eliminar tarea con motivo, y observaciones en crear_ot.
-- (Costos, +Tarea manual y movimiento_stock ya funcionan con las
-- policies/RPC existentes — solo faltaba la UI.)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Vista ot_lista: replica _enriquecerOTs() de gs.js.
-- Cada OT trae progreso de tareas + estado "Vencida" en tiempo real +
-- flag listo_cierre + datos de la unidad para filtros y tarjeta.
-- security_invoker = on → respeta el RLS de ot_cabecera (aislamiento por
-- empresa) en vez de correr como owner.
-- ---------------------------------------------------------------------
create or replace view ot_lista with (security_invoker = on) as
select
  o.*,
  u.descripcion   as unidad_descripcion,
  u.patente_serie as unidad_patente,
  u.centro_costo  as unidad_centro_costo,
  u.tipo          as unidad_tipo,
  coalesce(t.total, 0)       as tareas_total,
  coalesce(t.completadas, 0) as tareas_completadas,
  case
    when o.estado in ('Abierta','En_Curso')
         and o.fecha_est_cierre is not null
         and o.fecha_est_cierre < now()
      then 'Vencida'
    else o.estado::text
  end as estado_calculado,
  (coalesce(t.total, 0) > 0
   and coalesce(t.completadas, 0) = t.total
   and o.estado in ('Abierta','En_Curso')) as listo_cierre
from ot_cabecera o
left join unidades u on u.id = o.id_unidad
left join (
  select id_ot,
         count(*)                                    as total,
         count(*) filter (where estado = 'Completada') as completadas
  from ot_tareas
  group by id_ot
) t on t.id_ot = o.id;

grant select on ot_lista to authenticated;

-- ---------------------------------------------------------------------
-- eliminar_tarea_ot: borra la tarea y deja registro del motivo en el
-- seguimiento de la OT (igual que eliminarTareaOT de gs.js).
-- No hay policy de DELETE sobre ot_tareas a propósito — el borrado pasa
-- solo por acá para garantizar que quede el rastro del motivo.
-- ---------------------------------------------------------------------
create or replace function eliminar_tarea_ot(p_id_tarea uuid, p_motivo text)
returns jsonb language plpgsql security definer as $$
declare
  v_rol rol_usuario;
  v_empresa uuid;
  v_tarea ot_tareas%rowtype;
  v_ot ot_cabecera%rowtype;
  v_id_usuario uuid;
begin
  v_rol := rol_actual();
  v_empresa := empresa_actual();

  if v_rol not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para eliminar tareas');
  end if;

  if p_motivo is null or trim(p_motivo) = '' then
    return jsonb_build_object('ok', false, 'msg', 'El motivo de eliminación es obligatorio');
  end if;

  select * into v_tarea from ot_tareas where id = p_id_tarea;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Tarea no encontrada');
  end if;

  select * into v_ot from ot_cabecera where id = v_tarea.id_ot and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Tarea no encontrada');
  end if;

  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();

  delete from ot_tareas where id = p_id_tarea;

  insert into ot_seguimiento (id_ot, descripcion, usuario)
  values (v_tarea.id_ot,
          '🗑 Tarea eliminada — Motivo: ' || trim(p_motivo) || ' (tarea: "' || v_tarea.descripcion || '")',
          v_id_usuario);

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function eliminar_tarea_ot(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- crear_ot: se agrega p_observaciones (el original lo pide obligatorio).
-- Cambia la firma → hay que borrar la versión anterior explícitamente.
-- ---------------------------------------------------------------------
drop function if exists crear_ot(uuid, text, text, text, timestamptz, uuid, uuid, uuid, uuid[], numeric, numeric);

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

  if p_km_actuales is not null or p_hs_actuales is not null then
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

grant execute on function crear_ot(uuid, text, text, text, timestamptz, uuid, uuid, uuid, uuid[], numeric, numeric, text) to authenticated;
