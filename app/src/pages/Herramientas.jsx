import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import MultiSelectFiltro from '../components/MultiSelectFiltro'

const VACIO = { codigo: '', descripcion: '', fecha_vencimiento_certificacion: '' }

function HistorialHerramientaModal({ herramienta, onClose }) {
  const [historial, setHistorial] = useState(null)

  useEffect(() => {
    supabase.from('herramientas_historial').select('*, usuarios (nombre)').eq('id_herramienta', herramienta.id).order('fecha', { ascending: false })
      .then(({ data }) => setHistorial(data || []))
  }, [herramienta.id])

  return (
    <Modal titulo={`Historial — ${herramienta.codigo}`} onClose={onClose}>
      {historial === null ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : historial.length === 0 ? (
        <p className="text-sm text-gray-400">Sin ediciones registradas todavía.</p>
      ) : (
        <ul className="space-y-2 max-h-96 overflow-y-auto">
          {historial.map(h => (
            <li key={h.id} className="text-sm border-t border-gray-100 dark:border-gray-800 pt-2 first:border-t-0 first:pt-0">
              <span className="text-xs text-gray-400">{new Date(h.fecha).toLocaleString()} ({h.usuarios?.nombre ?? '—'})</span>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Estado anterior: {h.estado_anterior ?? '—'}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Vencimiento cert. anterior: {h.fecha_vencimiento_certificacion_anterior ?? '—'}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

function HerramientaModal({ herramienta, empresaId, onClose, onSaved }) {
  const [form, setForm] = useState(herramienta || VACIO)
  const [archivo, setArchivo] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.codigo.trim() || !form.descripcion.trim()) { setError('Código y descripción son obligatorios'); return }
    setSaving(true)
    setError('')

    let doc_certificacion_url = form.doc_certificacion_url ?? null
    if (archivo) {
      const path = `${empresaId}/${form.codigo.trim()}-${Date.now()}.pdf`
      const { error: upErr } = await supabase.storage.from('certificados-herramientas').upload(path, archivo)
      if (upErr) { setSaving(false); setError(upErr.message); return }
      doc_certificacion_url = supabase.storage.from('certificados-herramientas').getPublicUrl(path).data.publicUrl
    }

    const payload = {
      empresa_id: empresaId,
      codigo: form.codigo.trim(),
      descripcion: form.descripcion.trim(),
      fecha_vencimiento_certificacion: form.fecha_vencimiento_certificacion || null,
      doc_certificacion_url,
    }

    const query = herramienta?.id
      ? supabase.from('herramientas').update(payload).eq('id', herramienta.id)
      : supabase.from('herramientas').insert(payload)

    const { error } = await query
    setSaving(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  return (
    <Modal titulo={herramienta?.id ? 'Editar herramienta' : 'Nueva herramienta'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Código *</label>
          <input value={form.codigo} onChange={e => setField('codigo', e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Descripción *</label>
          <input value={form.descripcion} onChange={e => setField('descripcion', e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Vencimiento de certificación</label>
          <input type="date" value={form.fecha_vencimiento_certificacion || ''} onChange={e => setField('fecha_vencimiento_certificacion', e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Certificado (PDF)</label>
          <input type="file" accept="application/pdf" onChange={e => setArchivo(e.target.files[0])}
            className="w-full text-sm" />
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

export default function Herramientas({ usuario }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [herramientaEditar, setHerramientaEditar] = useState(null)
  const [historialAbierto, setHistorialAbierto] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState([])

  const puedeEscribir = ['administrador', 'supervisor'].includes(usuario?.rol)

  async function cargar() {
    setLoading(true)
    const { data } = await supabase.from('herramientas_calculado').select('*').eq('activo', true).order('descripcion')
    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  const estados = [...new Set(items.map(h => h.estado_real).filter(Boolean))].sort()
  const q = busqueda.trim().toLowerCase()
  const filtrados = items
    .filter(h => !q || h.codigo?.toLowerCase().includes(q) || h.descripcion?.toLowerCase().includes(q))
    .filter(h => filtroEstado.length === 0 || filtroEstado.includes(h.estado_real))

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-base font-medium text-gray-900 dark:text-gray-100">Herramientas</h1>
        {puedeEscribir && (
          <button onClick={() => { setHerramientaEditar(null); setModalAbierto(true) }}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            + Nueva herramienta
          </button>
        )}
      </div>

      <div className="p-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex flex-wrap gap-2">
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por código o descripción…"
              className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
            <MultiSelectFiltro label="Estado" opciones={estados} seleccionados={filtroEstado} onChange={setFiltroEstado} />
          </div>
          {loading ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">Cargando…</div>
          ) : filtrados.length === 0 ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">{items.length === 0 ? 'No hay herramientas cargadas todavía' : 'Sin resultados para esos filtros'}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900">
                <tr className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-400 dark:text-gray-500 font-medium">
                  <th className="px-5 py-3 text-left">Código</th>
                  <th className="px-5 py-3 text-left">Descripción</th>
                  <th className="px-5 py-3 text-left">Estado</th>
                  <th className="px-5 py-3 text-left">Vencimiento cert.</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(h => (
                  <tr key={h.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-5 py-3 text-gray-900 dark:text-gray-100 font-medium">{h.codigo}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{h.descripcion}</td>
                    <td className="px-5 py-3">
                      <span className={h.estado_real === 'No_Apta' ? 'text-red-600' : 'text-gray-500 dark:text-gray-400'}>{h.estado_real}</span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{h.fecha_vencimiento_certificacion ?? '—'}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {h.doc_certificacion_url && (
                        <a href={h.doc_certificacion_url} target="_blank" rel="noreferrer" className="text-gray-600 dark:text-gray-400 hover:underline text-xs mr-3">
                          Ver certificado
                        </a>
                      )}
                      <button onClick={() => setHistorialAbierto(h)} className="text-gray-600 dark:text-gray-400 hover:underline text-xs mr-3">
                        Historial
                      </button>
                      {puedeEscribir && (
                        <button onClick={() => { setHerramientaEditar(h); setModalAbierto(true) }} className="text-blue-600 hover:underline text-xs">Editar</button>
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
        <HerramientaModal
          herramienta={herramientaEditar}
          empresaId={usuario.empresa_id}
          onClose={() => setModalAbierto(false)}
          onSaved={() => { setModalAbierto(false); cargar() }}
        />
      )}

      {historialAbierto && (
        <HistorialHerramientaModal
          herramienta={historialAbierto}
          onClose={() => setHistorialAbierto(null)}
        />
      )}
    </div>
  )
}
