import ExcelJS from 'exceljs'

// Exporta a .xlsx real (no CSV) para que Excel muestre los filtros de
// columna apenas se abre el archivo — un CSV no puede llevar eso adentro.
export async function exportarXlsx(nombreArchivo, filas, columnas) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Datos')

  ws.columns = columnas.map(c => ({ header: c.label, key: c.label, width: Math.max(12, c.label.length + 2) }))
  filas.forEach(fila => ws.addRow(Object.fromEntries(columnas.map(c => [c.label, c.get(fila) ?? '']))))

  ws.getRow(1).font = { bold: true }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombreArchivo}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
