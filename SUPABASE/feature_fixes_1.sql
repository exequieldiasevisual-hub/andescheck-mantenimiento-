-- =====================================================================
-- Ajustes reportados por el usuario, tanda 1.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Unidades: el año modelo no puede superar el año en curso + 1 (ej. en
-- 2026 se puede cargar como máximo modelo 2027). Validación de servidor,
-- además de la del frontend.
-- ---------------------------------------------------------------------
-- NOT VALID: ya hay unidades cargadas con año fuera de rango (dato viejo,
-- no vale la pena forzar su corrección a ciegas). El constraint queda
-- activo para altas y ediciones nuevas, pero no reescribe lo existente.
alter table unidades drop constraint if exists chk_unidades_anio_maximo;
alter table unidades add constraint chk_unidades_anio_maximo
  check (anio is null or anio <= extract(year from current_date)::int + 1) not valid;

-- ---------------------------------------------------------------------
-- Novedades: derivar a una OT EXISTENTE (en vez de crear una nueva desde
-- cero) — agrega la novedad como tarea de esa OT y la marca derivada.
-- Se usa cuando la unidad ya tiene una OT abierta y el usuario elige
-- sumarla ahí en lugar de abrir una OT nueva.
-- ---------------------------------------------------------------------
create or replace function derivar_novedad_a_ot_existente(p_id_novedad uuid, p_id_ot uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_novedad novedades%rowtype;
  v_ot ot_cabecera%rowtype;
  v_orden int;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para derivar novedad a OT');
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
    return jsonb_build_object('ok', false, 'msg', 'La OT no corresponde a la misma unidad que la novedad');
  end if;
  if v_ot.estado not in ('Abierta','En_Curso') then
    return jsonb_build_object('ok', false, 'msg', 'Esa OT ya no está abierta');
  end if;

  select coalesce(max(orden), 0) + 1 into v_orden from ot_tareas where id_ot = p_id_ot;
  insert into ot_tareas (id_ot, orden, descripcion) values (p_id_ot, v_orden, v_novedad.descripcion);

  update novedades set estado = 'Derivada_a_OT', id_ot_vinculada = p_id_ot where id = p_id_novedad;

  return jsonb_build_object('ok', true, 'id_ot', p_id_ot);
end;
$$;

grant execute on function derivar_novedad_a_ot_existente(uuid, uuid) to authenticated;
