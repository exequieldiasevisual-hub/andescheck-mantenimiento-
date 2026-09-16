-- =====================================================================
-- Agrega "otros_gastos" (ej. AdBlue importado del remito de combustible)
-- a get_resultado_neto: se suma automático por unidad y mes, igual que
-- combustible y mantenimiento.
-- =====================================================================

create or replace function get_resultado_neto(p_mes date)
returns jsonb language plpgsql security definer as $$
declare
  v_empresa uuid := empresa_actual();
  v_desde date := date_trunc('month', p_mes)::date;
  v_hasta date := v_desde + interval '1 month';
  v_anio int := extract(year from v_desde)::int;
begin
  if rol_actual() not in ('administrador','supervisor','auditor') then
    return jsonb_build_object('ok', false, 'msg', 'Sin permiso para ver reportes');
  end if;

  return jsonb_build_object(
    'ok', true,
    'mes', to_char(v_desde, 'YYYY-MM'),
    'unidades', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id_unidad', u.id,
        'unidad', u.descripcion,
        'patente', u.patente_serie,
        'centro_costo', u.centro_costo,
        'facturado', f.monto,
        'combustible', comb.total,
        'mantenimiento', mant.total,
        'otros_gastos', otros.total,
        'anual_prorateado', anual.total,
        'sueldo_chofer_prorateado', sueldo.total,
        'costo_centro_prorateado', centro.total,
        'km', bit.km,
        'resultado',
          coalesce(f.monto, 0) - coalesce(comb.total, 0) - coalesce(mant.total, 0) - coalesce(otros.total, 0)
          - coalesce(anual.total, 0) - coalesce(sueldo.total, 0) - coalesce(centro.total, 0)
      ) order by u.descripcion)
      from unidades u
      left join costos_empresa_facturado f on f.id_unidad = u.id and f.mes = v_desde
      left join lateral (
        select sum(coalesce(cc.precio_total, cc.litros * cc.precio_unitario)) as total from combustible_cargas cc
        where cc.id_unidad = u.id and cc.fecha >= v_desde and cc.fecha < v_hasta
      ) comb on true
      left join lateral (
        select sum(c.monto) as total from costos c join ot_cabecera ot on ot.id = c.id_ot
        where ot.id_unidad = u.id and c.fecha >= v_desde and c.fecha < v_hasta
      ) mant on true
      left join lateral (
        select sum(og.monto) as total from otros_gastos_unidad og
        where og.id_unidad = u.id and og.fecha >= v_desde and og.fecha < v_hasta
      ) otros on true
      left join lateral (
        select sum(ca.monto_anual) / 12 as total from costos_empresa_anual ca
        where ca.id_unidad = u.id and ca.anio = v_anio
      ) anual on true
      left join lateral (
        -- El sueldo del chofer se reparte entre las unidades que manejó ese mes.
        select sum(sc.monto / nullif(cant.n, 0)) as total
        from bitacora_viajes bv
        join costos_empresa_sueldo_chofer sc on sc.id_chofer = bv.id_chofer and sc.mes = v_desde
        join lateral (
          select count(distinct bv2.id_unidad) as n from bitacora_viajes bv2
          where bv2.id_chofer = bv.id_chofer and bv2.fecha >= v_desde and bv2.fecha < v_hasta
        ) cant on true
        where bv.id_unidad = u.id and bv.fecha >= v_desde and bv.fecha < v_hasta
        group by bv.id_unidad
      ) sueldo on true
      left join lateral (
        select sum(cec.monto / nullif(cant_u.n, 0)) as total
        from costos_empresa_centro cec
        join lateral (
          select count(*) as n from unidades u2
          where u2.centro_costo = cec.centro_costo and u2.empresa_id = v_empresa and u2.activo
        ) cant_u on true
        where cec.centro_costo = u.centro_costo and cec.mes = v_desde and u.centro_costo is not null
      ) centro on true
      left join lateral (
        select sum(bv.km) as km from bitacora_viajes bv
        where bv.id_unidad = u.id and bv.fecha >= v_desde and bv.fecha < v_hasta
      ) bit on true
      where u.empresa_id = v_empresa and u.activo
    ), '[]'::jsonb)
  );
end;
$$;
