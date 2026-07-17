-- =====================================================================
-- Fix: el técnico debe poder trabajar cualquier tarea de una OT en la que
-- esté asignado a nivel de OT (ot_cabecera.tecnicos_asignados), no solo
-- las tareas con tecnico_asignado seteado a él puntualmente — porque hoy
-- nada en la UI asigna ese campo por tarea, así que la policy vieja lo
-- dejaba sin poder marcar nada como completado.
-- =====================================================================

drop policy if exists "edicion_ot_tareas_tecnico" on ot_tareas;

create policy "edicion_ot_tareas_tecnico" on ot_tareas for update using (
  rol_actual() = 'tecnico'
  and exists (
    select 1 from ot_cabecera o
     where o.id = ot_tareas.id_ot
       and (select id from usuarios where auth_user_id = auth.uid()) = any(o.tecnicos_asignados)
  )
);

-- Misma lógica para "sus OT": el técnico solo lee las OT donde está asignado.
-- (Ya podía leer todas por la policy general de lectura por empresa; esto
-- no la reemplaza —el filtro real para el técnico se hace en el frontend
-- con .contains()— pero deja documentada la intención.)
