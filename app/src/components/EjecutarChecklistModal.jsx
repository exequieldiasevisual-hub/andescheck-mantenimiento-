import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOnline, encolarRpc } from '../lib/offline'
import Modal from './Modal'
import BuscadorUnidad from './BuscadorUnidad'

function capturarUbicacion() {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve(`https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`),
      () => resolve(null),
      { timeout: 5000 }
    )
  })
}

export default function EjecutarChecklistModal({ unidades, plantillas, itemsPorPlantilla, onClose, onSaved }) {
  const [idUnidad, setIdUnidad] = useState('')
  const [idPlantilla, setIdPlantilla] = useState('')
  const [respuestas, setRespuestas] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const online = useOnline()

  const unidadSeleccionada = unidades.find(u => u.id === idUnidad)
  const plantillasDisponibles = plantillas.filter(p => !p.tipo_unidad || !unidadSeleccionada || p.tipo_unidad === unidadSeleccionada.tipo)
  const items = itemsPorPlantilla[idPlantilla] || []

  function elegirPlantilla(id) { setIdPlantilla(id); setRespuestas({}) }
  function setRespuesta(idItem, valor) { setRespuestas(r => ({ ...r, [idItem]: valor })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!idUnidad) { setError('La unidad es obligatoria'); return }
    if (!idPlantilla) { setError('Elegí una plantilla'); return }
    const faltantes = items.filter(i => !respuestas[i.id]?.trim())
    if (faltantes.length > 0) { setError('Faltan responder ' + faltantes.length + ' ítem(s)'); return }

    setSaving(true)
    setError('')

    const ubicacion_url = await capturarUbicacion()
    const args = {
      p_id_plantilla: idPlantilla,
      p_id_unidad: idUnidad,
      p_respuestas: items.map(i => ({ id_item: i.id, respuesta: respuestas[i.id] })),
      p_ubicacion_url: ubicacion_url,
    }

    if (!online) {
      encolarRpc('ejecutar_checklist', args, `Checklist: ${unidadSeleccionada?.descripcion ?? ''}`)
      setSaving(false)
      onSaved(null)
      return
    }

    const { data, error } = await supabase.rpc('ejecutar_checklist', args)

    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo guardar el checklist'); return }
    onSaved(data.novedades_generadas)
  }

  return (
    <Modal titulo="Realizar checklist" onClose={onClose} ancho="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Unidad *</label>
          <BuscadorUnidad unidades={unidades} value={idUnidad} onChange={setIdUnidad} />
        </div>

        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Plantilla *</label>
          <select value={idPlantilla} onChange={e => elegirPlantilla(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
            <option value="">Seleccionar plantilla...</option>
            {plantillasDisponibles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>

        {items.length > 0 && (
          <div className="space-y-3 border-t border-gray-100 dark:border-gray-800 pt-3">
            {items.map(item => (
              <div key={item.id}>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">{item.pregunta}</p>
                {item.tipo_respuesta === 'texto' ? (
                  <textarea value={respuestas[item.id] || ''} onChange={e => setRespuesta(item.id, e.target.value)}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" rows={2} />
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    {(item.tipo_respuesta === 'si_no' ? ['Sí', 'No'] : ['Bien', 'Regular', 'Mal']).map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setRespuesta(item.id, v)}
                        className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                          respuestas[item.id] === v
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar checklist'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
