// Función serverless de Vercel — misma idea que leer-patente.js (Google
// Cloud Vision, actualmente sin usar por un lío de facturación, ver
// GOOGLE_VISION_NOTAS.md) pero contra la API de Gemini, que no depende de
// esa cuenta de facturación de Cloud rota (usa una API key de Google AI
// Studio con cuota gratis aparte).
//
// Recibe una foto recortada (base64) y le pide a Gemini que lea la patente
// directamente — no hace falta el preprocesado en escala de grises /
// invertido que sí necesita el OCR local (Tesseract), un modelo de visión
// entiende la foto a color tal cual.
//
// Variable de entorno necesaria en Vercel:
//   GEMINI_API_KEY   (Google AI Studio → https://aistudio.google.com/apikey)

const PATRON_PATENTE = /([A-Z]{2}\d{3}[A-Z]{2}|[A-Z]{3}\d{3})/
const MODELO = 'gemini-2.0-flash'

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

  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) {
    res.status(500).json({ ok: false, msg: 'El reconocimiento de patentes con Gemini no está configurado todavía' })
    return
  }

  const contenido = imagenBase64.includes(',') ? imagenBase64.split(',')[1] : imagenBase64

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: 'Esta es una foto recortada de la patente de un vehículo argentino (formato viejo tipo AAA123 o Mercosur tipo AA123AA). Respondé ÚNICAMENTE con los caracteres de la patente, en mayúsculas, sin espacios ni guiones ni ningún otro texto. Si no se puede leer ninguna patente en la imagen, respondé exactamente: NONE',
            },
            { inline_data: { mime_type: 'image/jpeg', data: contenido } },
          ],
        }],
        generationConfig: { temperature: 0 },
      }),
    }
  )

  const geminiData = await geminiRes.json().catch(() => null)

  if (!geminiRes.ok) {
    const detalle = geminiData?.error?.message || `HTTP ${geminiRes.status}`
    console.error('Gemini API error:', geminiRes.status, JSON.stringify(geminiData))
    res.status(502).json({ ok: false, msg: `No se pudo leer la foto (${detalle})` })
    return
  }

  const texto = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const textoPlano = texto.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const match = textoPlano.match(PATRON_PATENTE)

  res.status(200).json({ ok: true, patente: match ? match[1] : null, textoDetectado: texto })
}
