-- Agrega el valor 'Pausada' al enum estado_tarea. Va en un archivo aparte
-- porque Postgres no permite usar un valor de enum recién agregado en la
-- misma transacción en que se lo agrega (rompería el resto del script si
-- fuera todo un solo archivo).

alter type estado_tarea add value if not exists 'Pausada';
