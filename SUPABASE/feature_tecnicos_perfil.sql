-- =====================================================================
-- Perfil de técnicos (teléfono, emergencia, dirección, especialidad) +
-- carga de trabajo (tareas pendientes en OT activas) para mostrar al
-- asignar técnicos a una OT. tecnicos_perfil ya existe en el schema base
-- pero no tenía RLS ni RPC de consulta con carga.
-- =====================================================================

-- ---------------------------------------------------------------------
-- guardar_perfil_tecnico: upsert del perfil (admin/supervisor)
-- ---------------------------------------------------------------------
create or replace function guardar_perfil_tecnico(
  p_id_usuario uuid, p_telefono text, p_tel_emergencia text,
  p_direccion text, p_especialidad text
)
returns jsonb language plpgsql security definer as $$
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  if not exists (select 1 from usuarios where id = p_id_usuario and empresa_id = empresa_actual()) then
    return jsonb_build_object('ok', false, 'msg', 'Usuario no encontrado en esta empresa');
  end if;

  insert into tecnicos_perfil (id_usuario, telefono, tel_emergencia, direccion, especialidad)
  values (p_id_usuario, nullif(p_telefono,''), nullif(p_tel_emergencia,''), nullif(p_direccion,''), nullif(p_especialidad,''))
  on conflict (id_usuario) do update set
    telefono = excluded.telefono,
    tel_emergencia = excluded.tel_emergencia,
    direccion = excluded.direccion,
    especialidad = excluded.especialidad;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function guardar_perfil_tecnico(uuid, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- get_tecnicos_con_carga: técnicos activos + cantidad de tareas
-- pendientes en OTs abiertas (para mostrar al asignar en una OT nueva).
-- ---------------------------------------------------------------------
create or replace function get_tecnicos_con_carga()
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', u.id,
      'nombre', u.nombre,
      'especialidad', tp.especialidad,
      'tareas_pendientes', coalesce(carga.n, 0)
    ) order by u.nombre)
    from usuarios u
    left join tecnicos_perfil tp on tp.id_usuario = u.id
    left join (
      select ot.tecnicos_asignados[i] as id_tecnico, count(*) as n
      from ot_cabecera ot
      cross join lateral generate_subscripts(ot.tecnicos_asignados, 1) as i
      join ot_tareas t on t.id_ot = ot.id and t.estado <> 'Completada'
      where ot.empresa_id = v_empresa and ot.estado in ('Abierta','En_Curso')
      group by ot.tecnicos_asignados[i]
    ) carga on carga.id_tecnico = u.id
    where u.empresa_id = v_empresa and u.rol = 'tecnico' and u.activo = true
  ), '[]'::jsonb);
end;
$$;

grant execute on function get_tecnicos_con_carga() to authenticated;
