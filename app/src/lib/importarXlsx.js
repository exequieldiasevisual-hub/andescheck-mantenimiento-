// Contraparte de exportarXlsx.js — lee la primera hoja y devuelve filas
// como objetos usando la primera fila como encabezado (mismo formato de
// salida que parseCsv, para que el código que las consume no distinga).
// exceljs se importa recién acá adentro, ver el comentario en exportarXlsx.js.
export async function parseXlsx(arrayBuffer) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(arrayBuffer)
  const ws = wb.worksheets[0]
  if (!ws) return []

  const encabezado = []
  ws.getRow(1).eachCell((cell, col) => { encabezado[col] = String(cell.value ?? '') })

  const filas = []
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const fila = {}
    row.eachCell((cell, col) => { if (encabezado[col]) fila[encabezado[col]] = cell.value ?? '' })
    filas.push(fila)
  })
  return filas
}
