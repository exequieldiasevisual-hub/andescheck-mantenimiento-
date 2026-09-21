-- =====================================================================
-- Corrección de Km/Hs (solo administrador).
-- La regla general es que el km/hs de una unidad nunca baja. Si alguien
-- cargó un valor de más por error (ej. 999999), el administrador lo puede
-- corregir con corregir_km_hs: acepta un valor menor, exige un motivo, y
-- el motivo queda en el historial de Km/Hs (unidad_km_hs_historial.motivo).
-- =====================================================================

alter table unidad_km_hs_historial add column if not exists motivo text;

-- El trigger que arma el historial ahora también guarda el motivo, si la
-- operación lo informó (corregir_km_hs lo deja en una variable de la
-- transacción; en cualquier otra actualización viene vacío).
create or replace function _log_km_hs_unidad() returns trigger language plpgsql security definer as $$
begin
  if (new.km_actuales is distinct from old.km_actuales) or (new.hs_actuales is distinct from old.hs_actuales) then
    insert into unidad_km_hs_historial (id_unidad, km_actuales, hs_actuales, usuario, motivo)
    values (new.id, new.km_actuales, new.hs_actuales, (select id from usuarios where auth_user_id = auth.uid()),
            nullif(current_setting('app.motivo_km_hs', true), ''));
  end if;
  return new;
end;
$$;

create or replace function corregir_km_hs(
  p_id_unidad uuid,
  p_km numeric,
  p_hs numeric,
  p_motivo text
) returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  if rol_actual() <> 'administrador' then
    return jsonb_build_object('ok', false, 'msg', 'Solo el administrador puede corregir el km/hs');
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    return jsonb_build_object('ok', false, 'msg', 'El motivo de la corrección es obligatorio');
  end if;
  if p_km is null and p_hs is null then
    return jsonb_build_object('ok', false, 'msg', 'Cargá al menos un valor');
  end if;
  if (p_km is not null and p_km < 0) or (p_hs is not null and p_hs < 0) then
    return jsonb_build_object('ok', false, 'msg', 'Los valores no pueden ser negativos');
  end if;
  if not exists (select 1 from unidades where id = p_id_unidad and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  perform set_config('app.motivo_km_hs', 'Corrección: ' || trim(p_motivo), true);

  update unidades
     set km_actuales = coalesce(p_km, km_actuales),
         hs_actuales = coalesce(p_hs, hs_actuales)
   where id = p_id_unidad;

  perform set_config('app.motivo_km_hs', '', true);
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function corregir_km_hs(uuid, numeric, numeric, text) to authenticated;
