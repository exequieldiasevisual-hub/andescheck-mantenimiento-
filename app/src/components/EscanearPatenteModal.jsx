import { useState, useRef, useEffect } from 'react'
import Modal from './Modal'
import BuscadorUnidad from './BuscadorUnidad'

const PATRON_PATENTE = /([A-Z]{2}\d{3}[A-Z]{2}|[A-Z]{3}\d{3})/

// Pasa a escala de grises y, si el fondo predomina oscuro (patentes viejas:
// letras blancas en relieve sobre fondo negro), invierte los colores — el
// OCR está entrenado para texto oscuro sobre fondo claro y falla mucho si no.
function preprocesarParaOcr(canvas) {
  const ctx = canvas.getContext('2d')
  const imagenData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = imagenData.data
  let suma = 0
  for (let i = 0; i < d.length; i += 4) {
    const gris = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    d[i] = d[i + 1] = d[i + 2] = gris
    suma += gris
  }
  if (suma / (d.length / 4) < 128) {
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - d[i]
      d[i + 1] = 255 - d[i + 1]
      d[i + 2] = 255 - d[i + 2]
    }
  }
  ctx.putImageData(imagenData, 0, 0)
}

function redimensionarImagen(file, maxAncho = 1280) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const escala = Math.min(1, maxAncho / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = img.width * escala
      canvas.height = img.height * escala
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      preprocesarParaOcr(canvas)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.9))
    }
    img.onerror = reject
    img.src = url
  })
}

const normalizar = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

// OCR local con Tesseract.js (gratis, corre en el navegador). Google Cloud
// Vision (más preciso, pago) queda documentado en GOOGLE_VISION_NOTAS.md y
// en app/api/leer-patente.js para reactivar cuando se resuelva la facturación.
async function leerPatenteLocal(imagenBase64) {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng')
  await worker.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' })
  const { data } = await worker.recognize(imagenBase64)
  await worker.terminate()
  const textoPlano = normalizar(data.text)
  const match = textoPlano.match(PATRON_PATENTE)
  return { patente: match ? match[1] : null, textoDetectado: data.text }
}

export default function EscanearPatenteModal({ unidades, onClose, onAbrirFicha }) {
  const [estado, setEstado] = useState('inicial') // inicial | procesando | resultado
  const [patenteDetectada, setPatenteDetectada] = useState('')
  const [unidadEncontrada, setUnidadEncontrada] = useState(null)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (estado === 'inicial') inputRef.current?.click()
  }, [estado])

  async function procesarFoto(file) {
    setEstado('procesando')
    setError('')
    try {
      const imagenBase64 = await redimensionarImagen(file)
      const { patente, textoDetectado } = await leerPatenteLocal(imagenBase64)
      if (!patente) {
        const preview = textoDetectado?.trim().slice(0, 80)
        setError(preview ? `No se detectó una patente. Texto leído: "${preview}"` : 'No se detectó texto en la foto — probá con más luz o de más cerca')
        setEstado('inicial')
        return
      }
      setPatenteDetectada(patente)
      setUnidadEncontrada(unidades.find(u => normalizar(u.patente_serie) === patente) || null)
      setEstado('resultado')
    } catch (err) {
      console.error('Error leyendo patente:', err)
      setError(`No se pudo procesar la foto (${err?.message || 'error desconocido'})`)
      setEstado('inicial')
    }
  }

  return (
    <Modal titulo="Buscar por patente (cámara)" onClose={onClose}>
      <div className="space-y-4">
        {estado === 'inicial' && (
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl py-8 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400">
            <span className="text-2xl">📷</span>
            <span className="text-sm">Tocá para sacar la foto de la patente</span>
            <input
              ref={inputRef}
              type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => e.target.files[0] && procesarFoto(e.target.files[0])}
            />
          </label>
        )}

        {estado === 'procesando' && (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">Leyendo la patente…</p>
        )}

        {estado === 'resultado' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Patente detectada: <span className="font-semibold text-gray-900 dark:text-gray-100">{patenteDetectada}</span>
            </p>
            {unidadEncontrada ? (
              <button
                onClick={() => onAbrirFicha(unidadEncontrada.id)}
                className="w-full px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Abrir ficha — {unidadEncontrada.descripcion}
              </button>
            ) : (
              <>
                <p className="text-sm text-amber-600 dark:text-amber-400">No hay ninguna unidad cargada con esa patente. Buscá manualmente:</p>
                <BuscadorUnidad unidades={unidades} value={''} onChange={onAbrirFicha} />
              </>
            )}
            <button type="button" onClick={() => setEstado('inicial')} className="text-xs text-blue-600 hover:underline">
              Sacar otra foto
            </button>
          </div>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Modal>
  )
}
