-- Diagnóstico: muestra tal cual están guardados los viajes Aprobados de
-- Bitácora de estos días, para ver el formato exacto de patente y fecha
-- y armar un filtro que sí matchee.

select bv.id, o.patente_serie, bv.origen, bv.destino, bv.fecha, bv.estado
from bitacora_viajes bv
join unidades o on o.id = bv.id_unidad
where bv.estado = 'Aprobado'
order by bv.fecha desc
limit 20;
