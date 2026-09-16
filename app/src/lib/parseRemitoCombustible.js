import ExcelJS from 'exceljs'

// Parsea el Excel de remitos que exporta el sistema de la estación de
// servicio. No es una tabla simple: tiene 2 filas de título antes del
// encabezado real, y una fila "Total Remito" al final — por eso no se
// reutiliza parseXlsx (que asume la fila 1 como encabezado).
//
// Columnas fijas del export: Fecha | UEN | Turno | Remito | Factura |
// Chofer | Tipo de documento | N° documento | Patente | Kilometraje |
// Vendedor | Tarjeta | Importe (total del remito) | Cod. Producto |
// Producto | Cantidad | Prec Unit | Importe (de la línea).
const COL = {
  fecha: 1, estacion: 2, remito: 4, chofer: 6, patente: 9, km: 10,
  codProducto: 14, producto: 15, cantidad: 16, precioUnitario: 17, importeLinea: 18,
}

function textoCelda(row, col) {
  return String(row.getCell(col).value ?? '').trim()
}

function fechaCelda(row, col) {
  const v = row.getCell(col).value
  if (v instanceof Date) return v
  const m = String(v ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/)
  if (!m) return null
  const [, d, mo, y, h, mi] = m
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0))
}

export async function parseRemitoCombustible(arrayBuffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(arrayBuffer)
  const ws = wb.worksheets[0]
  if (!ws) return []

  let filaEncabezado = null
  ws.eachRow((row, rowNumber) => {
    if (filaEncabezado) return
    if (textoCelda(row, COL.fecha).toLowerCase() === 'fecha' && textoCelda(row, COL.patente).toLowerCase() === 'patente') {
      filaEncabezado = rowNumber
    }
  })
  if (!filaEncabezado) return []

  const filas = []
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= filaEncabezado) return
    const fecha = textoCelda(row, COL.fecha)
    if (!fecha || fecha.toLowerCase().startsWith('total')) return

    filas.push({
      fecha: fechaCelda(row, COL.fecha),
      estacion: textoCelda(row, COL.estacion),
      remito: textoCelda(row, COL.remito),
      chofer: textoCelda(row, COL.chofer),
      patente: textoCelda(row, COL.patente),
      km: Number(row.getCell(COL.km).value) || null,
      codProducto: textoCelda(row, COL.codProducto),
      producto: textoCelda(row, COL.producto),
      cantidad: Number(row.getCell(COL.cantidad).value) || 0,
      precioUnitario: Number(row.getCell(COL.precioUnitario).value) || null,
      importeLinea: Number(row.getCell(COL.importeLinea).value) || 0,
    })
  })
  return filas
}

const PALABRAS_COMBUSTIBLE = ['NAFTA', 'GASOIL', 'DIESEL', 'GNC']

export function esCombustible(producto) {
  const p = (producto || '').toUpperCase()
  return PALABRAS_COMBUSTIBLE.some(palabra => p.includes(palabra))
}
