import { supabase } from './supabase'

// Trae las filas de una sección de Configuración. Para secciones con
// código + descripción (tipos_unidad, ciudades, centros_costo) clave=código
// y valor=descripción. Para listas simples (tipos_mision, tipos_novedad...)
// clave=valor=el texto. Se usa tanto en los <select> de carga (Unidades)
// como en los filtros (Ot), así ambos leen la misma fuente.
export async function obtenerOpciones(seccion) {
  const { data } = await supabase.from('configuracion').select('clave, valor').eq('seccion', seccion).order('clave')
  return data || []
}
