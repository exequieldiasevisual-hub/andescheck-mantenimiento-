-- =====================================================================
-- Fase 6b — Rol jefe_taller + workflow de aprobación de novedades.
-- CORRER DESPUÉS de feature_fase6a_enum.sql (y después de que ese Run
-- haya terminado — los nuevos valores de enum ya tienen que existir).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Trazabilidad de la aprobación/rechazo.
-- ---------------------------------------------------------------------
alter table novedades add column if not exists aprobada_por uuid references usuarios(id);
alter table novedades add column if not exists fecha_aprobacion timestamptz;
alter table novedades add column if not exists motivo_rechazo text;

-- ---------------------------------------------------------------------
-- aprobar_novedad — jefe_taller (o administrador, por si el jefe de
-- taller no está) aprueba o rechaza una novedad Pendiente. Solo una vez:
-- Pendiente es el único estado desde el que se puede aprobar/rechazar.
-- ---------------------------------------------------------------------
create or replace function aprobar_novedad(p_id_novedad uuid, p_aprobar boolean, p_motivo text default null)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_id_usuario uuid;
  v_novedad novedades%rowtype;
begin
  if rol_actual() not in ('jefe_taller','administrador') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para aprobar novedades');
  end if;

  select * into v_novedad from novedades where id = p_id_novedad and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Novedad no encontrada');
  end if;

  if v_novedad.estado <> 'Pendiente' then
    return jsonb_build_object('ok', false, 'msg', 'La novedad ya fue procesada');
  end if;

  if not p_aprobar and (p_motivo is null or trim(p_motivo) = '') then
    return jsonb_build_object('ok', false, 'msg', 'El motivo de rechazo es obligatorio');
  end if;

  select id into v_id_usuario from usuarios where auth_user_id = auth.uid();

  update novedades
     set estado = case when p_aprobar then 'Aprobada'::estado_novedad else 'Rechazada'::estado_novedad end,
         aprobada_por = v_id_usuario,
         fecha_aprobacion = now(),
         motivo_rechazo = case when p_aprobar then null else trim(p_motivo) end
   where id = p_id_novedad;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function aprobar_novedad(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- derivar_novedad_a_ot: ahora exige que la novedad esté Aprobada (antes
-- alcanzaba con Pendiente) — el jefe_taller tiene que darle luz verde
-- antes de que administrador/supervisor la convierta en OT.
-- ---------------------------------------------------------------------
create or replace function derivar_novedad_a_ot(
  p_id_novedad uuid,
  p_tipo text,
  p_descripcion text,
  p_prioridad text default null,
  p_fecha_est_cierre timestamptz default null,
  p_id_secuencia uuid default null,
  p_proveedor uuid default null,
  p_tecnicos_asignados uuid[] default '{}'
)
returns jsonb language plpgsql security definer as $$
declare
  v_rol rol_usuario;
  v_empresa uuid;
  v_novedad novedades%rowtype;
begin
  v_rol := rol_actual();
  v_empresa := empresa_actual();

  if v_rol not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para derivar novedad a OT');
  end if;

  select * into v_novedad from novedades where id = p_id_novedad and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Novedad no encontrada');
  end if;

  if v_novedad.estado <> 'Aprobada' then
    return jsonb_build_object('ok', false, 'msg', 'La novedad todavía no fue aprobada por el jefe de taller');
  end if;

  return crear_ot(v_novedad.id_unidad, p_tipo, p_descripcion, p_prioridad, p_fecha_est_cierre,
                   p_id_secuencia, p_id_novedad, p_proveedor, p_tecnicos_asignados);
end;
$$;
