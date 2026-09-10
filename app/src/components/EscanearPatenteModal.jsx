import { useState, useRef, useEffect } from 'react'
import Modal from './Modal'
import BuscadorUnidad from './BuscadorUnidad'

const PATRON_PATENTE = /([A-Z]{2}\d{3}[A-Z]{2}|[A-Z]{3}\d{3})/
const ANCHO_RECORTE_OBJETIVO = 640

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

function cargarImagen(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => resolve({ img, url })
    img.onerror = reject
    img.src = url
  })
}

// Recorta la zona de patente elegida y la agranda a un ancho fijo — el
// resto de la foto (auto, fondo) sobra y solo le resta resolución real a
// los caracteres que el OCR tiene que leer.
function recortarYPreparar(img, rectNatural) {
  const escala = ANCHO_RECORTE_OBJETIVO / rectNatural.width
  const canvas = document.createElement('canvas')
  canvas.width = ANCHO_RECORTE_OBJETIVO
  canvas.height = Math.max(1, rectNatural.height * escala)
  canvas.getContext('2d').drawImage(
    img,
    rectNatural.x, rectNatural.y, rectNatural.width, rectNatural.height,
    0, 0, canvas.width, canvas.height
  )
  preprocesarParaOcr(canvas)
  return canvas.toDataURL('image/jpeg', 0.9)
}

const normalizar = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

// OCR local con Tesseract.js (gratis, corre en el navegador). Google Cloud
// Vision (más preciso, pago) queda documentado en GOOGLE_VISION_NOTAS.md y
// en app/api/leer-patente.js para reactivar cuando se resuelva la facturación.
async function leerPatenteLocal(imagenBase64) {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng')
  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    tessedit_pageseg_mode: '6', // bloque uniforme de texto — mejor para una patente que el modo "página completa"
  })
  const { data } = await worker.recognize(imagenBase64)
  await worker.terminate()
  const textoPlano = normalizar(data.text)
  const match = textoPlano.match(PATRON_PATENTE)
  return { patente: match ? match[1] : null, textoDetectado: data.text }
}

export default function EscanearPatenteModal({ unidades, onClose, onAbrirFicha }) {
  const [estado, setEstado] = useState('inicial') // inicial | recortando | procesando | resultado
  const [foto, setFoto] = useState(null) // { img, url }
  const [seleccion, setSeleccion] = useState(null) // { x, y, width, height } en px de pantalla, relativo a la imagen
  const [patenteDetectada, setPatenteDetectada] = useState('')
  const [unidadEncontrada, setUnidadEncontrada] = useState(null)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const imgRef = useRef(null)
  const arrastreRef = useRef(null)

  useEffect(() => {
    if (estado === 'inicial') inputRef.current?.click()
  }, [estado])

  async function onFotoElegida(file) {
    setError('')
    try {
      const cargada = await cargarImagen(file)
      setFoto(cargada)
      setSeleccion(null)
      setEstado('recortando')
    } catch {
      setError('No se pudo abrir la foto — probá de nuevo')
    }
  }

  function posicionRelativa(e) {
    const rect = imgRef.current.getBoundingClientRect()
    const punto = e.touches?.[0] ?? e
    return {
      x: Math.min(Math.max(punto.clientX - rect.left, 0), rect.width),
      y: Math.min(Math.max(punto.clientY - rect.top, 0), rect.height),
    }
  }

  function iniciarArrastre(e) {
    e.preventDefault()
    const { x, y } = posicionRelativa(e)
    arrastreRef.current = { startX: x, startY: y }
    setSeleccion({ x, y, width: 0, height: 0 })
  }

  function moverArrastre(e) {
    if (!arrastreRef.current) return
    e.preventDefault()
    const { x, y } = posicionRelativa(e)
    const { startX, startY } = arrastreRef.current
    setSeleccion({
      x: Math.min(startX, x), y: Math.min(startY, y),
      width: Math.abs(x - startX), height: Math.abs(y - startY),
    })
  }

  function terminarArrastre() {
    arrastreRef.current = null
  }

  async function confirmarRecorte() {
    if (!foto || !seleccion || seleccion.width < 10 || seleccion.height < 10) return
    setEstado('procesando')
    try {
      const escalaNatural = foto.img.naturalWidth / imgRef.current.clientWidth
      const rectNatural = {
        x: seleccion.x * escalaNatural,
        y: seleccion.y * escalaNatural,
        width: seleccion.width * escalaNatural,
        height: seleccion.height * escalaNatural,
      }
      const imagenBase64 = recortarYPreparar(foto.img, rectNatural)
      const { patente, textoDetectado } = await leerPatenteLocal(imagenBase64)
      if (!patente) {
        const preview = textoDetectado?.trim().slice(0, 80)
        setError(preview ? `No se detectó una patente. Texto leído: "${preview}"` : 'No se detectó texto en el recorte — probá marcando justo la patente')
        setEstado('recortando')
        return
      }
      setPatenteDetectada(patente)
      setUnidadEncontrada(unidades.find(u => normalizar(u.patente_serie) === patente) || null)
      setEstado('resultado')
    } catch (err) {
      console.error('Error leyendo patente:', err)
      setError(`No se pudo procesar la foto (${err?.message || 'error desconocido'})`)
      setEstado('recortando')
    }
  }

  function sacarOtraFoto() {
    if (foto) URL.revokeObjectURL(foto.url)
    setFoto(null)
    setSeleccion(null)
    setError('')
    setEstado('inicial')
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
              onChange={e => e.target.files[0] && onFotoElegida(e.target.files[0])}
            />
          </label>
        )}

        {estado === 'recortando' && foto && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">Marcá un recuadro justo sobre la patente, apretando y arrastrando:</p>
            <div
              className="relative touch-none select-none"
              onMouseDown={iniciarArrastre} onMouseMove={moverArrastre} onMouseUp={terminarArrastre} onMouseLeave={terminarArrastre}
              onTouchStart={iniciarArrastre} onTouchMove={moverArrastre} onTouchEnd={terminarArrastre}
            >
              <img ref={imgRef} src={foto.url} alt="Foto tomada" className="w-full rounded-lg" draggable={false} />
              {seleccion && (
                <div
                  className="absolute border-2 border-blue-500 bg-blue-500/20"
                  style={{ left: seleccion.x, top: seleccion.y, width: seleccion.width, height: seleccion.height }}
                />
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button" onClick={confirmarRecorte}
                disabled={!seleccion || seleccion.width < 10 || seleccion.height < 10}
                className="flex-1 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                Leer patente
              </button>
              <button type="button" onClick={sacarOtraFoto} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:underline">
                Sacar otra foto
              </button>
            </div>
          </div>
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
            <button type="button" onClick={sacarOtraFoto} className="text-xs text-blue-600 hover:underline">
              Sacar otra foto
            </button>
          </div>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Modal>
  )
}
