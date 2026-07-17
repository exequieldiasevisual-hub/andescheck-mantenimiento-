-- ==== Resolver novedad dentro de una OT ya abierta ====
-- Hasta ahora una novedad aprobada solo podía "Derivarse a OT" creando una
-- OT nueva y dedicada. Esto agrega un segundo camino: administrador/supervisor
-- puede resolverla agregando una tarea de catálogo a una OT que YA está
-- abierta para esa misma unidad, quedando trazado qué tarea la resolvió.

alter type estado_novedad add value if not exists 'Resuelta_en_OT';

alter table novedades add column if not exists id_tarea_resolucion uuid references ot_tareas(id);

-- agregar_tarea_ot ahora también devuelve el id de la tarea creada, para
-- poder engancharla desde resolver_novedad_en_ot (no cambia nada para los
-- llamadores existentes, que ya ignoran campos extra del jsonb).
create or replace function agregar_tarea_ot(p_id_ot uuid, p_id_catalogo uuid, p_descripcion text)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_descripcion text := p_descripcion;
  v_orden int;
  v_id_tarea uuid;
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

  insert into ot_tareas (id_ot, orden, descripcion, id_catalogo) values (p_id_ot, v_orden, trim(v_descripcion), p_id_catalogo)
  returning id into v_id_tarea;

  return jsonb_build_object('ok', true, 'id_tarea', v_id_tarea);
end;
$$;

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

  v_resultado := agregar_tarea_ot(p_id_ot, p_id_catalogo, coalesce(p_descripcion, v_novedad.descripcion));
  if not (v_resultado->>'ok')::boolean then
    return v_resultado;
  end if;
  v_id_tarea := (v_resultado->>'id_tarea')::uuid;

  update novedades
     set estado = 'Resuelta_en_OT', id_ot_vinculada = p_id_ot, id_tarea_resolucion = v_id_tarea
   where id = p_id_novedad;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function resolver_novedad_en_ot(uuid, uuid, uuid, text) to authenticated;
