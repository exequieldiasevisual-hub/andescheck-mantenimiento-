-- =====================================================================
-- Días laborales de los choferes (ej. no trabajan sábado y domingo):
-- esos días no se les pide el checklist diario, así que no cuentan como
-- "faltante" ni en la tarjeta del Dashboard ni en el reporte.
--
-- Se configura en configuracion (seccion='parametros',
-- clave='checklist_dias_laborales'), como texto con los días separados
-- por coma (1=lunes ... 7=domingo, ISO). Sin configurar, el default es
-- lunes a viernes (1,2,3,4,5) — así las empresas que no trabajan fin de
-- semana no tienen que tocar nada.
-- =====================================================================

create or replace function get_cumplimiento_checklist_diario(p_fecha date default current_date)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_dias_laborales text;
  v_es_laborable boolean;
begin
  if rol_actual() not in ('administrador','supervisor','auditor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para ver reportes');
  end if;

  select coalesce(valor, '1,2,3,4,5') into v_dias_laborales
  from configuracion where empresa_id = v_empresa and seccion = 'parametros' and clave = 'checklist_dias_laborales';
  v_dias_laborales := coalesce(v_dias_laborales, '1,2,3,4,5');
  v_es_laborable := extract(isodow from p_fecha)::text = any(string_to_array(v_dias_laborales, ','));

  return jsonb_build_object(
    'ok', true,
    'fecha', p_fecha,
    'dia_laborable', v_es_laborable,
    'choferes', case when not v_es_laborable then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'nombre', c.nombre,
        'en_franco', fr.id is not null,
        'motivo_franco', fr.motivo,
        'cumplio', ej.id is not null,
        'hora', ej.fecha
      ) order by c.nombre)
      from usuarios c
      left join lateral (
        select f.id, f.motivo from choferes_franco f
        where f.id_chofer = c.id and f.desde <= p_fecha and f.hasta >= p_fecha
        limit 1
      ) fr on true
      left join lateral (
        select e.id, e.fecha from checklist_ejecuciones e
        join checklist_plantillas p on p.id = e.id_plantilla
        where e.usuario_carga = c.id and p.es_diario_chofer
          and (e.fecha at time zone 'America/Argentina/Buenos_Aires')::date = p_fecha
        order by e.fecha desc limit 1
      ) ej on true
      where c.empresa_id = v_empresa and c.rol = 'chofer' and c.activo
    ), '[]'::jsonb) end
  );
end;
$$;

grant execute on function get_cumplimiento_checklist_diario(date) to authenticated;

-- ---------------------------------------------------------------------
create or replace function get_historial_checklist_diario_chofer(p_id_chofer uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_dias_laborales text;
begin
  if rol_actual() not in ('administrador','supervisor','auditor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para ver reportes');
  end if;
  if not exists (select 1 from usuarios where id = p_id_chofer and empresa_id = v_empresa and rol = 'chofer') then
    return jsonb_build_object('ok', false, 'msg', 'Chofer no encontrado');
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    return jsonb_build_object('ok', false, 'msg', 'Rango de fechas inválido');
  end if;

  select coalesce(valor, '1,2,3,4,5') into v_dias_laborales
  from configuracion where empresa_id = v_empresa and seccion = 'parametros' and clave = 'checklist_dias_laborales';
  v_dias_laborales := coalesce(v_dias_laborales, '1,2,3,4,5');

  return jsonb_build_object(
    'ok', true,
    'dias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fecha', d::date,
        'no_laborable', not (extract(isodow from d)::text = any(string_to_array(v_dias_laborales, ','))),
        'en_franco', fr.id is not null,
        'cumplio', ej.id is not null,
        'hora', ej.fecha
      ) order by d)
      from generate_series(p_desde, p_hasta, interval '1 day') d
      left join lateral (
        select f.id from choferes_franco f
        where f.id_chofer = p_id_chofer and f.desde <= d::date and f.hasta >= d::date
        limit 1
      ) fr on true
      left join lateral (
        select e.id, e.fecha from checklist_ejecuciones e
        join checklist_plantillas p on p.id = e.id_plantilla
        where e.usuario_carga = p_id_chofer and p.es_diario_chofer
          and (e.fecha at time zone 'America/Argentina/Buenos_Aires')::date = d::date
        order by e.fecha desc limit 1
      ) ej on true
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function get_historial_checklist_diario_chofer(uuid, date, date) to authenticated;
