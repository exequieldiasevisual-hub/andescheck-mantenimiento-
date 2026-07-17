// Parsea un CSV simple (comillas + comas escapadas) a filas de objetos usando
// la primera línea como encabezado. Contraparte de exportarCsv.js.
export function parseCsv(texto) {
  const limpio = texto.replace(/^﻿/, '')
  const lineas = limpio.split(/\r\n|\n/).filter(l => l.trim() !== '')
  if (lineas.length === 0) return []

  function parseLinea(linea) {
    const campos = []
    let actual = ''
    let enComillas = false
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i]
      if (enComillas) {
        if (c === '"' && linea[i + 1] === '"') { actual += '"'; i++ }
        else if (c === '"') { enComillas = false }
        else { actual += c }
      } else if (c === '"') { enComillas = true }
      else if (c === ',') { campos.push(actual); actual = '' }
      else { actual += c }
    }
    campos.push(actual)
    return campos
  }

  const encabezado = parseLinea(lineas[0])
  return lineas.slice(1).map(linea => {
    const campos = parseLinea(linea)
    return Object.fromEntries(encabezado.map((h, i) => [h, campos[i] ?? '']))
  })
}
