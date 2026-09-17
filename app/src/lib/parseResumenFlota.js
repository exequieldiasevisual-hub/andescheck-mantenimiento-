import ExcelJS from 'exceljs'

// Parsea el "Resumen de Flota" que exporta el sistema de GPS/telemetría.
// No es una tabla simple: tiene varias filas de título (Empresa, Grupo,
// Desde, Hasta) antes del encabezado real, por eso no se reutiliza
// parseXlsx. El encabezado se ubica buscando la columna "Matrícula".
//
// El Horómetro viene con formato de fecha/hora en vez de un número de
// horas (el sistema de origen lo exporta como duración y Excel lo
// interpreta como fecha) — se reconstruye a partir del serial de fecha:
// los días desde el 30/12/1899 (época de Excel) * 24 = horas reales.
const EPOCA_EXCEL = Date.UTC(1899, 11, 30)

function horasDesdeFecha(valor) {
  if (valor instanceof Date) return ((valor.getTime() - EPOCA_EXCEL) / 86400000) * 24
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

export async function parseResumenFlota(arrayBuffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(arrayBuffer)
  const ws = wb.worksheets[0]
  if (!ws) return []

  let filaEncabezado = null
  let colMatricula, colOdometro, colHorometro
  ws.eachRow((row, rowNumber) => {
    if (filaEncabezado) return
    row.eachCell((cell, col) => {
      const texto = String(cell.value ?? '').trim().toLowerCase()
      if (texto === 'matrícula' || texto === 'matricula') colMatricula = col
      if (texto === 'odómetro' || texto === 'odometro') colOdometro = col
      if (texto === 'horómetro' || texto === 'horometro') colHorometro = col
    })
    if (colMatricula && colOdometro) filaEncabezado = rowNumber
  })
  if (!filaEncabezado) return []

  const filas = []
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= filaEncabezado) return
    const matricula = String(row.getCell(colMatricula).value ?? '').trim()
    if (!matricula) return

    const odometro = Number(row.getCell(colOdometro).value)
    filas.push({
      matricula,
      km: Number.isFinite(odometro) ? odometro : null,
      hs: colHorometro ? horasDesdeFecha(row.getCell(colHorometro).value) : null,
    })
  })
  return filas
}
