import { jsPDF } from 'jspdf'

async function imagenABase64(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    return buffer.toString('base64')
  } catch {
    return null
  }
}

async function armarPdf(datos) {
  const doc = new jsPDF()
  let y = 20

  doc.setFontSize(16)
  doc.text(datos.empresa?.razon_social || 'AndesCheck', 14, y)
  y += 10
  doc.setFontSize(12)
  doc.text(`Checklist: ${datos.plantilla?.nombre || ''}`, 14, y)
  y += 8
  doc.setFontSize(10)
  doc.text(`Unidad: ${[datos.unidad?.patente_serie, datos.unidad?.descripcion].filter(Boolean).join(' — ')}`, 14, y)
  y += 6
  doc.text(`Fecha: ${new Date(datos.ejecucion?.fecha).toLocaleString('es-AR')}`, 14, y)
  y += 6
  doc.text(`Realizado por: ${datos.ejecucion?.usuario_nombre || '—'}`, 14, y)
  y += 10

  doc.setFontSize(11)
  doc.text('Respuestas', 14, y)
  y += 7
  doc.setFontSize(10)

  for (const r of datos.respuestas || []) {
    const lineas = doc.splitTextToSize(`${r.pregunta}: ${r.respuesta}`, 180)
    if (y + lineas.length * 5 > 280) { doc.addPage(); y = 20 }
    doc.text(lineas, 14, y)
    y += lineas.length * 5 + 2
  }

  if (datos.ejecucion?.fotos_urls?.length > 0) {
    if (y > 260) { doc.addPage(); y = 20 }
    doc.setTextColor(0, 0, 0)
    doc.text('Fotos:', 14, y)
    y += 6
    doc.setTextColor(0, 0, 255)
    datos.ejecucion.fotos_urls.forEach((url, i) => {
      if (y > 280) { doc.addPage(); y = 20 }
      doc.textWithLink(`Foto ${i + 1}`, 14, y, { url })
      y += 6
    })
  }

  if (datos.ejecucion?.ubicacion_url) {
    if (y > 270) { doc.addPage(); y = 20 }
    doc.setTextColor(0, 0, 255)
    doc.textWithLink('Ver ubicación', 14, y + 6, { url: datos.ejecucion.ubicacion_url })
    y += 12
  }

  const firmaBase64 = datos.ejecucion?.firma_url ? await imagenABase64(datos.ejecucion.firma_url) : null
  if (firmaBase64) {
    if (y > 240) { doc.addPage(); y = 20 }
    doc.setTextColor(0, 0, 0)
    doc.text('Firma:', 14, y + 10)
    doc.addImage(`data:image/png;base64,${firmaBase64}`, 'PNG', 14, y + 14, 80, 30)
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
        <p style="font-size:13px;margin:0;">Equipo de AndesCheck<br><a href="https://andescheck.com" style="color:#185fa5;">https://andescheck.com</a></p>
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
