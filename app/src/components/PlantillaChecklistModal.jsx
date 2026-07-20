import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from './Modal'
import SelectConfig from './SelectConfig'

const TIPOS_RESPUESTA = [
  { value: 'si_no', label: 'Sí / No' },
  { value: 'estado', label: 'Bien / Regular / Mal' },
  { value: 'texto', label: 'Texto libre' },
]

const VALORES_POR_TIPO = {
  si_no: ['Sí', 'No'],
  estado: ['Bien', 'Regular', 'Mal'],
}

export default function PlantillaChecklistModal({ plantilla, empresaId, onClose, onSaved }) {
  const [nombre, setNombre] = useState(plantilla?.nombre || '')
  const [descripcion, setDescripcion] = useState(plantilla?.descripcion || '')
  const [tipoUnidad, setTipoUnidad] = useState(plantilla?.tipo_unidad || '')
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!plantilla?.id) return
    supabase.from('checklist_items').select('*').eq('id_plantilla', plantilla.id).order('orden')
      .then(({ data }) => setItems((data || []).map(i => ({
        pregunta: i.pregunta, tipo_respuesta: i.tipo_respuesta, dispara_novedad: i.dispara_novedad,
        valor_disparador: i.valor_disparador || '', novedad_tipo: i.novedad_tipo || '', novedad_descripcion: i.novedad_descripcion || '',
      }))))
  }, [plantilla?.id])

  function agregarItem() {
    setItems(i => [...i, { pregunta: '', tipo_respuesta: 'si_no', dispara_novedad: false, valor_disparador: '', novedad_tipo: '', novedad_descripcion: '' }])
  }
  function actualizarItem(idx, campo, valor) {
    setItems(i => i.map((x, j) => {
      if (j !== idx) return x
      const actualizado = { ...x, [campo]: valor }
      if (campo === 'tipo_respuesta') { actualizado.dispara_novedad = false; actualizado.valor_disparador = '' }
      return actualizado
    }))
  }
  function quitarItem(idx) { setItems(i => i.filter((_, j) => j !== idx)) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
    const itemsValidos = items.filter(i => i.pregunta.trim())
    if (itemsValidos.length === 0) { setError('Agregá al menos un ítem'); return }
    setSaving(true)
    setError('')

    const payload = { empresa_id: empresaId, nombre: nombre.trim(), descripcion: descripcion.trim() || null, tipo_unidad: tipoUnidad || null }
    const { data: plant, error: errPlant } = plantilla?.id
      ? await supabase.from('checklist_plantillas').update(payload).eq('id', plantilla.id).select().single()
      : await supabase.from('checklist_plantillas').insert(payload).select().single()

    if (errPlant) { setSaving(false); setError(errPlant.message); return }

    // Reemplazo total de ítems — más simple que diffear.
    await supabase.from('checklist_items').delete().eq('id_plantilla', plant.id)
    const { error: errItems } = await supabase.from('checklist_items').insert(
      itemsValidos.map((i, idx) => ({
        id_plantilla: plant.id, orden: idx + 1, pregunta: i.pregunta.trim(), tipo_respuesta: i.tipo_respuesta,
        dispara_novedad: i.dispara_novedad, valor_disparador: i.dispara_novedad ? i.valor_disparador || null : null,
        novedad_tipo: i.dispara_novedad ? i.novedad_tipo || null : null,
        novedad_descripcion: i.dispara_novedad ? (i.novedad_descripcion.trim() || null) : null,
      }))
    )
    if (errItems) { setSaving(false); setError(errItems.message); return }

    setSaving(false)
    onSaved()
  }

  return (
    <Modal titulo={plantilla?.id ? 'Editar plantilla de checklist' : 'Nueva plantilla de checklist'} onClose={onClose} ancho="max-w-3xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Nombre *</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
          </div>
          <SelectConfig label="Tipo de unidad (opcional)" seccion="tipos_unidad" value={tipoUnidad} onChange={setTipoUnidad} />
        </div>

        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Descripción</label>
          <input value={descripcion} onChange={e => setDescripcion(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Ítems</label>
            <button type="button" onClick={agregarItem} className="text-xs text-blue-600 hover:underline">+ Agregar ítem</button>
          </div>
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
                <div className="flex gap-2">
                  <input value={item.pregunta} onChange={e => actualizarItem(idx, 'pregunta', e.target.value)}
                    placeholder="Pregunta (ej: ¿Neumáticos en buen estado?)"
                    className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm" />
                  <select value={item.tipo_respuesta} onChange={e => actualizarItem(idx, 'tipo_respuesta', e.target.value)}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm">
                    {TIPOS_RESPUESTA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <button type="button" onClick={() => quitarItem(idx)} className="text-red-500 text-xs shrink-0">✕</button>
                </div>

                {item.tipo_respuesta !== 'texto' && (
                  <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                    <input type="checkbox" checked={item.dispara_novedad} onChange={e => actualizarItem(idx, 'dispara_novedad', e.target.checked)} />
                    Generar Novedad automática si la respuesta es...
                  </label>
                )}

                {item.dispara_novedad && (
                  <div className="grid grid-cols-3 gap-2 pl-5">
                    <select value={item.valor_disparador} onChange={e => actualizarItem(idx, 'valor_disparador', e.target.value)}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs">
                      <option value="">Respuesta que dispara...</option>
                      {(VALORES_POR_TIPO[item.tipo_respuesta] || []).map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <SelectConfig seccion="tipos_novedad" value={item.novedad_tipo} onChange={v => actualizarItem(idx, 'novedad_tipo', v)} dosColumnas={false} />
                    <input value={item.novedad_descripcion} onChange={e => actualizarItem(idx, 'novedad_descripcion', e.target.value)}
                      placeholder="Descripción de la novedad (opcional)"
                      className="border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs" />
                  </div>
                )}
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
