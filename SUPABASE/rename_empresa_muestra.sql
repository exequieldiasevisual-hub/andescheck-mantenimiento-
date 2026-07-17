-- Cambia el nombre visible de la empresa de prueba "LB Hidráulica" a
-- "AndesCheck" — es solo un dato (empresas.razon_social), no afecta el
-- alias de login ni ninguna otra tabla.

update empresas set razon_social = 'AndesCheck' where razon_social = 'LB Hidráulica';
