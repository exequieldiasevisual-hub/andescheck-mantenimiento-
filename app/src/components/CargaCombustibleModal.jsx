import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOnline, encolarRpc } from '../lib/offline'
import Modal from './Modal'
import BuscadorUnidad from './BuscadorUnidad'

const ORIGENES = ['Tanque propio', 'Estación externa']

export default function CargaCombustibleModal({ unidades, usuario, onClose, onSaved }) {
  const [form, setForm] = useState({
    id_unidad: '', fecha: new Date().toISOString().slice(0, 16), origen: 'Tanque propio', estacion: '',
    litros: '', precio_unitario: '', precio_total: '', km_actuales: '', hs_actuales: '',
  })
  const [comprobante, setComprobante] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const online = useOnline()

  const unidadSeleccionada = unidades.find(u => u.id === form.id_unidad)

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.id_unidad) { setError('La unidad es obligatoria'); return }
    if (!form.litros || Number(form.litros) <= 0) { setError('Los litros deben ser mayores a cero'); return }
    if (form.origen === 'Estación externa' && !form.estacion.trim()) { setError('Indicá el nombre de la estación'); return }
    setSaving(true)
    setError('')

    const argsBase = {
      p_id_unidad: form.id_unidad,
      p_fecha: new Date(form.fecha).toISOString(),
      p_origen: form.origen,
      p_estacion: form.estacion || null,
      p_litros: Number(form.litros),
      p_precio_unitario: form.precio_unitario === '' ? null : Number(form.precio_unitario),
      p_precio_total: form.precio_total === '' ? null : Number(form.precio_total),
      p_km_actuales: form.km_actuales === '' ? null : Number(form.km_actuales),
      p_hs_actuales: form.hs_actuales === '' ? null : Number(form.hs_actuales),
    }

    // Sin conexión no se puede subir el comprobante a Storage — se encola
    // solo el resto de la carga y se sincroniza sola al reconectar.
    if (!online) {
      encolarRpc('crear_carga_combustible', { ...argsBase, p_comprobante_url: null }, `Combustible: ${unidadSeleccionada?.descripcion ?? ''}`)
      setSaving(false)
      if (comprobante) { setError('El comprobante no se guardó — necesita conexión. La carga sí quedó guardada y se sincronizará sola.'); onSaved(); return }
      onSaved()
      return
    }

    let comprobante_url = null
    if (comprobante) {
      const path = `${usuario.empresa_id}/combustible/${Date.now()}-${comprobante.name}`
      const { error: upErr } = await supabase.storage.from('ot-fotos').upload(path, comprobante)
      if (upErr) { setSaving(false); setError(upErr.message); return }
      comprobante_url = supabase.storage.from('ot-fotos').getPublicUrl(path).data.publicUrl
    }

    const { data, error } = await supabase.rpc('crear_carga_combustible', { ...argsBase, p_comprobante_url: comprobante_url })

    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo guardar la carga'); return }
    onSaved()
  }

  return (
    <Modal titulo="Nueva carga de combustible" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Unidad *</label>
          <BuscadorUnidad unidades={unidades} value={form.id_unidad} onChange={id => setField('id_unidad', id)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Fecha *</label>
            <input type="datetime-local" value={form.fecha} onChange={e => setField('fecha', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Origen *</label>
            <select value={form.origen} onChange={e => setField('origen', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {ORIGENES.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>

        {form.origen === 'Estación externa' && (
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Estación *</label>
            <input value={form.estacion} onChange={e => setField('estacion', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Litros *</label>
            <input type="number" step="0.01" value={form.litros} onChange={e => setField('litros', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">$ por litro</label>
            <input type="number" step="0.01" value={form.precio_unitario} onChange={e => setField('precio_unitario', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">$ total</label>
            <input type="number" step="0.01" value={form.precio_total} onChange={e => setField('precio_total', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Km actuales {unidadSeleccionada?.km_actuales != null && <span className="text-gray-400">(última: {unidadSeleccionada.km_actuales})</span>}
            </label>
            <input type="number" value={form.km_actuales} onChange={e => setField('km_actuales', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Hs actuales {unidadSeleccionada?.hs_actuales != null && <span className="text-gray-400">(última: {unidadSeleccionada.hs_actuales})</span>}
            </label>
            <input type="number" value={form.hs_actuales} onChange={e => setField('hs_actuales', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <label className="flex items-center gap-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 w-fit">
          📷 {comprobante ? comprobante.name : 'Adjuntar comprobante (opcional)'}
          <input type="file" accept="image/*" capture="environment" onChange={e => setComprobante(e.target.files[0] ?? null)} className="hidden" />
        </label>

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
