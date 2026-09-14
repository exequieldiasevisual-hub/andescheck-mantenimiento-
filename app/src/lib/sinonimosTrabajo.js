// Grupos de palabras intercambiables para el catálogo de trabajos — así
// buscar "reemplazar filtro" encuentra "Cambio de filtro" aunque no
// compartan ninguna palabra literal. Lista fija y acotada a los verbos
// típicos de mantenimiento; agregar más grupos si aparecen otros casos.
const GRUPOS_SINONIMOS = [
  ['cambio', 'cambiar', 'reemplazo', 'reemplazar', 'sustitucion', 'sustituir', 'renovacion', 'renovar'],
  ['revision', 'revisar', 'inspeccion', 'inspeccionar', 'chequeo', 'chequear', 'control', 'controlar', 'verificacion', 'verificar'],
  ['reparacion', 'reparar', 'arreglo', 'arreglar'],
  ['limpieza', 'limpiar', 'higienizacion', 'higienizar'],
  ['ajuste', 'ajustar', 'regulacion', 'regular'],
  ['diagnostico', 'diagnosticar'],
  ['carga', 'cargar', 'recarga', 'recargar'],
  ['prueba', 'probar', 'testeo', 'testear'],
]

function quitarAcentos(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function expandirTermino(palabra) {
  const grupo = GRUPOS_SINONIMOS.find(g => g.includes(palabra))
  return grupo || [palabra]
}

// true si cada palabra de `query` (o alguno de sus sinónimos) aparece en
// `textoCompleto` — sin importar el orden ni acentos/mayúsculas.
export function coincideConSinonimos(textoCompleto, query) {
  const texto = quitarAcentos((textoCompleto || '').toLowerCase())
  const palabras = quitarAcentos(query.trim().toLowerCase()).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return false
  return palabras.every(palabra => expandirTermino(palabra).some(alt => texto.includes(alt)))
}
