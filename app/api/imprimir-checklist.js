import { armarPdf } from './_lib/checklistPdf.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ ok: false, msg: 'Método no permitido' }); return }
  const auth = req.headers.authorization
  if (!auth) { res.status(401).json({ ok: false, msg: 'Sin autenticación' }); return }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const { id_ejecucion } = req.query || {}
  if (!id_ejecucion) { res.status(400).json({ ok: false, msg: 'Falta id_ejecucion' }); return }

  const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/get_checklist_para_pdf`, {
    method: 'POST',
    headers: { Authorization: auth, apikey: supabaseAnonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_id_ejecucion: id_ejecucion }),
  })
  const datos = await rpcRes.json().catch(() => null)
  if (!rpcRes.ok || !datos?.ok) { res.status(200).json({ ok: false, msg: datos?.msg || 'No se pudo obtener el checklist' }); return }

  const pdfBase64 = await armarPdf(datos)

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', 'inline; filename="checklist.pdf"')
  res.status(200).send(Buffer.from(pdfBase64, 'base64'))
}
