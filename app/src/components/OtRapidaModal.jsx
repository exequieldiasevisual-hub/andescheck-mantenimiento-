import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from './Modal'
import BuscadorUnidad from './BuscadorUnidad'

function fechaMasDias(dias) {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d.toISOString().split('T')[0]
}

// Versión liviana de la "OT Rápida" original: en vez de cámara + OCR de
// patente (requiere Vision API, con costo por imagen), se identifica la
// unidad con el mismo buscador predictivo del resto de la app — mismo
// resultado (2 segundos) sin esa dependencia. La grabación de audio con
// transcripción sí se mantiene tal cual (Web Speech API, nativa y gratis).
export default function OtRapidaModal({ unidades, proveedores, onClose, onCreada }) {
  const [paso, setPaso] = useState(1)
  const [idUnidad, setIdUnidad] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [grabando, setGrabando] = useState(false)
  const [audioDisponible, setAudioDisponible] = useState(true)
  const [tipo, setTipo] = useState('Correctivo')
  const [prioridad, setPrioridad] = useState('Media')
  const [proveedor, setProveedor] = useState('')
  const [fechaEst, setFechaEst] = useState(fechaMasDias(7))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const recognitionRef = useRef(null)

  const unidad = unidades.find(u => u.id === idUnidad)

  useEffect(() => () => detenerAudio(), [])

  function iniciarAudio() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRec) { setAudioDisponible(false); return }
    if (grabando) { detenerAudio(); return }

    const recognition = new SpeechRec()
    recognition.lang = 'es-AR'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onstart = () => setGrabando(true)
    recognition.onresult = e => {
      let interim = ''
      let final = descripcion
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + ' '
        else interim += e.results[i][0].transcript
      }
      setDescripcion(final)
      if (interim) setDescripcion(final + interim)
    }
    recognition.onerror = () => { setAudioDisponible(false); setGrabando(false) }
    recognition.onend = () => setGrabando(false)

    recognitionRef.current = recognition
    recognition.start()
  }

  function detenerAudio() {
    try { recognitionRef.current?.stop() } catch { /* ya estaba detenido */ }
    recognitionRef.current = null
    setGrabando(false)
  }

  function irAPaso(p) {
    if (p > paso && paso === 1 && !idUnidad) { setError('Identificá la unidad antes de continuar'); return }
    detenerAudio()
    setError('')
    setPaso(p)
  }

  async function confirmar() {
    if (!descripcion.trim()) { setError('La descripción es obligatoria'); return }
    if (!fechaEst) { setError('La fecha estimada de cierre es obligatoria'); return }
    setSaving(true)
    setError('')

    const { data, error } = await supabase.rpc('crear_ot', {
      p_id_unidad: idUnidad,
      p_tipo: tipo,
      p_descripcion: descripcion.trim(),
      p_prioridad: prioridad,
      p_fecha_est_cierre: fechaEst || null,
      p_proveedor: proveedor || null,
    })

    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo crear la OT'); return }
    onCreada(data.id_ot)
  }

  return (
    <Modal titulo="⚡ OT Rápida" onClose={onClose}>
      <div className="flex items-center gap-2 mb-4 text-xs">
        {[1, 2, 3].map(p => (
          <div key={p} className={`flex-1 h-1.5 rounded-full ${p <= paso ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`} />
        ))}
      </div>

      {paso === 1 && (
        <div className="space-y-3">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Unidad *</label>
          <BuscadorUnidad unidades={unidades} value={idUnidad} onChange={setIdUnidad} placeholder="Buscar por descripción o patente…" />
          {unidad && (
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg p-3 text-sm">
              <p className="font-medium text-emerald-700 dark:text-emerald-300">✓ {unidad.descripcion}</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">{unidad.patente_serie}</p>
            </div>
          )}
        </div>
      )}

      {paso === 2 && (
        <div className="space-y-3">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Descripción del trabajo</label>
          {audioDisponible ? (
            <div className="text-center">
              <button
                type="button"
                onClick={iniciarAudio}
                className={`px-4 py-2 rounded-lg text-sm text-white ${grabando ? 'bg-red-600' : 'bg-blue-600'}`}
              >
                {grabando ? '⏹ Detener' : '🎙 Grabar'}
              </button>
              <p className="text-xs text-gray-400 mt-1">{grabando ? '🔴 Grabando… hablá despacio y claro' : 'Presioná el micrófono para grabar'}</p>
            </div>
          ) : (
            <p className="text-xs text-amber-600">Tu navegador no soporta grabación de voz — escribí abajo.</p>
          )}
          <textarea
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            rows={4}
            placeholder="La transcripción aparece acá — también podés escribir directo"
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      )}

      {paso === 3 && (
        <div className="space-y-3">
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-sm">
            <p className="font-medium text-gray-900 dark:text-gray-100">{unidad?.descripcion} — {unidad?.patente_serie}</p>
            <p className="text-gray-600 dark:text-gray-400 mt-1">{descripcion}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tipo</label>
              <select value={tipo} onChange={e => setTipo(e.target.value)} className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm">
                <option value="Correctivo">Correctivo</option>
                <option value="Preventivo">Preventivo</option>
                <option value="Predictivo">Predictivo</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Prioridad</label>
              <select value={prioridad} onChange={e => setPrioridad(e.target.value)} className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm">
                <option value="Baja">Baja</option>
                <option value="Media">Media</option>
                <option value="Alta">Alta</option>
              </select>
            </div>
          </div>
          {proveedores.length > 0 && (
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Proveedor</label>
              <select value={proveedor} onChange={e => setProveedor(e.target.value)} className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm">
                <option value="">Sin proveedor</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Fecha estimada de cierre *</label>
            <input type="date" value={fechaEst} onChange={e => setFechaEst(e.target.value)} className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400 mt-3">{error}</p>}

      <div className="flex justify-between gap-2 pt-4">
        <button type="button" onClick={() => (paso === 1 ? onClose() : irAPaso(paso - 1))} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
          {paso === 1 ? 'Cancelar' : '← Atrás'}
        </button>
        {paso < 3 ? (
          <button type="button" onClick={() => irAPaso(paso + 1)} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
            Siguiente →
          </button>
        ) : (
          <button type="button" onClick={confirmar} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Creando…' : '✓ Crear OT'}
          </button>
        )}
      </div>
    </Modal>
  )
}
