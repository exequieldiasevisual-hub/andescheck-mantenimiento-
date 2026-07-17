-- =====================================================================
-- Fase 4 — Documentación avanzada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Días de alerta configurables por tipo de documento (antes era fijo:
-- 30 días para todos). Se guarda en configuracion, sección
-- 'alertas_dias_documento', clave = tipo de documento, valor = días.
-- Si no hay config para ese tipo, se usa 30 por defecto.
-- Se dropea y recrea (no CREATE OR REPLACE): la vista original se creó
-- con "select *" antes de que Fase 2 le agregara actualizado_en /
-- actualizado_por a unidad_docs, así que ese "*" quedó "congelado" sin
-- esas columnas. Re-expandirlo con CREATE OR REPLACE corre esas columnas
-- de lugar y Postgres lo rechaza ("cannot change name of view column").
-- Nada depende de esta vista por posición de columna, así que dropearla
-- es seguro.
-- ---------------------------------------------------------------------
drop view if exists unidad_docs_calculado;

create view unidad_docs_calculado as
  select d.*,
    case
      when d.fecha_vigencia_hasta is null then 'Sin fecha'
      when d.fecha_vigencia_hasta < current_date then 'Vencido'
      when d.fecha_vigencia_hasta <= current_date + (
        coalesce(
          (select cfg.valor::int from configuracion cfg
             join unidades u on u.id = d.id_unidad
            where cfg.empresa_id = u.empresa_id
              and cfg.seccion = 'alertas_dias_documento'
              and cfg.clave = d.tipo),
          30
        ) * interval '1 day'
      ) then 'Por vencer'
      else 'Vigente'
    end as estado_calculado
  from unidad_docs d;

-- DROP VIEW se lleva puestos los grants explícitos que tuviera la vista
-- vieja; los default privileges deberían cubrirla, pero lo garantizamos.
grant select on unidad_docs_calculado to authenticated;
