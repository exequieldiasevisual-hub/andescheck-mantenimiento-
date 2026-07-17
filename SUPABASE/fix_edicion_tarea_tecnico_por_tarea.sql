-- El técnico ahora puede estar asignado a una tarea puntual sin estarlo a
-- nivel de OT completa (tecnicos_multiples_por_tarea). La policy de update
-- solo miraba ot_cabecera.tecnicos_asignados, dejando a esos técnicos sin
-- poder marcar sus propias tareas. Se agrega el chequeo por tarea.

drop policy if exists "edicion_ot_tareas_tecnico" on ot_tareas;

create policy "edicion_ot_tareas_tecnico" on ot_tareas for update using (
  rol_actual() = 'tecnico'
  and (
    (select id from usuarios where auth_user_id = auth.uid()) = any(ot_tareas.tecnicos_asignados)
    or exists (
      select 1 from ot_cabecera o
       where o.id = ot_tareas.id_ot
         and (select id from usuarios where auth_user_id = auth.uid()) = any(o.tecnicos_asignados)
    )
  )
);
