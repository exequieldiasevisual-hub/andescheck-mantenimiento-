import { jsPDF } from 'jspdf'

async function imagenABase64(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    const contentType = res.headers.get('content-type') || ''
    const formato = contentType.includes('png') ? 'PNG' : contentType.includes('webp') ? 'WEBP' : 'JPEG'
    return { base64: buffer.toString('base64'), formato }
  } catch {
    return null
  }
}

const MARGEN = 14
const ANCHO_UTIL = 182 // A4 (210mm) - 2*margen
const COLOR_PILL = {
  Bien: [[234, 243, 222], [39, 80, 10]],
  Sí: [[234, 243, 222], [39, 80, 10]],
  Mal: [[252, 235, 235], [121, 31, 31]],
  No: [[252, 235, 235], [121, 31, 31]],
  Regular: [[250, 238, 218], [133, 79, 11]],
}
function colorPill(respuesta) {
  return COLOR_PILL[respuesta] || [[245, 245, 243], [100, 100, 100]]
}

function saltoDePaginaSiHaceFalta(doc, y, alto = 8) {
  if (y + alto <= 280) return y
  doc.addPage()
  return 20
}

export async function armarPdf(datos) {
  const doc = new jsPDF()
  const centroX = 105
  let y = 20

  const logo = datos.empresa?.logo_url ? await imagenABase64(datos.empresa.logo_url) : null
  if (logo) {
    doc.addImage(`data:image/${logo.formato.toLowerCase()};base64,${logo.base64}`, logo.formato, centroX - 15, y, 30, 18)
    y += 24
  }

  doc.setTextColor(30, 30, 30)
  doc.setFontSize(16)
  doc.text(datos.empresa?.razon_social || 'AndesCheck', centroX, y, { align: 'center' })
  y += 7
  doc.setFontSize(11)
  doc.setTextColor(100, 100, 100)
  const unidadTexto = [datos.unidad?.patente_serie, datos.unidad?.descripcion].filter(Boolean).join(' — ')
  doc.text(`${datos.plantilla?.nombre || ''} — ${unidadTexto}`, centroX, y, { align: 'center' })
  y += 12

  // Caja de datos generales
  const filasCaja = [
    ['Fecha', new Date(datos.ejecucion?.fecha).toLocaleString('es-AR')],
    ['Realizado por', datos.ejecucion?.usuario_nombre || '—'],
  ]
  const altoCaja = filasCaja.length * 6 + 6
  doc.setFillColor(245, 245, 243)
  doc.roundedRect(MARGEN, y, ANCHO_UTIL, altoCaja, 2, 2, 'F')
  let yCaja = y + 8
  doc.setFontSize(10)
  for (const [label, valor] of filasCaja) {
    doc.setTextColor(100, 100, 100)
    doc.text(label, MARGEN + 6, yCaja)
    doc.setTextColor(30, 30, 30)
    doc.text(String(valor), MARGEN + ANCHO_UTIL - 6, yCaja, { align: 'right' })
    yCaja += 6
  }
  y += altoCaja + 10

  doc.setFontSize(12)
  doc.setTextColor(30, 30, 30)
  doc.text('Respuestas', MARGEN, y)
  y += 3
  doc.setDrawColor(230, 230, 226)
  doc.line(MARGEN, y, MARGEN + ANCHO_UTIL, y)
  y += 6

  doc.setFontSize(10)
  for (const r of datos.respuestas || []) {
    const [bg, texto] = colorPill(r.respuesta)
    const anchoPill = doc.getTextWidth(r.respuesta) + 8
    const lineasPregunta = doc.splitTextToSize(r.pregunta, ANCHO_UTIL - anchoPill - 8)
    const altoFila = Math.max(lineasPregunta.length * 5, 7)
    y = saltoDePaginaSiHaceFalta(doc, y, altoFila)

    doc.setTextColor(30, 30, 30)
    doc.text(lineasPregunta, MARGEN, y + 4)
    doc.setFillColor(...bg)
    doc.roundedRect(MARGEN + ANCHO_UTIL - anchoPill, y - 1, anchoPill, 6.5, 2, 2, 'F')
    doc.setTextColor(...texto)
    doc.text(r.respuesta, MARGEN + ANCHO_UTIL - anchoPill / 2, y + 3.3, { align: 'center' })

    y += altoFila + 4
  }

  if (datos.ejecucion?.fotos_urls?.length > 0) {
    y = saltoDePaginaSiHaceFalta(doc, y, 10)
    y += 4
    doc.setTextColor(30, 30, 30)
    doc.setFontSize(11)
    doc.text('Fotos', MARGEN, y)
    y += 6
    doc.setFontSize(10)
    doc.setTextColor(24, 95, 165)
    datos.ejecucion.fotos_urls.forEach((url, i) => {
      y = saltoDePaginaSiHaceFalta(doc, y, 6)
      doc.textWithLink(`Foto ${i + 1}`, MARGEN, y, { url })
      y += 6
    })
  }

  if (datos.ejecucion?.ubicacion_url) {
    y = saltoDePaginaSiHaceFalta(doc, y, 8)
    y += 4
    doc.setTextColor(24, 95, 165)
    doc.setFontSize(10)
    doc.textWithLink('Ver ubicación', MARGEN, y, { url: datos.ejecucion.ubicacion_url })
    y += 6
  }

  const firma = datos.ejecucion?.firma_url ? await imagenABase64(datos.ejecucion.firma_url) : null
  if (firma) {
    y = saltoDePaginaSiHaceFalta(doc, y, 42)
    y += 6
    doc.setTextColor(100, 100, 100)
    doc.setFontSize(10)
    doc.text('Firma', MARGEN, y)
    doc.addImage(`data:image/${firma.formato.toLowerCase()};base64,${firma.base64}`, firma.formato, MARGEN, y + 4, 80, 30)
  }

  const totalPaginas = doc.internal.getNumberOfPages()
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p)
    doc.setFontSize(8)
    const parteGris = 'Powered by Andes'
    const parteNaranja = 'Check'
    const anchoGris = doc.getTextWidth(parteGris)
    const anchoNaranja = doc.getTextWidth(parteNaranja)
    const xInicio = centroX - (anchoGris + anchoNaranja) / 2
    doc.setTextColor(160, 160, 160)
    doc.text(parteGris, xInicio, 291)
    doc.setTextColor(234, 88, 12)
    doc.text(parteNaranja, xInicio + anchoGris, 291)
  }

  return doc.output('datauristring').split(',')[1]
}
