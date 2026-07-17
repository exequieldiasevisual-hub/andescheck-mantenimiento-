-- Pausar/reanudar rutinas con motivo y bloqueo si hay cumplimiento en curso;
-- las alertas anticipadas ahora funcionan igual para km/hs/dias usando el estado_calculado ya unificado.

create or replace function pausar_rutina(p_id_rutina uuid, p_motivo text)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para gestionar rutinas de mantenimiento');
  end if;

  if p_motivo is null or trim(p_motivo) = '' then
    return jsonb_build_object('ok', false, 'msg', 'El motivo de la pausa es obligatorio');
  end if;

  if exists (select 1 from rutina_cumplimientos where id_rutina = p_id_rutina and estado = 'Programada') then
    return jsonb_build_object('ok', false, 'msg', 'No se puede pausar: hay un cumplimiento programado en curso para esta rutina');
  end if;

  update rutinas_mantenimiento
     set activo = false,
         motivo_pausa = trim(p_motivo),
         pausada_en = now(),
         pausada_por = (select id from usuarios where auth_user_id = auth.uid())
   where id = p_id_rutina and empresa_id = v_empresa;

  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Rutina no encontrada');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function pausar_rutina(uuid, text) to authenticated;

create or replace function reanudar_rutina(p_id_rutina uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para gestionar rutinas de mantenimiento');
  end if;

  update rutinas_mantenimiento
     set activo = true,
         motivo_pausa = null,
         pausada_en = null,
         pausada_por = null
   where id = p_id_rutina and empresa_id = v_empresa;

  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Rutina no encontrada');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function reanudar_rutina(uuid) to authenticated;

create or replace function generar_alertas_rutinas()
returns void language plpgsql security definer as $$
declare
  v_rutina record;
begin
  for v_rutina in
    select * from rutinas_calculado
    where activo = true
      and estado_calculado in ('Vencida','Proxima')
      and not exists (
        select 1 from alertas a
        where a.tipo = 'rutina_mantenimiento' and a.id_referencia = rutinas_calculado.id and a.estado = 'Pendiente'
      )
  loop
    insert into alertas (empresa_id, tipo, id_referencia, descripcion, estado, link_wsp)
    values (
      v_rutina.empresa_id,
      'rutina_mantenimiento',
      v_rutina.id,
      case when v_rutina.estado_calculado = 'Vencida'
        then 'Rutina VENCIDA: ' || v_rutina.descripcion || ' — ' || v_rutina.unidad_descripcion
        else 'Rutina próxima a vencer: ' || v_rutina.descripcion || ' — ' || v_rutina.unidad_descripcion
      end,
      'Pendiente',
      'https://wa.me/?text=' || replace(v_rutina.descripcion || ' - ' || v_rutina.unidad_descripcion, ' ', '%20')
    );
  end loop;
end;
$$;
