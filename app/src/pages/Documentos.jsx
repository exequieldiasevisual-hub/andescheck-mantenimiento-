import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import SelectConfig from '../components/SelectConfig'
import MultiSelectFiltro from '../components/MultiSelectFiltro'
import ConfirmModal from '../components/ConfirmModal'

const ESTADO_COLOR = {
  Vencido: 'text-red-600 font-medium',
  'Por vencer': 'text-amber-600 font-medium',
  Vigente: 'text-gray-500 dark:text-gray-400',
  'Sin fecha': 'text-gray-400',
}

function HistorialDocModal({ documento, onClose }) {
  const [historial, setHistorial] = useState(null)

  useEffect(() => {
    supabase.from('unidad_docs_historial').select('*, usuarios (nombre)').eq('id_documento', documento.id).order('fecha', { ascending: false })
      .then(({ data }) => setHistorial(data || []))
  }, [documento.id])

  return (
    <Modal titulo={`Historial de ediciones — ${documento.numero}`} onClose={onClose}>
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
                Vigencia anterior: {h.fecha_vigencia_desde_anterior ?? '—'} a {h.fecha_vigencia_hasta_anterior ?? '—'}
              </div>
              {h.observaciones_anterior && <div className="text-xs text-gray-500 dark:text-gray-400">Obs. anterior: {h.observaciones_anterior}</div>}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

function DocumentoModal({ documento, unidades, empresaId, onClose, onSaved }) {
  const editando = !!documento?.id
  const [form, setForm] = useState(documento
    ? { id_unidad: documento.id_unidad, tipo: documento.tipo, fecha_vigencia_desde: documento.fecha_vigencia_desde || '', fecha_vigencia_hasta: documento.fecha_vigencia_hasta || '', observaciones: documento.observaciones || '' }
    : { id_unidad: '', tipo: '', fecha_vigencia_desde: '', fecha_vigencia_hasta: '', observaciones: '' })
  const [archivo, setArchivo] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.id_unidad || !form.tipo.trim()) { setError('Unidad y tipo son obligatorios'); return }
    setSaving(true)
    setError('')

    let archivo_url = null
    if (archivo) {
      const path = `${empresaId}/${form.id_unidad}/${Date.now()}-${archivo.name}`
      const { error: upErr } = await supabase.storage.from('unidad-docs').upload(path, archivo)
      if (upErr) { setSaving(false); setError(upErr.message); return }
      archivo_url = supabase.storage.from('unidad-docs').getPublicUrl(path).data.publicUrl
    }

    const { data, error } = editando
      ? await supabase.rpc('actualizar_documento_unidad', {
          p_id: documento.id,
          p_fecha_vigencia_desde: form.fecha_vigencia_desde || null,
          p_fecha_vigencia_hasta: form.fecha_vigencia_hasta || null,
          p_archivo_url: archivo_url,
          p_observaciones: form.observaciones || null,
        })
      : await supabase.rpc('guardar_documento_unidad', {
          p_id_unidad: form.id_unidad,
          p_tipo: form.tipo,
          p_fecha_vigencia_desde: form.fecha_vigencia_desde || null,
          p_fecha_vigencia_hasta: form.fecha_vigencia_hasta || null,
          p_archivo_url: archivo_url,
          p_observaciones: form.observaciones || null,
        })

    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo guardar'); return }
    onSaved()
  }

  return (
    <Modal titulo={editando ? `Editar documento — ${documento.numero}` : 'Nuevo documento'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Unidad *</label>
          <select value={form.id_unidad} onChange={e => setField('id_unidad', e.target.value)} disabled={editando}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50 dark:disabled:bg-gray-900" required>
            <option value="">Seleccionar unidad...</option>
            {unidades.map(u => <option key={u.id} value={u.id}>{[u.patente_serie, u.descripcion].filter(Boolean).join(' — ')}</option>)}
          </select>
        </div>
        {editando ? (
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tipo</label>
            <input value={form.tipo} disabled className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900" />
          </div>
        ) : (
          <SelectConfig label="Tipo *" seccion="tipos_documento" value={form.tipo} onChange={v => setField('tipo', v)} dosColumnas={false} required />
        )}
        <p className="text-xs text-gray-400 -mt-2">El número de documento se asigna automáticamente al guardar.</p>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Observaciones</label>
          <input value={form.observaciones} onChange={e => setField('observaciones', e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Vigente desde</label>
            <input type="date" value={form.fecha_vigencia_desde} onChange={e => setField('fecha_vigencia_desde', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Vigente hasta</label>
            <input type="date" value={form.fecha_vigencia_hasta} onChange={e => setField('fecha_vigencia_hasta', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Archivo</label>
          <label className="flex items-center gap-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 w-fit">
            📷 {archivo ? archivo.name : 'Adjuntar o sacar foto'}
            <input type="file" accept="image/*,.pdf" capture="environment" onChange={e => setArchivo(e.target.files[0])} className="hidden" />
          </label>
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

export default function Documentos({ usuario }) {
  const [items, setItems] = useState([])
  const [unidades, setUnidades] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [documentoEditar, setDocumentoEditar] = useState(null)
  const [historialAbierto, setHistorialAbierto] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtroUnidad, setFiltroUnidad] = useState('')
  const [filtroTipo, setFiltroTipo] = useState([])
  const [filtroEstado, setFiltroEstado] = useState([])
  const [filtroCentro, setFiltroCentro] = useState([])
  const [filtroTipoUnidad, setFiltroTipoUnidad] = useState([])
  const [filtroCiudad, setFiltroCiudad] = useState([])
  const [etiquetasConfig, setEtiquetasConfig] = useState({})
  const [documentoEliminar, setDocumentoEliminar] = useState(null)

  const puedeEscribir = ['administrador', 'supervisor'].includes(usuario?.rol)

  async function cargar() {
    setLoading(true)
    const [{ data: itemsData }, { data: unidadesData }] = await Promise.all([
      supabase.from('unidad_docs_calculado').select('*, unidades(descripcion, patente_serie, centro_costo, ciudad, tipo)').order('fecha_vigencia_hasta', { nullsFirst: false }),
      supabase.from('unidades').select('id, descripcion, patente_serie, centro_costo, ciudad, tipo').eq('activo', true).order('descripcion'),
    ])
    setItems(itemsData || [])
    setUnidades(unidadesData || [])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    supabase.from('configuracion').select('seccion, clave, valor')
      .in('seccion', ['centros_costo', 'tipos_unidad', 'ciudades'])
      .then(({ data }) => {
        const porSeccion = { centros_costo: {}, tipos_unidad: {}, ciudades: {} }
        for (const fila of data || []) porSeccion[fila.seccion][fila.clave] = fila.valor
        setEtiquetasConfig(porSeccion)
      })
  }, [])

  async function eliminarDocumento() {
    const { error } = await supabase.from('unidad_docs').delete().eq('id', documentoEliminar.id)
    if (error) throw error
    setDocumentoEliminar(null)
    cargar()
  }

  const tipos = [...new Set(items.map(d => d.tipo).filter(Boolean))].sort()
  const centros = [...new Set(unidades.map(u => u.centro_costo).filter(Boolean))].sort()
  const tiposUnidad = [...new Set(unidades.map(u => u.tipo).filter(Boolean))].sort()
  const ciudades = [...new Set(unidades.map(u => u.ciudad).filter(Boolean))].sort()

  const q = busqueda.trim().toLowerCase()
  const filtrados = items
    .filter(d => !q || d.numero?.toLowerCase().includes(q) || d.tipo?.toLowerCase().includes(q) || d.unidades?.descripcion?.toLowerCase().includes(q) || d.unidades?.patente_serie?.toLowerCase().includes(q))
    .filter(d => !filtroUnidad || d.id_unidad === filtroUnidad)
    .filter(d => filtroTipo.length === 0 || filtroTipo.includes(d.tipo))
    .filter(d => filtroEstado.length === 0 || filtroEstado.includes(d.estado_calculado))
    .filter(d => filtroCentro.length === 0 || filtroCentro.includes(d.unidades?.centro_costo))
    .filter(d => filtroTipoUnidad.length === 0 || filtroTipoUnidad.includes(d.unidades?.tipo))
    .filter(d => filtroCiudad.length === 0 || filtroCiudad.includes(d.unidades?.ciudad))

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-base font-medium text-gray-900 dark:text-gray-100">Documentos</h1>
        {puedeEscribir && (
          <button onClick={() => { setDocumentoEditar(null); setModalAbierto(true) }}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            + Nuevo documento
          </button>
        )}
      </div>

      <div className="p-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex flex-wrap gap-2">
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por patente, unidad, N° o tipo…"
              className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
            />
            <select aria-label="Filtrar por unidad" value={filtroUnidad} onChange={e => setFiltroUnidad(e.target.value)}
              className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todas las unidades</option>
              {unidades.map(u => <option key={u.id} value={u.id}>{[u.patente_serie, u.descripcion].filter(Boolean).join(' — ')}</option>)}
            </select>
            <MultiSelectFiltro label="Tipo de documento" opciones={tipos} seleccionados={filtroTipo} onChange={setFiltroTipo} />
            <MultiSelectFiltro label="Vencimiento" opciones={['Vencido', 'Por vencer', 'Vigente', 'Sin fecha']} seleccionados={filtroEstado} onChange={setFiltroEstado} />
            <MultiSelectFiltro label="Centro de costo" opciones={centros} seleccionados={filtroCentro} onChange={setFiltroCentro} etiquetas={etiquetasConfig.centros_costo} />
            <MultiSelectFiltro label="Tipo de unidad" opciones={tiposUnidad} seleccionados={filtroTipoUnidad} onChange={setFiltroTipoUnidad} etiquetas={etiquetasConfig.tipos_unidad} />
            <MultiSelectFiltro label="Ciudad" opciones={ciudades} seleccionados={filtroCiudad} onChange={setFiltroCiudad} etiquetas={etiquetasConfig.ciudades} />
          </div>
          {loading ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">Cargando…</div>
          ) : filtrados.length === 0 ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">No hay documentos para este filtro</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-400 dark:text-gray-500 font-medium">
                  <th className="px-5 py-3 text-left">N° Doc</th>
                  <th className="px-5 py-3 text-left">Unidad</th>
                  <th className="px-5 py-3 text-left">Tipo</th>
                  <th className="px-5 py-3 text-left">Vence</th>
                  <th className="px-5 py-3 text-left">Estado</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(d => (
                  <tr key={d.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs">{d.numero}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">
                      {d.unidades?.patente_serie && <span className="font-medium text-gray-700 dark:text-gray-300">{d.unidades.patente_serie} — </span>}
                      {d.unidades?.descripcion}
                    </td>
                    <td className="px-5 py-3 text-gray-900 dark:text-gray-100">{d.tipo}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{d.fecha_vigencia_hasta ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span className={ESTADO_COLOR[d.estado_calculado] ?? ''}>{d.estado_calculado}</span>
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {d.archivo_url && <a href={d.archivo_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs mr-3">Ver</a>}
                      {d.actualizado_en && (
                        <button onClick={() => setHistorialAbierto(d)} className="text-gray-600 dark:text-gray-400 hover:underline text-xs mr-3">Historial</button>
                      )}
                      {puedeEscribir && (
                        <button onClick={() => { setDocumentoEditar(d); setModalAbierto(true) }} className="text-blue-600 hover:underline text-xs mr-3">Editar</button>
                      )}
                      {puedeEscribir && (
                        <button onClick={() => setDocumentoEliminar(d)} className="text-red-500 dark:text-red-400 hover:underline text-xs">Eliminar</button>
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
        <DocumentoModal
          documento={documentoEditar}
          unidades={unidades}
          empresaId={usuario.empresa_id}
          onClose={() => setModalAbierto(false)}
          onSaved={() => { setModalAbierto(false); cargar() }}
        />
      )}

      {historialAbierto && (
        <HistorialDocModal
          documento={historialAbierto}
          onClose={() => setHistorialAbierto(null)}
        />
      )}

      {documentoEliminar && (
        <ConfirmModal
          titulo="Eliminar documento"
          mensaje={`¿Eliminar el documento "${documentoEliminar.numero}"? Esta acción no se puede deshacer.`}
          textoBoton="Eliminar"
          onConfirm={eliminarDocumento}
          onClose={() => setDocumentoEliminar(null)}
        />
      )}
    </div>
  )
}
