import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from './Modal'
import BuscadorUnidad from './BuscadorUnidad'

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
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = reject
    img.src = url
  })
}

const normalizar = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export default function EscanearPatenteModal({ unidades, onClose, onAbrirFicha }) {
  const [estado, setEstado] = useState('inicial') // inicial | procesando | resultado
  const [patenteDetectada, setPatenteDetectada] = useState('')
  const [unidadEncontrada, setUnidadEncontrada] = useState(null)
  const [error, setError] = useState('')

  async function procesarFoto(file) {
    setEstado('procesando')
    setError('')
    try {
      const imagenBase64 = await redimensionarImagen(file)
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/leer-patente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ imagenBase64 }),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.msg || 'No se pudo leer la foto'); setEstado('inicial'); return }
      if (!data.patente) { setError('No se detectó una patente en la foto — probá con más luz o de más cerca'); setEstado('inicial'); return }
      setPatenteDetectada(data.patente)
      setUnidadEncontrada(unidades.find(u => normalizar(u.patente_serie) === data.patente) || null)
      setEstado('resultado')
    } catch {
      setError('No se pudo procesar la foto — revisá tu conexión')
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
