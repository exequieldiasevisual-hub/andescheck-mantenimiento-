-- Historial temporal de la misión de cada unidad: la misión nunca se sobrescribe sin dejar rastro.
-- cambiar_mision cierra la vigencia anterior y abre la nueva, manteniendo unidades.tipo_mision sincronizado para no romper el resto del sistema que ya lo usa.

create table if not exists unidad_mision_historial (
  id uuid primary key default gen_random_uuid(),
  id_unidad uuid not null references unidades(id) on delete cascade,
  mision text not null,
  desde date not null default current_date,
  hasta date,
  usuario uuid references usuarios(id)
);
create index if not exists idx_unidad_mision_historial_unidad on unidad_mision_historial(id_unidad);

-- Solo puede haber UNA vigencia activa (hasta is null) por unidad a la vez.
create unique index if not exists idx_unidad_mision_historial_una_vigente
  on unidad_mision_historial(id_unidad) where hasta is null;

alter table unidad_mision_historial enable row level security;

create policy "lectura_unidad_mision_historial" on unidad_mision_historial for select using (
  exists (select 1 from unidades u where u.id = unidad_mision_historial.id_unidad and u.empresa_id = empresa_actual())
);
grant select on unidad_mision_historial to authenticated;
-- Sin policy de insert/update directo: todo pasa por cambiar_mision().

insert into unidad_mision_historial (id_unidad, mision, desde)
select u.id, u.tipo_mision, coalesce(u.fecha_alta::date, current_date)
from unidades u
where u.tipo_mision is not null
  and trim(u.tipo_mision) <> ''
  and not exists (select 1 from unidad_mision_historial h where h.id_unidad = u.id);

create or replace function cambiar_mision(p_id_unidad uuid, p_nueva_mision text)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para cambiar la misión de la unidad');
  end if;

  if p_nueva_mision is null or trim(p_nueva_mision) = '' then
    return jsonb_build_object('ok', false, 'msg', 'La misión es obligatoria');
  end if;

  if not exists (select 1 from unidades where id = p_id_unidad and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  if exists (
    select 1 from unidad_mision_historial
    where id_unidad = p_id_unidad and hasta is null and mision = trim(p_nueva_mision)
  ) then
    return jsonb_build_object('ok', false, 'msg', 'Esa ya es la misión vigente de la unidad');
  end if;

  update unidad_mision_historial
     set hasta = current_date
   where id_unidad = p_id_unidad and hasta is null;

  insert into unidad_mision_historial (id_unidad, mision, usuario)
  values (p_id_unidad, trim(p_nueva_mision), (select id from usuarios where auth_user_id = auth.uid()));

  update unidades set tipo_mision = trim(p_nueva_mision) where id = p_id_unidad;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function cambiar_mision(uuid, text) to authenticated;

create or replace function get_historial_mision(p_id_unidad uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  if not exists (select 1 from unidades where id = p_id_unidad and empresa_id = v_empresa) then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  return jsonb_build_object(
    'ok', true,
    'historial', coalesce((
      select jsonb_agg(jsonb_build_object('mision', mision, 'desde', desde, 'hasta', hasta) order by desde desc)
      from unidad_mision_historial
      where id_unidad = p_id_unidad
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function get_historial_mision(uuid) to authenticated;
