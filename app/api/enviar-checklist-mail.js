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

async function armarPdf(datos) {
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

function armarHtmlMail(datos) {
  const respuestas = datos.respuestas || []
  const observaciones = respuestas.filter(r => ['Mal', 'No'].includes(r.respuesta)).length
  const total = respuestas.length
  const empresa = datos.empresa?.razon_social || 'AndesCheck'
  const unidadTexto = [datos.unidad?.patente_serie, datos.unidad?.descripcion].filter(Boolean).join(' — ')
  const anio = new Date().getFullYear()

  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#222;">
      <div style="text-align:center;padding:24px 20px 16px;">
        ${datos.empresa?.logo_url ? `<img src="${datos.empresa.logo_url}" alt="${empresa}" style="max-height:48px;max-width:200px;margin-bottom:10px;">` : ''}
        <p style="font-weight:bold;font-size:16px;margin:0;">${empresa}</p>
        <p style="font-size:13px;color:#666;margin:4px 0 12px;">${datos.plantilla?.nombre || ''} — ${unidadTexto}</p>
        <span style="display:inline-block;background:${observaciones > 0 ? '#fcebeb' : '#eaf3de'};color:${observaciones > 0 ? '#791f1f' : '#27500a'};font-size:12px;font-weight:bold;padding:5px 14px;border-radius:6px;">
          ${observaciones > 0 ? `${observaciones} observación(es)` : 'Sin observaciones'}
        </span>
      </div>

      <table style="width:100%;background:#f5f5f3;border-radius:8px;text-align:center;border-collapse:collapse;margin:0 0 16px;">
        <tr>
          <td style="padding:12px 4px;"><p style="font-size:18px;font-weight:bold;margin:0;color:#27500a;">${total - observaciones}</p><p style="font-size:11px;color:#666;margin:2px 0 0;">Bien</p></td>
          <td style="padding:12px 4px;"><p style="font-size:18px;font-weight:bold;margin:0;color:#791f1f;">${observaciones}</p><p style="font-size:11px;color:#666;margin:2px 0 0;">Observados</p></td>
          <td style="padding:12px 4px;"><p style="font-size:18px;font-weight:bold;margin:0;">${total}</p><p style="font-size:11px;color:#666;margin:2px 0 0;">Total ítems</p></td>
        </tr>
      </table>

      <table style="width:100%;font-size:13px;border-collapse:collapse;padding:0 20px;">
        <tr><td style="padding:4px 20px;color:#666;">Realizado por</td><td style="padding:4px 20px;text-align:right;">${datos.ejecucion?.usuario_nombre || '—'}</td></tr>
        <tr><td style="padding:4px 20px;color:#666;">Fecha</td><td style="padding:4px 20px;text-align:right;">${new Date(datos.ejecucion?.fecha).toLocaleString('es-AR')}</td></tr>
        ${datos.ejecucion?.ubicacion_url ? `<tr><td style="padding:4px 20px;color:#666;">Ubicación</td><td style="padding:4px 20px;text-align:right;"><a href="${datos.ejecucion.ubicacion_url}" style="color:#185fa5;">Ver en mapa</a></td></tr>` : ''}
      </table>

      <p style="font-size:13px;color:#666;padding:0 20px;margin:16px 0 0;">El detalle completo, con todas las respuestas, fotos y firma, está en el PDF adjunto.</p>

      <div style="padding:20px;">
        <p style="font-size:13px;margin:0 0 12px;">Cordialmente,</p>
        <p style="font-size:13px;margin:0;">Equipo de AndesCheck<br><a href="https://andescheck-web.vercel.app/" style="color:#185fa5;">https://andescheck-web.vercel.app</a></p>
      </div>

      <div style="background:#f5f5f3;text-align:center;padding:14px 20px;">
        <p style="font-size:11px;color:#999;margin:0;">Copyright ${anio} AndesCheck. Todos los derechos reservados.</p>
      </div>
    </div>
  `
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, msg: 'Método no permitido' }); return }
  const auth = req.headers.authorization
  if (!auth) { res.status(401).json({ ok: false, msg: 'Sin autenticación' }); return }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const { id_ejecucion } = req.body || {}
  if (!id_ejecucion) { res.status(400).json({ ok: false, msg: 'Falta id_ejecucion' }); return }

  const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/get_checklist_para_pdf`, {
    method: 'POST',
    headers: { Authorization: auth, apikey: supabaseAnonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_id_ejecucion: id_ejecucion }),
  })
  const datos = await rpcRes.json().catch(() => null)
  if (!rpcRes.ok || !datos?.ok) { res.status(200).json({ ok: false, msg: datos?.msg || 'No se pudo obtener el checklist' }); return }

  const destinatarios = datos.destinatarios || []
  if (destinatarios.length === 0) { res.status(200).json({ ok: false, msg: 'No hay destinatarios configurados' }); return }

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) { res.status(200).json({ ok: false, msg: 'Falta configurar RESEND_API_KEY en Vercel' }); return }

  const pdfBase64 = await armarPdf(datos)
  const html = armarHtmlMail(datos)

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'AndesCheck <noreply@andescheck.com>',
      to: destinatarios,
      subject: `Checklist ${datos.plantilla?.nombre || ''} — ${datos.unidad?.patente_serie || datos.unidad?.descripcion || ''}`,
      html,
      attachments: [{ filename: 'checklist.pdf', content: pdfBase64 }],
    }),
  })
  const resendData = await resendRes.json().catch(() => null)
  if (!resendRes.ok) {
    console.error('Resend error (checklist mail):', resendRes.status, JSON.stringify(resendData))
    res.status(200).json({ ok: false, msg: resendData?.message || `No se pudo enviar el mail (HTTP ${resendRes.status})` })
    return
  }

  res.status(200).json({ ok: true })
}
