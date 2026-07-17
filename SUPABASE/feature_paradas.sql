-- ==== Registro de paradas (fuera de servicio) ====
-- Automatico: una OT de prioridad Alta abre una parada; su cierre/anulacion la termina.
-- Manual: marcar_fuera_de_servicio / marcar_en_servicio para casos sin OT.
-- get_paradas_unidad(): resumen para la ficha del activo.

create table if not exists unidad_paradas (
  id uuid primary key default gen_random_uuid(),
  id_unidad uuid not null references unidades(id) on delete cascade,
  desde timestamptz not null default now(),
  hasta timestamptz,
  motivo text,
  id_ot uuid references ot_cabecera(id),
  usuario uuid references usuarios(id)
);
create index if not exists idx_unidad_paradas_unidad on unidad_paradas(id_unidad);
alter table unidad_paradas enable row level security;

create policy "lectura_unidad_paradas" on unidad_paradas for select using (
  exists (select 1 from unidades u where u.id = unidad_paradas.id_unidad and u.empresa_id = empresa_actual())
);
grant select on unidad_paradas to authenticated;
-- Sin policy de escritura directa: todo pasa por triggers/RPCs.

-- Trigger: OT de prioridad Alta abre parada automatica (si la unidad no tiene una abierta)
create or replace function _parada_por_ot() returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    if new.prioridad = 'Alta' and new.estado in ('Abierta','En_Curso')
       and not exists (select 1 from unidad_paradas p where p.id_unidad = new.id_unidad and p.hasta is null) then
      insert into unidad_paradas (id_unidad, desde, motivo, id_ot, usuario)
      values (new.id_unidad, new.fecha_apertura, 'OT prioridad Alta: ' || new.numero_ot, new.id, new.supervisor);
    end if;
  elsif tg_op = 'UPDATE' then
    if old.estado in ('Abierta','En_Curso') and new.estado in ('Cerrada','Cerrada_Vencida','Anulada') then
      update unidad_paradas set hasta = coalesce(new.fecha_cierre, now())
       where id_ot = new.id and hasta is null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_parada_por_ot on ot_cabecera;
create trigger trg_parada_por_ot after insert or update on ot_cabecera
for each row execute function _parada_por_ot();

-- Manual: marcar fuera de servicio
create or replace function marcar_fuera_de_servicio(p_id_unidad uuid, p_motivo text default null)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  if not exists (select 1 from unidades where id = p_id_unidad and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  if exists (select 1 from unidad_paradas where id_unidad = p_id_unidad and hasta is null) then
    return jsonb_build_object('ok', false, 'msg', 'La unidad ya está marcada fuera de servicio');
  end if;

  insert into unidad_paradas (id_unidad, motivo, usuario)
  values (p_id_unidad, nullif(trim(coalesce(p_motivo, '')), ''), (select id from usuarios where auth_user_id = auth.uid()));

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function marcar_fuera_de_servicio(uuid, text) to authenticated;

-- Manual: volver a servicio
create or replace function marcar_en_servicio(p_id_unidad uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso');
  end if;

  update unidad_paradas set hasta = now()
   where id_unidad = p_id_unidad and hasta is null
     and exists (select 1 from unidades u where u.id = p_id_unidad and u.empresa_id = v_empresa);

  if not found then
    return jsonb_build_object('ok', false, 'msg', 'La unidad no tiene una parada abierta');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function marcar_en_servicio(uuid) to authenticated;

-- Resumen para la ficha del activo
create or replace function get_paradas_unidad(p_id_unidad uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  if not exists (select 1 from unidades where id = p_id_unidad and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  return jsonb_build_object(
    'ok', true,
    'parada_abierta', (
      select jsonb_build_object('desde', desde, 'motivo', motivo)
      from unidad_paradas where id_unidad = p_id_unidad and hasta is null
      order by desde desc limit 1
    ),
    'dias_parada_12m', coalesce((
      select round(sum(extract(epoch from (coalesce(hasta, now()) - greatest(desde, now() - interval '12 months'))) / 86400)::numeric, 1)
      from unidad_paradas
      where id_unidad = p_id_unidad and coalesce(hasta, now()) >= now() - interval '12 months'
    ), 0),
    'paradas', coalesce((
      select jsonb_agg(jsonb_build_object('desde', desde, 'hasta', hasta, 'motivo', motivo) order by desde desc)
      from (select * from unidad_paradas where id_unidad = p_id_unidad order by desde desc limit 10) p
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function get_paradas_unidad(uuid) to authenticated;
