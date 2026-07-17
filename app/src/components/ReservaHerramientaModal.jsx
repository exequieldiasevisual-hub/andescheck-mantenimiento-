import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from './Modal'

export default function ReservaHerramientaModal({ idOt, onClose, onReservada }) {
  const [herramientas, setHerramientas] = useState([])
  const [idHerramienta, setIdHerramienta] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('herramientas_calculado').select('*').eq('activo', true).neq('estado_real', 'No_Apta').order('descripcion')
      .then(({ data }) => setHerramientas(data || []))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!idHerramienta || !desde || !hasta) { setError('Completá herramienta y fechas'); return }
    setSaving(true)
    setError('')

    const { data, error } = await supabase.rpc('reservar_herramienta', {
      p_id_ot: idOt,
      p_id_herramienta: idHerramienta,
      p_fecha_reserva: new Date(desde).toISOString(),
      p_fecha_devolucion: new Date(hasta).toISOString(),
    })

    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data.msg); return }
    onReservada()
  }

  return (
    <Modal titulo="Reservar herramienta" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Herramienta *</label>
          <select
            value={idHerramienta}
            onChange={e => setIdHerramienta(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm"
            required
          >
            <option value="">Seleccionar...</option>
            {herramientas.map(h => <option key={h.id} value={h.id}>{h.codigo} — {h.descripcion}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Desde *</label>
            <input type="datetime-local" value={desde} onChange={e => setDesde(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Hasta *</label>
            <input type="datetime-local" value={hasta} onChange={e => setHasta(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
          </div>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Reservando…' : 'Reservar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
