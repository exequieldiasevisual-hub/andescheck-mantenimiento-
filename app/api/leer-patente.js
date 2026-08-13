// Función serverless de Vercel (no es Edge Function de Supabase — corre acá,
// en el mismo Vercel donde vive la app, evitando el lío de CORS/verify_jwt
// que ya tuvimos con Supabase).
//
// Recibe una foto (base64), la manda a Google Cloud Vision para leer el
// texto, y busca dentro de ese texto un patrón de patente argentina (formato
// viejo AAA123 o Mercosur AA123AA). Requiere estar logueado en la app —
// valida el token de Supabase antes de gastar la llamada a Vision.
//
// Variables de entorno necesarias en Vercel:
//   GOOGLE_VISION_API_KEY   (nueva, ver instrucciones)
//   VITE_SUPABASE_URL       (ya existe, se reutiliza)
//   VITE_SUPABASE_ANON_KEY  (ya existe, se reutiliza)

const PATRON_PATENTE = /([A-Z]{2}\d{3}[A-Z]{2}|[A-Z]{3}\d{3})/

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, msg: 'Método no permitido' })
    return
  }

  const auth = req.headers.authorization
  if (!auth) {
    res.status(401).json({ ok: false, msg: 'Sin autenticación' })
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const verifyRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: supabaseAnonKey },
  })
  if (!verifyRes.ok) {
    res.status(401).json({ ok: false, msg: 'Sesión inválida' })
    return
  }

  const { imagenBase64 } = req.body || {}
  if (!imagenBase64) {
    res.status(400).json({ ok: false, msg: 'Falta la imagen' })
    return
  }

  const visionKey = process.env.GOOGLE_VISION_API_KEY
  if (!visionKey) {
    res.status(500).json({ ok: false, msg: 'El reconocimiento de patentes no está configurado todavía' })
    return
  }

  const contenido = imagenBase64.includes(',') ? imagenBase64.split(',')[1] : imagenBase64

  const visionRes = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${visionKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{ image: { content: contenido }, features: [{ type: 'TEXT_DETECTION' }] }],
    }),
  })

  if (!visionRes.ok) {
    res.status(502).json({ ok: false, msg: 'No se pudo leer la foto — probá de nuevo' })
    return
  }

  const visionData = await visionRes.json()
  const respuesta = visionData.responses?.[0]
  if (respuesta?.error) {
    res.status(502).json({ ok: false, msg: respuesta.error.message || 'No se pudo leer la foto' })
    return
  }

  const texto = respuesta?.fullTextAnnotation?.text || respuesta?.textAnnotations?.[0]?.description || ''
  const textoPlano = texto.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const match = textoPlano.match(PATRON_PATENTE)

  res.status(200).json({ ok: true, patente: match ? match[1] : null, textoDetectado: texto })
}
