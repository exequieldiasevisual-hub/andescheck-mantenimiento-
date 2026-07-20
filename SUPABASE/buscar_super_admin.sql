-- Solo lectura: identifica la(s) cuenta(s) super_admin que existan, con el
-- alias de empresa y usuario necesarios para loguearse (o para el reset).
select
  e.alias as alias_empresa,
  e.razon_social,
  u.usuario,
  u.nombre,
  u.activo,
  u.id as id_usuario
from usuarios u
join empresas e on e.id = u.empresa_id
where u.rol = 'super_admin';
