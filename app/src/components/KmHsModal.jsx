import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from './Modal'

// Reemplaza los prompt() nativos para actualizar km/hs de una unidad,
// con validación de regresivos y última medición visible.
export default function KmHsModal({ unidad, onClose, onSaved }) {
  const [km, setKm] = useState('')
  const [hs, setHs] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (km === '' && hs === '') { setError('Cargá al menos un valor'); return }
    if (km !== '' && unidad.km_actuales != null && Number(km) < Number(unidad.km_actuales)) {
      setError(`El km ingresado (${km}) no puede ser menor al último registrado (${unidad.km_actuales})`); return
    }
    if (hs !== '' && unidad.hs_actuales != null && Number(hs) < Number(unidad.hs_actuales)) {
      setError(`Las hs ingresadas (${hs}) no pueden ser menores a las últimas registradas (${unidad.hs_actuales})`); return
    }
    setSaving(true)
    setError('')
    const payload = {}
    if (km !== '') payload.km_actuales = Number(km)
    if (hs !== '') payload.hs_actuales = Number(hs)
    const { error } = await supabase.from('unidades').update(payload).eq('id', unidad.id)
    setSaving(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  return (
    <Modal titulo={`Actualizar Km/Hs — ${unidad.descripcion}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Km actuales {unidad.km_actuales != null && <span className="text-gray-400">(última: {unidad.km_actuales})</span>}
            </label>
            <input type="number" value={km} onChange={e => setKm(e.target.value)} autoFocus
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Hs actuales {unidad.hs_actuales != null && <span className="text-gray-400">(última: {unidad.hs_actuales})</span>}
            </label>
            <input type="number" value={hs} onChange={e => setHs(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
