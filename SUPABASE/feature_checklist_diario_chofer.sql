-- =====================================================================
-- Cumplimiento del checklist diario de chofer, en Reportes.
--   * checklist_plantillas.es_diario_chofer: se marca en la plantilla
--     (ej. "Check List Control Diario") — puede haber más de una marcada.
--   * choferes_franco: rangos de fechas en que un chofer está de franco;
--     esos días queda excluido del reporte, sin necesidad de reactivarlo
--     a mano.
--   * get_cumplimiento_checklist_diario: tabla del día — por cada chofer
--     activo (sin contar los de franco ese día), si ya completó alguna
--     plantilla marcada como diaria.
--   * get_historial_checklist_diario_chofer: mismo cálculo día por día
--     en un rango, para el calendario de un chofer puntual.
-- Las fechas se comparan en huso horario Argentina (mismo criterio que
-- ya se usa para Bitácora) para que "hoy" coincida con lo que ve el
-- chofer en el celu.
-- =====================================================================

alter table checklist_plantillas add column if not exists es_diario_chofer boolean not null default false;

create table if not exists choferes_franco (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  id_chofer uuid not null references usuarios(id) on delete cascade,
  desde date not null,
  hasta date not null,
  motivo text,
  usuario_alta uuid references usuarios(id),
  fecha_alta timestamptz not null default now(),
  check (hasta >= desde)
);
create index if not exists idx_choferes_franco_chofer on choferes_franco(id_chofer, desde, hasta);

alter table choferes_franco enable row level security;

drop policy if exists lectura_choferes_franco on choferes_franco;
create policy lectura_choferes_franco on choferes_franco for select using (empresa_id = empresa_actual());

drop policy if exists escritura_choferes_franco on choferes_franco;
create policy escritura_choferes_franco on choferes_franco for all using (
  empresa_id = empresa_actual() and rol_actual() in ('administrador','supervisor')
);

-- ---------------------------------------------------------------------
create or replace function get_cumplimiento_checklist_diario(p_fecha date default current_date)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  if rol_actual() not in ('administrador','supervisor','auditor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para ver reportes');
  end if;

  return jsonb_build_object(
    'ok', true,
    'fecha', p_fecha,
    'choferes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'nombre', c.nombre,
        'en_franco', fr.id is not null,
        'motivo_franco', fr.motivo,
        'cumplio', ej.id is not null,
        'hora', ej.fecha
      ) order by c.nombre)
      from usuarios c
      left join lateral (
        select f.id, f.motivo from choferes_franco f
        where f.id_chofer = c.id and f.desde <= p_fecha and f.hasta >= p_fecha
        limit 1
      ) fr on true
      left join lateral (
        select e.id, e.fecha from checklist_ejecuciones e
        join checklist_plantillas p on p.id = e.id_plantilla
        where e.usuario_carga = c.id and p.es_diario_chofer
          and (e.fecha at time zone 'America/Argentina/Buenos_Aires')::date = p_fecha
        order by e.fecha desc limit 1
      ) ej on true
      where c.empresa_id = v_empresa and c.rol = 'chofer' and c.activo
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function get_cumplimiento_checklist_diario(date) to authenticated;

-- ---------------------------------------------------------------------
create or replace function get_historial_checklist_diario_chofer(p_id_chofer uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  if rol_actual() not in ('administrador','supervisor','auditor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para ver reportes');
  end if;
  if not exists (select 1 from usuarios where id = p_id_chofer and empresa_id = v_empresa and rol = 'chofer') then
    return jsonb_build_object('ok', false, 'msg', 'Chofer no encontrado');
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    return jsonb_build_object('ok', false, 'msg', 'Rango de fechas inválido');
  end if;

  return jsonb_build_object(
    'ok', true,
    'dias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fecha', d::date,
        'en_franco', fr.id is not null,
        'cumplio', ej.id is not null,
        'hora', ej.fecha
      ) order by d)
      from generate_series(p_desde, p_hasta, interval '1 day') d
      left join lateral (
        select f.id from choferes_franco f
        where f.id_chofer = p_id_chofer and f.desde <= d::date and f.hasta >= d::date
        limit 1
      ) fr on true
      left join lateral (
        select e.id, e.fecha from checklist_ejecuciones e
        join checklist_plantillas p on p.id = e.id_plantilla
        where e.usuario_carga = p_id_chofer and p.es_diario_chofer
          and (e.fecha at time zone 'America/Argentina/Buenos_Aires')::date = d::date
        order by e.fecha desc limit 1
      ) ej on true
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function get_historial_checklist_diario_chofer(uuid, date, date) to authenticated;
