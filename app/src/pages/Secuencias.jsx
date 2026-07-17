import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import SelectConfig from '../components/SelectConfig'

function SecuenciaModal({ secuencia, empresaId, stock, onClose, onSaved }) {
  const [nombre, setNombre] = useState(secuencia?.nombre || '')
  const [tipoUnidad, setTipoUnidad] = useState(secuencia?.tipo_unidad || '')
  const [tareas, setTareas] = useState([])
  const [checklist, setChecklist] = useState(secuencia?.checklist_items || [])
  const [repuestos, setRepuestos] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!secuencia?.id) return
    supabase.from('secuencias_tareas').select('*').eq('id_secuencia', secuencia.id).order('orden')
      .then(({ data }) => setTareas((data || []).map(t => ({ descripcion: t.descripcion }))))
    supabase.from('secuencias_repuestos').select('*').eq('id_secuencia', secuencia.id)
      .then(({ data }) => setRepuestos((data || []).map(r => ({ id_repuesto: r.id_repuesto, cantidad: r.cantidad }))))
  }, [secuencia?.id])

  function agregarTarea() { setTareas(t => [...t, { descripcion: '' }]) }
  function actualizarTarea(idx, valor) { setTareas(t => t.map((x, i) => i === idx ? { descripcion: valor } : x)) }
  function quitarTarea(idx) { setTareas(t => t.filter((_, i) => i !== idx)) }

  function agregarChecklistItem() { setChecklist(c => [...c, { id: Date.now(), texto: '', requerido: true }]) }
  function actualizarChecklistItem(idx, campo, valor) { setChecklist(c => c.map((x, i) => i === idx ? { ...x, [campo]: valor } : x)) }
  function quitarChecklistItem(idx) { setChecklist(c => c.filter((_, i) => i !== idx)) }

  function agregarRepuesto() { setRepuestos(r => [...r, { id_repuesto: '', cantidad: 1 }]) }
  function actualizarRepuesto(idx, campo, valor) { setRepuestos(r => r.map((x, i) => i === idx ? { ...x, [campo]: valor } : x)) }
  function quitarRepuesto(idx) { setRepuestos(r => r.filter((_, i) => i !== idx)) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true)
    setError('')

    const payload = { empresa_id: empresaId, nombre: nombre.trim(), tipo_unidad: tipoUnidad || null, checklist_items: checklist }
    const { data: sec, error: errSec } = secuencia?.id
      ? await supabase.from('secuencias').update(payload).eq('id', secuencia.id).select().single()
      : await supabase.from('secuencias').insert(payload).select().single()

    if (errSec) { setSaving(false); setError(errSec.message); return }

    // Reemplazo total de hijos — más simple que diffear, y el volumen es chico.
    await supabase.from('secuencias_tareas').delete().eq('id_secuencia', sec.id)
    const tareasValidas = tareas.filter(t => t.descripcion.trim())
    if (tareasValidas.length > 0) {
      const { error: errT } = await supabase.from('secuencias_tareas').insert(
        tareasValidas.map((t, i) => ({ id_secuencia: sec.id, orden: i + 1, descripcion: t.descripcion.trim() }))
      )
      if (errT) { setSaving(false); setError(errT.message); return }
    }

    await supabase.from('secuencias_repuestos').delete().eq('id_secuencia', sec.id)
    const repuestosValidos = repuestos.filter(r => r.id_repuesto && Number(r.cantidad) > 0)
    if (repuestosValidos.length > 0) {
      const { error: errR } = await supabase.from('secuencias_repuestos').insert(
        repuestosValidos.map(r => ({ id_secuencia: sec.id, id_repuesto: r.id_repuesto, cantidad: Number(r.cantidad) }))
      )
      if (errR) { setSaving(false); setError(errR.message); return }
    }

    setSaving(false)
    onSaved()
  }

  return (
    <Modal titulo={secuencia?.id ? 'Editar secuencia' : 'Nueva secuencia'} onClose={onClose} ancho="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Nombre *</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
          </div>
          <SelectConfig label="Tipo de unidad" seccion="tipos_unidad" value={tipoUnidad} onChange={setTipoUnidad} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Tareas</label>
            <button type="button" onClick={agregarTarea} className="text-xs text-blue-600 hover:underline">+ Agregar tarea</button>
          </div>
          <div className="space-y-2">
            {tareas.map((t, idx) => (
              <div key={idx} className="flex gap-2">
                <input value={t.descripcion} onChange={e => actualizarTarea(idx, e.target.value)}
                  placeholder="Descripción de la tarea"
                  className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm" />
                <button type="button" onClick={() => quitarTarea(idx)} className="text-red-500 text-xs">✕</button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Checklist de cierre</label>
            <button type="button" onClick={agregarChecklistItem} className="text-xs text-blue-600 hover:underline">+ Agregar ítem</button>
          </div>
          <div className="space-y-2">
            {checklist.map((item, idx) => (
              <div key={item.id ?? idx} className="flex items-center gap-2">
                <input value={item.texto} onChange={e => actualizarChecklistItem(idx, 'texto', e.target.value)}
                  placeholder="Texto del ítem"
                  className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm" />
                <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  <input type="checkbox" checked={!!item.requerido} onChange={e => actualizarChecklistItem(idx, 'requerido', e.target.checked)} />
                  Obligatorio
                </label>
                <button type="button" onClick={() => quitarChecklistItem(idx)} className="text-red-500 text-xs">✕</button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Repuestos requeridos</label>
            <button type="button" onClick={agregarRepuesto} className="text-xs text-blue-600 hover:underline">+ Agregar repuesto</button>
          </div>
          <div className="space-y-2">
            {repuestos.map((r, idx) => (
              <div key={idx} className="flex gap-2">
                <select value={r.id_repuesto} onChange={e => actualizarRepuesto(idx, 'id_repuesto', e.target.value)}
                  className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm">
                  <option value="">Seleccionar repuesto...</option>
                  {stock.map(s => <option key={s.id} value={s.id}>{s.codigo} — {s.descripcion}</option>)}
                </select>
                <input type="number" value={r.cantidad} onChange={e => actualizarRepuesto(idx, 'cantidad', e.target.value)}
                  className="w-20 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm" min="1" />
                <button type="button" onClick={() => quitarRepuesto(idx)} className="text-red-500 text-xs">✕</button>
              </div>
            ))}
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

export default function Secuencias({ usuario }) {
  const [items, setItems] = useState([])
  const [stock, setStock] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [secuenciaEditar, setSecuenciaEditar] = useState(null)

  const puedeEscribir = ['administrador', 'supervisor'].includes(usuario?.rol)

  async function cargar() {
    setLoading(true)
    const [{ data: itemsData }, { data: stockData }] = await Promise.all([
      supabase.from('secuencias').select('*').eq('activo', true).order('nombre'),
      supabase.from('stock').select('id, codigo, descripcion').eq('activo', true).order('codigo'),
    ])
    setItems(itemsData || [])
    setStock(stockData || [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-base font-medium text-gray-900 dark:text-gray-100">Secuencias</h1>
        {puedeEscribir && (
          <button onClick={() => { setSecuenciaEditar(null); setModalAbierto(true) }}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            + Nueva secuencia
          </button>
        )}
      </div>

      <div className="p-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">Cargando…</div>
          ) : items.length === 0 ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">No hay secuencias cargadas todavía</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-400 dark:text-gray-500 font-medium">
                  <th className="px-5 py-3 text-left">Nombre</th>
                  <th className="px-5 py-3 text-left">Tipo de unidad</th>
                  <th className="px-5 py-3 text-left">Ítems checklist</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map(s => (
                  <tr key={s.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-5 py-3 text-gray-900 dark:text-gray-100 font-medium">{s.nombre}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{s.tipo_unidad || '—'}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{(s.checklist_items || []).length}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {puedeEscribir && (
                        <button onClick={() => { setSecuenciaEditar(s); setModalAbierto(true) }} className="text-blue-600 hover:underline text-xs">Editar</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modalAbierto && (
        <SecuenciaModal
          secuencia={secuenciaEditar}
          empresaId={usuario.empresa_id}
          stock={stock}
          onClose={() => setModalAbierto(false)}
          onSaved={() => { setModalAbierto(false); cargar() }}
        />
      )}
    </div>
  )
}
