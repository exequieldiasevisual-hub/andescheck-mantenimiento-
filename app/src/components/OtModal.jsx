import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from './Modal'
import BuscadorUnidad from './BuscadorUnidad'

const TIPOS_OT = ['Correctivo', 'Preventivo', 'Predictivo']

function SugerenciasReparacion({ texto }) {
  const [sugerencias, setSugerencias] = useState([])
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (texto.trim().length < 3) { setSugerencias([]); return }
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase.rpc('buscar_ot_similares', { p_texto: texto.trim() })
      setSugerencias(data || [])
    }, 500)
    return () => clearTimeout(debounceRef.current)
  }, [texto])

  if (sugerencias.length === 0) return null


  return (
    <div className="border border-blue-100 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 space-y-2">
      <p className="text-xs font-medium text-blue-700 dark:text-blue-300">Problemas similares encontrados</p>
      {sugerencias.map(s => (
        <div key={s.id_ot} className="text-xs text-gray-600 dark:text-gray-400 border-t border-blue-100 dark:border-blue-900 pt-2 first:border-t-0 first:pt-0">
          <p className="font-medium text-gray-800 dark:text-gray-200">{s.numero_ot} — {s.descripcion}</p>
          {s.ultima_observacion && <p>Resolución: {s.ultima_observacion}</p>}
          {s.repuesto_mas_usado && <p>Repuesto más usado: {s.repuesto_mas_usado}</p>}
        </div>
      ))}
    </div>
  )
}

// Formulario completo de OT — usado tanto para "+ Nueva OT" como para
// derivar una novedad a OT (con unidad/descripción/origen precargados).
export default function OtModal({ unidades, proveedores, unidadInicial, descripcionInicial, idNovedadOrigen, titulo, onClose, onCreada }) {
  const unidadPre = unidadInicial ? unidades.find(u => u.id === unidadInicial) : null
  const [form, setForm] = useState({
    id_unidad: unidadInicial || '', tipo: 'Correctivo', descripcion: descripcionInicial || '', observaciones: '', prioridad: 'Media', fecha_est_cierre: '',
    id_secuencia: '', proveedor: '',
    km_actuales: unidadPre?.km_actuales ?? '', hs_actuales: unidadPre?.hs_actuales ?? '',
  })
  const unidadSeleccionada = unidades.find(u => u.id === form.id_unidad)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function elegirUnidad(id) {
    const u = unidades.find(x => x.id === id)
    setForm(f => ({
      ...f, id_unidad: id,
      km_actuales: u?.km_actuales ?? '',
      hs_actuales: u?.hs_actuales ?? '',
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.id_unidad) { setError('La unidad es obligatoria'); return }
    if (!form.descripcion.trim()) { setError('La descripción es obligatoria'); return }
    if (!form.fecha_est_cierre) { setError('La fecha estimada de cierre es obligatoria'); return }
    if (unidadSeleccionada?.km_actuales != null && form.km_actuales === '') { setError('Debés registrar el kilometraje actual de la unidad'); return }
    if (unidadSeleccionada?.hs_actuales != null && form.hs_actuales === '') { setError('Debés registrar las horas actuales de la unidad'); return }
    setSaving(true)
    setError('')

    const { data, error } = idNovedadOrigen
      ? await supabase.rpc('derivar_novedad_a_ot', {
          p_id_novedad: idNovedadOrigen,
          p_tipo: form.tipo,
          p_descripcion: form.descripcion.trim(),
          p_prioridad: form.prioridad || null,
          p_fecha_est_cierre: form.fecha_est_cierre || null,
          p_id_secuencia: form.id_secuencia || null,
          p_proveedor: form.proveedor || null,
          p_km_actuales: form.km_actuales === '' ? null : Number(form.km_actuales),
          p_hs_actuales: form.hs_actuales === '' ? null : Number(form.hs_actuales),
        })
      : await supabase.rpc('crear_ot', {
          p_id_unidad: form.id_unidad,
          p_tipo: form.tipo,
          p_descripcion: form.descripcion.trim(),
          p_prioridad: form.prioridad || null,
          p_fecha_est_cierre: form.fecha_est_cierre || null,
          p_id_secuencia: form.id_secuencia || null,
          p_proveedor: form.proveedor || null,
          p_km_actuales: form.km_actuales === '' ? null : Number(form.km_actuales),
          p_hs_actuales: form.hs_actuales === '' ? null : Number(form.hs_actuales),
          p_observaciones: form.observaciones.trim() || null,
        })

    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo crear la OT'); return }
    onCreada(data.id_ot)
  }

  return (
    <Modal titulo={titulo || 'Nueva orden de trabajo'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Unidad *</label>
          {idNovedadOrigen ? (
            <p className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400">
              {unidadPre?.patente_serie || 's/patente'} — {unidadPre?.descripcion} <span className="text-xs text-gray-400">(fija, viene de la novedad)</span>
            </p>
          ) : (
            <BuscadorUnidad unidades={unidades} value={form.id_unidad} onChange={elegirUnidad} />
          )}
        </div>

        {form.id_unidad && (unidadSeleccionada?.km_actuales != null || unidadSeleccionada?.hs_actuales != null) && (
          <div className="grid grid-cols-2 gap-3">
            {unidadSeleccionada?.km_actuales != null && (
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Km actuales * <span className="text-gray-400">(última medición: {unidadSeleccionada.km_actuales})</span>
                </label>
                <input type="number" value={form.km_actuales} onChange={e => setField('km_actuales', e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
            )}
            {unidadSeleccionada?.hs_actuales != null && (
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Hs actuales * <span className="text-gray-400">(última medición: {unidadSeleccionada.hs_actuales})</span>
                </label>
                <input type="number" value={form.hs_actuales} onChange={e => setField('hs_actuales', e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tipo</label>
            <select value={form.tipo} onChange={e => setField('tipo', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {TIPOS_OT.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Prioridad</label>
            <select value={form.prioridad} onChange={e => setField('prioridad', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="Baja">Baja</option>
              <option value="Media">Media</option>
              <option value="Alta">Alta</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Descripción *</label>
          <textarea
            value={form.descripcion}
            onChange={e => setField('descripcion', e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
            required
          />
        </div>

        <SugerenciasReparacion texto={form.descripcion} />

        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Observaciones</label>
          <textarea
            value={form.observaciones}
            onChange={e => setField('observaciones', e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={2}
          />
        </div>

        {proveedores.length > 0 && (
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Proveedor</label>
            <select value={form.proveedor} onChange={e => setField('proveedor', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Sin proveedor</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Fecha estimada de cierre *</label>
          <input
            type="date"
            value={form.fecha_est_cierre}
            onChange={e => setField('fecha_est_cierre', e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Creando…' : 'Crear OT'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
