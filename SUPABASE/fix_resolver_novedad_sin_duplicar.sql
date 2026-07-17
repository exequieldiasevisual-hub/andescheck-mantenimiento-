-- ==== Fix: resolver novedad no debe duplicar una tarea que ya está en la OT ====
-- Si la OT ya tiene cargado el mismo trabajo de catálogo que resuelve la
-- novedad, hay que enganchar la novedad a esa tarea existente (solo se
-- agrega la leyenda "Resuelve novedad") en vez de crear una tarea repetida.
-- Si no hay coincidencia, se sigue creando la tarea automáticamente como antes.

create or replace function resolver_novedad_en_ot(p_id_novedad uuid, p_id_ot uuid, p_id_catalogo uuid default null, p_descripcion text default null)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_novedad novedades%rowtype;
  v_ot ot_cabecera%rowtype;
  v_resultado jsonb;
  v_id_tarea uuid;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para resolver novedades');
  end if;

  select * into v_novedad from novedades where id = p_id_novedad and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Novedad no encontrada');
  end if;

  if v_novedad.estado <> 'Aprobada' then
    return jsonb_build_object('ok', false, 'msg', 'La novedad todavía no fue aprobada por el jefe de taller');
  end if;

  select * into v_ot from ot_cabecera where id = p_id_ot and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'OT no encontrada');
  end if;

  if v_ot.id_unidad <> v_novedad.id_unidad then
    return jsonb_build_object('ok', false, 'msg', 'La OT elegida no pertenece a la misma unidad que la novedad');
  end if;

  if v_ot.estado not in ('Abierta','En_Curso') then
    return jsonb_build_object('ok', false, 'msg', 'La OT debe estar abierta o en curso para poder resolver la novedad ahí');
  end if;

  -- Si ya existe una tarea de este mismo trabajo de catálogo en la OT, se
  -- engancha ahí en vez de crear una tarea duplicada.
  if p_id_catalogo is not null then
    select id into v_id_tarea from ot_tareas
     where id_ot = p_id_ot and id_catalogo = p_id_catalogo
     order by orden limit 1;
  end if;

  if v_id_tarea is null then
    v_resultado := agregar_tarea_ot(p_id_ot, p_id_catalogo, coalesce(p_descripcion, v_novedad.descripcion));
    if not (v_resultado->>'ok')::boolean then
      return v_resultado;
    end if;
    v_id_tarea := (v_resultado->>'id_tarea')::uuid;
  end if;

  update novedades
     set estado = 'Resuelta_en_OT', id_ot_vinculada = p_id_ot, id_tarea_resolucion = v_id_tarea
   where id = p_id_novedad;

  return jsonb_build_object('ok', true);
end;
$$;
