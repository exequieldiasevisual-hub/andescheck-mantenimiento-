-- =====================================================================
-- Feature: Asistente de troubleshooting — búsqueda de fallas similares
-- Full-text search nativo de Postgres (to_tsvector/websearch_to_tsquery)
-- sobre OTs cerradas. Se arranca con esto en vez de pgvector: es gratis,
-- no depende de una API externa de embeddings, y alcanza para el volumen
-- de un CMMS. Si en el futuro la búsqueda por texto se queda corta,
-- ahí se evalúa sumar pgvector — no antes.
-- =====================================================================

alter table ot_cabecera add column if not exists busqueda_tsv tsvector
  generated always as (to_tsvector('spanish', coalesce(descripcion, ''))) stored;

create index if not exists idx_ot_cabecera_busqueda on ot_cabecera using gin (busqueda_tsv);

-- ---------------------------------------------------------------------
-- buscar_ot_similares
-- Roles permitidos: cualquier rol logueado (misma empresa).
-- Devuelve hasta 5 OTs cerradas con descripción similar, la observación
-- final del técnico (última fila de ot_seguimiento) y el repuesto que
-- más se usó en esa OT (mayor cantidad en stock_movimientos tipo egreso).
-- ---------------------------------------------------------------------
create or replace function buscar_ot_similares(p_texto text)
returns jsonb language plpgsql stable security definer as $$
declare
  v_empresa uuid := empresa_actual();
begin
  if p_texto is null or length(trim(p_texto)) < 3 then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(fila)
    from (
      select jsonb_build_object(
        'id_ot', o.id,
        'numero_ot', o.numero_ot,
        'descripcion', o.descripcion,
        'fecha_cierre', o.fecha_cierre,
        'relevancia', ts_rank(o.busqueda_tsv, websearch_to_tsquery('spanish', p_texto)),
        'ultima_observacion', (
          select s.descripcion from ot_seguimiento s
           where s.id_ot = o.id order by s.fecha desc limit 1
        ),
        'repuesto_mas_usado', (
          select st.descripcion from stock_movimientos m
          join stock st on st.id = m.id_repuesto
          where m.id_ot = o.id and m.tipo = 'egreso'
          order by m.cantidad desc limit 1
        )
      ) as fila
      from ot_cabecera o
      where o.empresa_id = v_empresa
        and o.estado in ('Cerrada','Cerrada_Vencida')
        and o.busqueda_tsv @@ websearch_to_tsquery('spanish', p_texto)
      order by ts_rank(o.busqueda_tsv, websearch_to_tsquery('spanish', p_texto)) desc
      limit 5
    ) sub
  ), '[]'::jsonb);
end;
$$;

grant execute on function buscar_ot_similares(text) to authenticated;
