import { jsPDF } from 'jspdf'

function armarPdf(datos) {
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

  if (datos.ejecucion?.ubicacion_url) {
    if (y > 270) { doc.addPage(); y = 20 }
    doc.setTextColor(0, 0, 255)
    doc.textWithLink('Ver ubicación', 14, y + 6, { url: datos.ejecucion.ubicacion_url })
  }

  return doc.output('datauristring').split(',')[1]
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

  const pdfBase64 = armarPdf(datos)

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'AndesCheck <noreply@andescheck.com>',
      to: destinatarios,
      subject: `Checklist ${datos.plantilla?.nombre || ''} — ${datos.unidad?.patente_serie || datos.unidad?.descripcion || ''}`,
      html: `<p>Se completó el checklist "${datos.plantilla?.nombre || ''}" en la unidad ${[datos.unidad?.patente_serie, datos.unidad?.descripcion].filter(Boolean).join(' — ')}.</p><p>Adjunto el detalle en PDF.</p>`,
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
