-- ==== Panel "Gestión OT" ====
-- Tablero de control de órdenes de trabajo del mes: cantidad total, por
-- tipo, por prioridad, por creador (supervisor), por estado, por
-- condición de cierre, por motivo de pausa, por proveedor, y detalle.
--
-- Condición de cierre (regla acordada):
--   - Ventana original (fecha_est_cierre - fecha_apertura) <= 24hs:
--       cerrada dentro de esa ventana -> "Cierre OK"
--       cerrada después               -> "Cierre retrasado"
--   - Ventana original > 24hs:
--       cerrada antes de fecha_est_cierre -> "Cierre a tiempo"
--       cerrada después                   -> "Cierre retrasado"
--   - Todavía abierta -> "OT abierta"
--   - Sin fecha_est_cierre cargada (dato viejo) -> no entra en este desglose.
--
-- Estado (desglose de 4 valores, no el enum crudo):
--   Anulada, Cerrada (incluye Cerrada_Vencida), Cumplida al 100% (todas
--   las tareas completas pero sin cerrar todavía = listo_cierre), Abierta.

create or replace function get_gestion_ot(p_mes text)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_desde date;
  v_hasta date;
begin
  if rol_actual() not in ('administrador','supervisor','auditor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para ver reportes');
  end if;

  begin
    v_desde := to_date(p_mes || '-01', 'YYYY-MM-DD');
  exception when others then
    return jsonb_build_object('ok', false, 'msg', 'Mes inválido');
  end;
  v_hasta := v_desde + interval '1 month';

  create temp table _ot_gestion on commit drop as
  select
    o.id, o.numero_ot, o.tipo, o.prioridad, o.estado, o.fecha_apertura, o.fecha_cierre,
    o.fecha_est_cierre, o.descripcion,
    coalesce(u_sup.nombre, 'Sin asignar') as creador,
    coalesce(p.razon_social, 'Sin proveedor') as proveedor,
    (t.total > 0 and t.completadas = t.total and o.estado in ('Abierta','En_Curso')) as listo_cierre,
    case
      when o.estado = 'Anulada' then 'Anulada'
      when o.estado in ('Cerrada','Cerrada_Vencida') then 'Cerrada'
      when t.total > 0 and t.completadas = t.total and o.estado in ('Abierta','En_Curso') then 'Cumplida al 100%'
      else 'Abierta'
    end as estado_desglosado,
    case
      when o.estado in ('Cerrada','Cerrada_Vencida') and o.fecha_est_cierre is not null then
        case
          when extract(epoch from (o.fecha_est_cierre - o.fecha_apertura)) / 3600 <= 24 then
            case when o.fecha_cierre <= o.fecha_est_cierre then 'Cierre OK' else 'Cierre retrasado' end
          else
            case when o.fecha_cierre <= o.fecha_est_cierre then 'Cierre a tiempo' else 'Cierre retrasado' end
        end
      when o.estado in ('Abierta','En_Curso') then 'OT abierta'
      else null
    end as condicion_cierre
  from ot_cabecera o
  left join usuarios u_sup on u_sup.id = o.supervisor
  left join proveedores p on p.id = o.proveedor
  left join (
    select id_ot, count(*) as total, count(*) filter (where estado = 'Completada') as completadas
    from ot_tareas group by id_ot
  ) t on t.id_ot = o.id
  where o.empresa_id = v_empresa and o.fecha_apertura >= v_desde and o.fecha_apertura < v_hasta;

  return jsonb_build_object(
    'ok', true,
    'mes', p_mes,
    'total_ot', (select count(*) from _ot_gestion),
    'por_tipo', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', tipo, 'cantidad', n) order by n desc)
      from (select coalesce(tipo, 'Sin tipo') as tipo, count(*) as n from _ot_gestion group by 1) s
    ), '[]'::jsonb),
    'por_prioridad', coalesce((
      select jsonb_agg(jsonb_build_object('prioridad', prioridad, 'cantidad', n) order by n desc)
      from (select coalesce(prioridad, 'Sin prioridad') as prioridad, count(*) as n from _ot_gestion group by 1) s
    ), '[]'::jsonb),
    'por_creador', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', creador, 'cantidad', n) order by n desc)
      from (select creador, count(*) as n from _ot_gestion group by 1) s
    ), '[]'::jsonb),
    'por_estado', coalesce((
      select jsonb_agg(jsonb_build_object('estado', estado_desglosado, 'cantidad', n) order by n desc)
      from (select estado_desglosado, count(*) as n from _ot_gestion group by 1) s
    ), '[]'::jsonb),
    'por_condicion_cierre', coalesce((
      select jsonb_agg(jsonb_build_object('condicion', condicion_cierre, 'cantidad', n) order by n desc)
      from (select condicion_cierre, count(*) as n from _ot_gestion where condicion_cierre is not null group by 1) s
    ), '[]'::jsonb),
    'por_motivo_pausa', coalesce((
      select jsonb_agg(jsonb_build_object('motivo', motivo_pausa, 'cantidad', n) order by n desc)
      from (
        select t.motivo_pausa, count(*) as n
        from ot_tareas t
        join _ot_gestion o on o.id = t.id_ot
        where t.motivo_pausa is not null
        group by t.motivo_pausa
      ) s
    ), '[]'::jsonb),
    'por_proveedor', coalesce((
      select jsonb_agg(jsonb_build_object('proveedor', proveedor, 'cantidad', n) order by n desc)
      from (select proveedor, count(*) as n from _ot_gestion group by 1) s
    ), '[]'::jsonb),
    'detalle', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero_ot', numero_ot, 'fecha_apertura', fecha_apertura, 'creador', creador, 'motivo_ingreso', descripcion
      ) order by fecha_apertura desc)
      from (select * from _ot_gestion order by fecha_apertura desc limit 500) s
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function get_gestion_ot(text) to authenticated;
