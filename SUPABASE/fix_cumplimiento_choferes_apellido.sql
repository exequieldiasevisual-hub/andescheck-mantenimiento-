-- Igual que el fix de get_tecnicos_con_carga: usuarios.nombre/apellido están
-- separados, y el reporte de cumplimiento de checklist diario mostraba solo
-- el nombre de pila del chofer. Se concatena acá.

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
        'nombre', trim(c.nombre || ' ' || coalesce(c.apellido, '')),
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
