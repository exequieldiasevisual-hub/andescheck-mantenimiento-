import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import MotivoModal from '../components/MotivoModal'
import BuscadorUnidad from '../components/BuscadorUnidad'

const VACIO = { tipo: '', marca: '', modelo: '', numero_serie: '', lectura_actual: '' }

function ComponenteModal({ componente, onClose, onSaved }) {
  const [form, setForm] = useState(componente || VACIO)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.tipo.trim()) { setError('El tipo es obligatorio'); return }
    setSaving(true)
    setError('')
    const { data, error } = await supabase.rpc('guardar_componente', {
      p_id: componente?.id || null,
      p_tipo: form.tipo.trim(),
      p_marca: form.marca || null,
      p_modelo: form.modelo || null,
      p_numero_serie: form.numero_serie || null,
      p_lectura_actual: form.lectura_actual === '' ? null : Number(form.lectura_actual),
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo guardar el componente'); return }
    onSaved()
  }

  return (
    <Modal titulo={componente?.id ? 'Editar componente' : 'Nuevo componente'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tipo *</label>
          <input value={form.tipo} onChange={e => setField('tipo', e.target.value)}
            placeholder="Ej: Bomba de vacío, Equipo hidráulico…"
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Marca</label>
            <input value={form.marca || ''} onChange={e => setField('marca', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Modelo</label>
            <input value={form.modelo || ''} onChange={e => setField('modelo', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">N° de serie</label>
            <input value={form.numero_serie || ''} onChange={e => setField('numero_serie', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Lectura propia (si corresponde)</label>
            <input type="number" value={form.lectura_actual ?? ''} onChange={e => setField('lectura_actual', e.target.value)}
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

function AsignarModal({ componente, unidades, onClose, onSaved }) {
  const [idUnidad, setIdUnidad] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!idUnidad) { setError('Elegí una unidad'); return }
    setSaving(true)
    setError('')
    const { data, error } = await supabase.rpc('asignar_componente', { p_id_componente: componente.id, p_id_unidad: idUnidad })
    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo asignar'); return }
    onSaved()
  }

  return (
    <Modal titulo={`Asignar — ${componente.tipo}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Unidad *</label>
          <BuscadorUnidad unidades={unidades} value={idUnidad} onChange={setIdUnidad} />
        </div>
        <p className="text-xs text-gray-400">
          Si el componente ya estaba instalado en otra unidad, esa asignación se cierra automáticamente y el historial queda registrado.
        </p>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Asignando…' : 'Asignar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function HistorialComponenteModal({ componente, onClose }) {
  const [historial, setHistorial] = useState(null)

  useEffect(() => {
    supabase.rpc('get_historial_componente', { p_id_componente: componente.id }).then(({ data }) => {
      setHistorial(data?.ok ? data.asignaciones : [])
    })
  }, [componente.id])

  return (
    <Modal titulo={`Historial — ${componente.tipo}`} onClose={onClose}>
      {historial === null ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : historial.length === 0 ? (
        <p className="text-sm text-gray-400">Sin asignaciones registradas todavía.</p>
      ) : (
        <ul className="space-y-2 max-h-96 overflow-y-auto">
          {historial.map((h, i) => (
            <li key={i} className="text-sm border-t border-gray-100 dark:border-gray-800 pt-2 first:border-t-0 first:pt-0">
              <p className="font-medium text-gray-900 dark:text-gray-100">{h.unidad_patente || 's/patente'} — {h.unidad_descripcion}</p>
              <p className="text-xs text-gray-400">
                {new Date(h.desde).toLocaleDateString()} — {h.hasta ? new Date(h.hasta).toLocaleDateString() : 'actual'}
              </p>
              {h.motivo_retiro && <p className="text-xs text-gray-500 dark:text-gray-400">Motivo de retiro: {h.motivo_retiro}</p>}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

export default function Componentes({ usuario }) {
  const [items, setItems] = useState([])
  const [unidades, setUnidades] = useState([])
  const [asignaciones, setAsignaciones] = useState({})
  const [loading, setLoading] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [componenteEditar, setComponenteEditar] = useState(null)
  const [componenteAsignar, setComponenteAsignar] = useState(null)
  const [componenteRetirar, setComponenteRetirar] = useState(null)
  const [componenteHistorial, setComponenteHistorial] = useState(null)
  const [error, setError] = useState('')

  const puedeEscribir = ['administrador', 'supervisor'].includes(usuario?.rol)

  async function cargar() {
    setLoading(true)
    const [{ data: itemsData }, { data: unidadesData }, { data: asignacionesData }] = await Promise.all([
      supabase.from('componentes_mantenibles').select('*').eq('activo', true).order('tipo'),
      supabase.from('unidades').select('id, descripcion, patente_serie').eq('activo', true).order('descripcion'),
      supabase.from('componentes_asignaciones').select('id_componente, id_unidad, unidades(descripcion, patente_serie)').is('hasta', null),
    ])
    setItems(itemsData || [])
    setUnidades(unidadesData || [])
    setAsignaciones(Object.fromEntries((asignacionesData || []).map(a => [a.id_componente, a])))
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-base font-medium text-gray-900 dark:text-gray-100">Componentes</h1>
        {puedeEscribir && (
          <button onClick={() => { setComponenteEditar(null); setModalAbierto(true) }}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            + Nuevo componente
          </button>
        )}
      </div>

      <div className="p-6">
        {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3" aria-live="polite">{error}</p>}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">Cargando…</div>
          ) : items.length === 0 ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">No hay componentes cargados todavía</div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900">
                <tr className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-400 dark:text-gray-500 font-medium">
                  <th className="px-5 py-3 text-left">Tipo</th>
                  <th className="px-5 py-3 text-left">Marca / Modelo</th>
                  <th className="px-5 py-3 text-left">N° serie</th>
                  <th className="px-5 py-3 text-left">Instalado en</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map(c => {
                  const asignacion = asignaciones[c.id]
                  return (
                    <tr key={c.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-5 py-3 text-gray-900 dark:text-gray-100 font-medium">{c.tipo}</td>
                      <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{[c.marca, c.modelo].filter(Boolean).join(' ') || '—'}</td>
                      <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{c.numero_serie || '—'}</td>
                      <td className="px-5 py-3 text-gray-500 dark:text-gray-400">
                        {asignacion ? `${asignacion.unidades?.patente_serie || 's/patente'} — ${asignacion.unidades?.descripcion}` : (
                          <span className="text-amber-600 dark:text-amber-400">Sin asignar</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <button onClick={() => setComponenteHistorial(c)} className="text-gray-600 dark:text-gray-400 hover:underline text-xs mr-3">
                          Historial
                        </button>
                        {puedeEscribir && (
                          <>
                            <button onClick={() => setComponenteAsignar(c)} className="text-blue-600 hover:underline text-xs mr-3">
                              {asignacion ? 'Reasignar' : 'Asignar'}
                            </button>
                            {asignacion && (
                              <button onClick={() => setComponenteRetirar(c)} className="text-red-500 dark:text-red-400 hover:underline text-xs mr-3">
                                Retirar
                              </button>
                            )}
                            <button onClick={() => { setComponenteEditar(c); setModalAbierto(true) }} className="text-blue-600 hover:underline text-xs">
                              Editar
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>
      </div>

      {modalAbierto && (
        <ComponenteModal
          componente={componenteEditar}
          onClose={() => setModalAbierto(false)}
          onSaved={() => { setModalAbierto(false); cargar() }}
        />
      )}

      {componenteAsignar && (
        <AsignarModal
          componente={componenteAsignar}
          unidades={unidades}
          onClose={() => setComponenteAsignar(null)}
          onSaved={() => { setComponenteAsignar(null); cargar() }}
        />
      )}

      {componenteRetirar && (
        <MotivoModal
          titulo={`Retirar — ${componenteRetirar.tipo}`}
          label="Motivo del retiro *"
          textoBoton="Retirar"
          onConfirm={async (motivo) => {
            setError('')
            const { data, error } = await supabase.rpc('retirar_componente', { p_id_componente: componenteRetirar.id, p_motivo: motivo })
            if (error || !data?.ok) { setError(data?.msg || error?.message); return }
            setComponenteRetirar(null)
            cargar()
          }}
          onClose={() => setComponenteRetirar(null)}
        />
      )}

      {componenteHistorial && (
        <HistorialComponenteModal
          componente={componenteHistorial}
          onClose={() => setComponenteHistorial(null)}
        />
      )}
    </div>
  )
}
