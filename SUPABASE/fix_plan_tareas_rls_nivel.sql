-- ==== Fix: RLS de plan_tareas nunca se actualizó para el modelo de niveles ====
-- La política de lectura seguía chequeando plan_tareas.id_plan (empresa
-- dueña del plan), pero las tareas ahora cuelgan de un NIVEL (id_nivel) y
-- id_plan queda en null para todas las filas nuevas — con la política vieja,
-- cualquier consulta que traiga varias filas sin filtrar por id_nivel
-- puntual puede devolver de menos o vacío según el plan de ejecución.

drop policy if exists "lectura_plan_tareas" on plan_tareas;

create policy "lectura_plan_tareas" on plan_tareas for select using (
  exists (select 1 from planes_mantenimiento p where p.id = plan_tareas.id_plan and p.empresa_id = empresa_actual())
  or exists (
    select 1 from plan_niveles n
    join planes_mantenimiento p on p.id = n.id_plan
    where n.id = plan_tareas.id_nivel and p.empresa_id = empresa_actual()
  )
);
