-- =====================================================================
-- Los planes de mantenimiento solo se podían aplicar por tipo de unidad,
-- misión o tipo de componente. Se agregan dos alcances más: centro de
-- costo, y una unidad puntual (por patente) — para armar un plan que no
-- encaje en ninguna de las categorías generales.
-- =====================================================================

alter table planes_mantenimiento drop constraint if exists planes_mantenimiento_alcance_check;
alter table planes_mantenimiento add constraint planes_mantenimiento_alcance_check
  check (alcance in ('tipo_unidad','mision','componente_tipo','centro_costo','patente'));

create or replace function guardar_plan_mantenimiento(
  p_id uuid default null,
  p_descripcion text default null,
  p_alcance text default null,
  p_alcance_valor text default null
)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_id_plan uuid;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para gestionar planes de mantenimiento');
  end if;

  if p_descripcion is null or trim(p_descripcion) = '' then
    return jsonb_build_object('ok', false, 'msg', 'Faltan campos obligatorios');
  end if;

  if p_alcance not in ('tipo_unidad','mision','componente_tipo','centro_costo','patente') then
    return jsonb_build_object('ok', false, 'msg', 'Alcance inválido');
  end if;

  if p_alcance_valor is null or trim(p_alcance_valor) = '' then
    return jsonb_build_object('ok', false, 'msg', 'Falta indicar a qué aplica el plan');
  end if;

  if p_id is null then
    insert into planes_mantenimiento (empresa_id, descripcion, alcance, alcance_valor)
    values (v_empresa, trim(p_descripcion), p_alcance, trim(p_alcance_valor))
    returning id into v_id_plan;
  else
    update planes_mantenimiento
       set descripcion = trim(p_descripcion), alcance = p_alcance, alcance_valor = trim(p_alcance_valor)
     where id = p_id and empresa_id = v_empresa
     returning id into v_id_plan;

    if v_id_plan is null then
      return jsonb_build_object('ok', false, 'msg', 'Plan no encontrado');
    end if;
  end if;

  return jsonb_build_object('ok', true, 'id_plan', v_id_plan);
end;
$$;

create or replace function sugerir_planes_para_unidad(p_id_unidad uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_unidad unidades%rowtype;
begin
  select * into v_unidad from unidades where id = p_id_unidad and empresa_id = v_empresa;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Unidad no encontrada');
  end if;

  return jsonb_build_object(
    'ok', true,
    'planes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'descripcion', p.descripcion, 'alcance', p.alcance, 'alcance_valor', p.alcance_valor
      ))
      from planes_mantenimiento p
      where p.empresa_id = v_empresa and p.activo = true
        and exists (select 1 from plan_niveles pn where pn.id_plan = p.id and pn.activo = true)
        and exists (
          select 1 from plan_niveles pn
          where pn.id_plan = p.id and pn.activo = true
            and not exists (
              select 1 from rutinas_mantenimiento r
              where r.id_nivel_origen = pn.id and r.id_unidad = p_id_unidad and r.activo = true
            )
        )
        and (
          (p.alcance = 'tipo_unidad' and p.alcance_valor = v_unidad.tipo)
          or (p.alcance = 'mision' and p.alcance_valor = v_unidad.tipo_mision)
          or (p.alcance = 'centro_costo' and p.alcance_valor = v_unidad.centro_costo)
          or (p.alcance = 'patente' and p.alcance_valor = v_unidad.patente_serie)
          or (p.alcance = 'componente_tipo' and exists (
            select 1 from componentes_asignaciones ca
            join componentes_mantenibles c on c.id = ca.id_componente
            where ca.id_unidad = p_id_unidad and ca.hasta is null and c.tipo = p.alcance_valor and c.activo = true
          ))
        )
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function aplicar_plan_a_todas_las_unidades(p_id_plan uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_plan planes_mantenimiento%rowtype;
  v_unidad record;
  v_resultado jsonb;
  v_creadas int := 0;
  v_omitidas int := 0;
begin
  if rol_actual() not in ('administrador','supervisor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para gestionar rutinas de mantenimiento');
  end if;

  select * into v_plan from planes_mantenimiento where id = p_id_plan and empresa_id = v_empresa and activo = true;
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Plan no encontrado');
  end if;

  for v_unidad in
    select u.id from unidades u
    where u.empresa_id = v_empresa and u.activo = true
      and (
        (v_plan.alcance = 'tipo_unidad' and u.tipo = v_plan.alcance_valor)
        or (v_plan.alcance = 'mision' and u.tipo_mision = v_plan.alcance_valor)
        or (v_plan.alcance = 'centro_costo' and u.centro_costo = v_plan.alcance_valor)
        or (v_plan.alcance = 'patente' and u.patente_serie = v_plan.alcance_valor)
        or (v_plan.alcance = 'componente_tipo' and exists (
          select 1 from componentes_asignaciones ca
          join componentes_mantenibles c on c.id = ca.id_componente
          where ca.id_unidad = u.id and ca.hasta is null and c.tipo = v_plan.alcance_valor and c.activo = true
        ))
      )
      and not exists (
        select 1 from rutinas_mantenimiento r
        where r.id_plan_origen = p_id_plan and r.id_unidad = u.id and r.activo = true
      )
  loop
    v_resultado := aplicar_plan_a_unidad(p_id_plan, v_unidad.id);
    if (v_resultado->>'ok')::boolean then
      v_creadas := v_creadas + coalesce((v_resultado->>'creadas')::int, 0);
    else
      v_omitidas := v_omitidas + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'creadas', v_creadas, 'omitidas', v_omitidas);
end;
$$;
