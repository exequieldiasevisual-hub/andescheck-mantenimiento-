-- =====================================================================
-- Alertas de vencimiento por fecha (checklist): dejaban de duplicarse
-- solo dentro de la MISMA respuesta, pero cada checklist nuevo inserta
-- una fila de respuesta nueva con la misma fecha de vencimiento — el job
-- diario (7am) la veía "sin avisar todavía" y generaba otra Novedad. Con
-- una unidad visitada varias veces por semana, esto se acumulaba en
-- decenas o cientos de Novedades repetidas del mismo vencimiento.
--
-- Ahora, en vez de duplicar la Novedad, se suma un contador
-- novedades.veces_reportada: si ya existe una respuesta previa de la
-- MISMA unidad + MISMO ítem + MISMA fecha que generó una Novedad, esta
-- respuesta se enlaza a esa Novedad y le suma 1 al contador (y actualiza
-- la fecha del último reporte), en vez de crear una fila nueva. Si la
-- fecha de vencimiento cambia (ej. se recalibró el equipo), es una fecha
-- distinta y sí dispara una Novedad nueva, como corresponde.
-- =====================================================================

alter table novedades add column if not exists veces_reportada int not null default 1;
alter table novedades add column if not exists fecha_ultimo_reporte timestamptz;
update novedades set fecha_ultimo_reporte = fecha where fecha_ultimo_reporte is null;

create or replace function generar_alertas_checklist_vencimiento()
returns void language plpgsql security definer as $$
declare
  v_r record;
  v_id_novedad uuid;
  v_novedad_existente uuid;
begin
  for v_r in
    select r.id as id_respuesta, r.respuesta, e.empresa_id, e.id_unidad, e.usuario_carga, e.ubicacion_url,
           i.id as id_item, i.novedad_tipo, i.novedad_descripcion, i.pregunta, u.descripcion as unidad_descripcion
    from checklist_respuestas r
    join checklist_items i on i.id = r.id_item
    join checklist_ejecuciones e on e.id = r.id_ejecucion
    join unidades u on u.id = e.id_unidad
    where i.tipo_respuesta = 'fecha'
      and i.dispara_novedad
      and i.valor_disparador ~ '^\d+$'
      and r.id_novedad_generada is null
      and r.respuesta ~ '^\d{4}-\d{2}-\d{2}$'
      and (r.respuesta::date - (i.valor_disparador::int)) <= current_date
  loop
    select r2.id_novedad_generada into v_novedad_existente
    from checklist_respuestas r2
    join checklist_ejecuciones e2 on e2.id = r2.id_ejecucion
    where r2.id_item = v_r.id_item
      and e2.id_unidad = v_r.id_unidad
      and r2.respuesta = v_r.respuesta
      and r2.id_novedad_generada is not null
    limit 1;

    if v_novedad_existente is not null then
      update novedades set veces_reportada = veces_reportada + 1, fecha_ultimo_reporte = now() where id = v_novedad_existente;
      update checklist_respuestas set id_novedad_generada = v_novedad_existente where id = v_r.id_respuesta;
      continue;
    end if;

    insert into novedades (empresa_id, id_unidad, descripcion, tipo, usuario_carga, ubicacion_url, veces_reportada, fecha_ultimo_reporte)
    values (
      v_r.empresa_id, v_r.id_unidad,
      coalesce(nullif(trim(v_r.novedad_descripcion), ''),
        v_r.pregunta || ' — vence ' || v_r.respuesta || ' (' || v_r.unidad_descripcion || ')'),
      v_r.novedad_tipo, v_r.usuario_carga, v_r.ubicacion_url, 1, now()
    )
    returning id into v_id_novedad;

    update checklist_respuestas set id_novedad_generada = v_id_novedad where id = v_r.id_respuesta;
  end loop;
end;
$$;
