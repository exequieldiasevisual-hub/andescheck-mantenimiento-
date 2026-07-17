-- ==== Advertencia de solapamiento de tareas entre planes de una misma unidad ====
-- Detecta cuando la misma tarea de catálogo aparece en más de una rutina activa de la unidad.
-- Es solo una advertencia informativa y no bloquea ninguna acción.

create or replace function get_solapamientos_unidad(p_id_unidad uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  if not exists (select 1 from unidades where id = p_id_unidad and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  return jsonb_build_object(
    'ok', true,
    'solapamientos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id_catalogo', id_catalogo,
        'descripcion_tarea', descripcion_tarea,
        'rutinas', rutinas
      ))
      from (
        select
          t.id_catalogo,
          max(t.descripcion) as descripcion_tarea,
          jsonb_agg(jsonb_build_object('id_rutina', r.id, 'descripcion_rutina', r.descripcion) order by r.descripcion) as rutinas
        from rutina_tareas t
        join rutinas_mantenimiento r on r.id = t.id_rutina
        where r.id_unidad = p_id_unidad and r.activo = true and t.id_catalogo is not null
        group by t.id_catalogo
        having count(distinct r.id) > 1
      ) s
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function get_solapamientos_unidad(uuid) to authenticated;
