-- Agrega el rol 'super_admin' al enum rol_usuario. Va en su propio archivo
-- porque Postgres no permite usar un valor de enum recién agregado en la
-- misma transacción en que se lo agrega.

alter type rol_usuario add value if not exists 'super_admin';
