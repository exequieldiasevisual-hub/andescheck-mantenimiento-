-- Agrega trazabilidad de catalogo en tareas y calcula minutos comprometidos + proxima tarea por tecnico.

alter table ot_tareas add column if not exists id_catalogo uuid references catalogo_trabajos(id);

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

  insert into ot_tareas (id_ot, orden, descripcion, id_catalogo) values (p_id_ot, v_orden, trim(v_descripcion), p_id_catalogo);

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function get_tecnicos_con_carga()
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  return coalesce((
    with tareas_por_tecnico as (
      select
        ot.tecnicos_asignados[i] as id_tecnico,
        t.descripcion,
        ot.fecha_apertura,
        t.orden,
        coalesce(ct.tiempo_estimado_hs, 0) as tiempo_estimado_hs
      from ot_cabecera ot
      cross join lateral generate_subscripts(ot.tecnicos_asignados, 1) as i
      join ot_tareas t on t.id_ot = ot.id and t.estado <> 'Completada'
      left join catalogo_trabajos ct on ct.id = t.id_catalogo
      where ot.empresa_id = v_empresa and ot.estado in ('Abierta','En_Curso')
    ),
    resumen as (
      select
        id_tecnico,
        count(*) as n,
        sum(tiempo_estimado_hs) * 60 as minutos
      from tareas_por_tecnico
      group by id_tecnico
    ),
    proxima as (
      select distinct on (id_tecnico)
        id_tecnico, descripcion as proxima_tarea
      from tareas_por_tecnico
      order by id_tecnico, fecha_apertura asc, orden asc
    )
    select jsonb_agg(jsonb_build_object(
      'id', u.id,
      'nombre', u.nombre,
      'especialidad', tp.especialidad,
      'tareas_pendientes', coalesce(resumen.n, 0),
      'minutos_comprometidos', coalesce(resumen.minutos, 0),
      'proxima_tarea', proxima.proxima_tarea
    ) order by u.nombre)
    from usuarios u
    left join tecnicos_perfil tp on tp.id_usuario = u.id
    left join resumen on resumen.id_tecnico = u.id
    left join proxima on proxima.id_tecnico = u.id
    where u.empresa_id = v_empresa and u.rol = 'tecnico' and u.activo = true
  ), '[]'::jsonb);
end;
$$;
