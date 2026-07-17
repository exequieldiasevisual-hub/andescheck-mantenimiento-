import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { exportarXlsx } from '../lib/exportarXlsx'
import { parseXlsx } from '../lib/importarXlsx'
import Modal from '../components/Modal'
import SelectConfig from '../components/SelectConfig'
import KmHsModal from '../components/KmHsModal'
import MultiSelectFiltro from '../components/MultiSelectFiltro'
import ConfirmModal from '../components/ConfirmModal'

const VACIO = {
  descripcion: '', tipo: '', patente_serie: '', marca: '', modelo: '',
  anio: '', centro_costo: '', ciudad: '', tipo_mision: '', km_actuales: '', hs_actuales: '',
}

function saludChipClase(salud) {
  if (salud == null) return 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
  if (salud >= 80) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
  if (salud >= 50) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
}

function HistorialKmHsModal({ unidad, onClose }) {
  const [historial, setHistorial] = useState(null)

  useEffect(() => {
    supabase.from('unidad_km_hs_historial').select('*, usuarios (nombre)').eq('id_unidad', unidad.id).order('fecha', { ascending: false })
      .then(({ data }) => setHistorial(data || []))
  }, [unidad.id])

  return (
    <Modal titulo={`Historial Km/Hs — ${unidad.descripcion}`} onClose={onClose}>
      {historial === null ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : historial.length === 0 ? (
        <p className="text-sm text-gray-400">Sin actualizaciones registradas todavía.</p>
      ) : (
        <ul className="space-y-2 max-h-96 overflow-y-auto">
          {historial.map(h => (
            <li key={h.id} className="text-sm border-t border-gray-100 dark:border-gray-800 pt-2 first:border-t-0 first:pt-0">
              <span className="text-xs text-gray-400">{new Date(h.fecha).toLocaleString()}</span>
              {' — '}
              {h.km_actuales != null && <span>{h.km_actuales} km</span>}
              {h.km_actuales != null && h.hs_actuales != null && ' · '}
              {h.hs_actuales != null && <span>{h.hs_actuales} hs</span>}
              <span className="text-xs text-gray-400"> ({h.usuarios?.nombre ?? '—'})</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

function UnidadModal({ unidad, empresaId, onClose, onSaved }) {
  const [form, setForm] = useState(unidad || VACIO)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.descripcion.trim()) { setError('La descripción es obligatoria'); return }
    const anioMaximo = new Date().getFullYear() + 1
    if (form.anio && Number(form.anio) > anioMaximo) { setError(`El año modelo no puede ser mayor a ${anioMaximo}`); return }
    setSaving(true)
    setError('')

    const payload = {
      empresa_id: empresaId,
      descripcion: form.descripcion.trim(),
      tipo: form.tipo || null,
      patente_serie: form.patente_serie || null,
      marca: form.marca || null,
      modelo: form.modelo || null,
      anio: form.anio ? Number(form.anio) : null,
      centro_costo: form.centro_costo || null,
      ciudad: form.ciudad || null,
      tipo_mision: form.tipo_mision || null,
      km_actuales: form.km_actuales ? Number(form.km_actuales) : null,
      hs_actuales: form.hs_actuales ? Number(form.hs_actuales) : null,
    }

    const query = unidad?.id
      ? supabase.from('unidades').update(payload).eq('id', unidad.id)
      : supabase.from('unidades').insert(payload)

    const { error } = await query
    setSaving(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  return (
    <Modal titulo={unidad?.id ? 'Editar unidad' : 'Nueva unidad'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Descripción *</label>
          <input
            value={form.descripcion}
            onChange={e => setField('descripcion', e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <SelectConfig label="Tipo" seccion="tipos_unidad" value={form.tipo} onChange={v => setField('tipo', v)} />
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Patente / N° serie</label>
            <input value={form.patente_serie || ''} onChange={e => setField('patente_serie', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Marca</label>
            <input value={form.marca || ''} onChange={e => setField('marca', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Modelo</label>
            <input value={form.modelo || ''} onChange={e => setField('modelo', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Año</label>
            <input type="number" max={new Date().getFullYear() + 1} value={form.anio || ''} onChange={e => setField('anio', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <SelectConfig label="Centro de costo" seccion="centros_costo" value={form.centro_costo} onChange={v => setField('centro_costo', v)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <SelectConfig label="Ciudad" seccion="ciudades" value={form.ciudad} onChange={v => setField('ciudad', v)} />
          <SelectConfig label="Tipo de misión" seccion="tipos_mision" value={form.tipo_mision} onChange={v => setField('tipo_mision', v)} dosColumnas={false} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Km actuales</label>
            <input type="number" value={form.km_actuales || ''} onChange={e => setField('km_actuales', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Hs actuales</label>
            <input type="number" value={form.hs_actuales || ''} onChange={e => setField('hs_actuales', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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

function CargaMasivaModal({ unidades, onClose, onSaved }) {
  const [valores, setValores] = useState({})
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function setValor(id, campo, v) {
    setValores(prev => ({ ...prev, [id]: { ...prev[id], [campo]: v } }))
  }

  async function importarExcel(e) {
    const archivo = e.target.files[0]
    e.target.value = ''
    if (!archivo) return
    setError('')
    try {
      const filas = await parseXlsx(await archivo.arrayBuffer())
      let cargadas = 0
      const nuevos = {}
      for (const fila of filas) {
        const patente = String(fila['Patente'] ?? fila['Patente/Serie'] ?? fila['patente'] ?? '').trim().toLowerCase()
        if (!patente) continue
        const u = unidades.find(x => x.patente_serie?.trim().toLowerCase() === patente)
        if (!u) continue
        const km = String(fila['Km'] ?? fila['km'] ?? '').trim()
        const hs = String(fila['Hs'] ?? fila['hs'] ?? '').trim()
        if (km === '' && hs === '') continue
        nuevos[u.id] = { km, hs }
        cargadas++
      }
      setValores(prev => ({ ...prev, ...nuevos }))
      setResultado(`Se cargaron ${cargadas} fila(s) desde el Excel. Revisá y guardá.`)
    } catch (err) {
      setError('No se pudo leer el archivo: ' + err.message)
    }
  }

  async function guardar() {
    const datos = Object.entries(valores)
      .filter(([, v]) => (v.km ?? '') !== '' || (v.hs ?? '') !== '')
      .map(([id_unidad, v]) => ({ id_unidad, km: v.km ?? '', hs: v.hs ?? '' }))
    if (datos.length === 0) { setError('No hay valores cargados para guardar'); return }
    setSaving(true)
    setError('')
    setResultado(null)
    const { data, error } = await supabase.rpc('actualizar_km_hs_masivo', { p_datos: datos })
    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo guardar'); return }
    const errores = data.errores || []
    if (errores.length > 0) {
      setResultado(`Actualizadas: ${data.actualizadas}. Con errores: ${errores.length}.`)
      setError(errores.join(' · '))
    } else {
      onSaved(data.actualizadas)
    }
  }

  return (
    <Modal titulo="Carga masiva de Km/Hs" onClose={onClose} ancho="max-w-3xl">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Completá solo las unidades que quieras actualizar. Formato Excel: columnas Patente, Km, Hs.
          </p>
          <label className="text-xs text-blue-600 hover:underline cursor-pointer whitespace-nowrap ml-3">
            ↑ Importar Excel
            <input type="file" accept=".xlsx" onChange={importarExcel} className="hidden" />
          </label>
        </div>

        <div className="max-h-96 overflow-y-auto overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900">
              <tr className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                <th className="px-3 py-2 text-left">Patente</th>
                <th className="px-3 py-2 text-left">Descripción</th>
                <th className="px-3 py-2 text-left">Km actual</th>
                <th className="px-3 py-2 text-left">Km nuevo</th>
                <th className="px-3 py-2 text-left">Hs actual</th>
                <th className="px-3 py-2 text-left">Hs nuevas</th>
              </tr>
            </thead>
            <tbody>
              {unidades.map(u => (
                <tr key={u.id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-3 py-1.5 text-gray-900 dark:text-gray-100 font-medium">{u.patente_serie || '—'}</td>
                  <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">{u.descripcion}</td>
                  <td className="px-3 py-1.5 text-gray-400 tabular-nums">{u.km_actuales ?? '—'}</td>
                  <td className="px-3 py-1.5">
                    <input type="number" aria-label={`Km nuevo — ${u.descripcion}`} value={valores[u.id]?.km ?? ''} onChange={e => setValor(u.id, 'km', e.target.value)}
                      className="w-24 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-sm tabular-nums" />
                  </td>
                  <td className="px-3 py-1.5 text-gray-400 tabular-nums">{u.hs_actuales ?? '—'}</td>
                  <td className="px-3 py-1.5">
                    <input type="number" aria-label={`Hs nuevas — ${u.descripcion}`} value={valores[u.id]?.hs ?? ''} onChange={e => setValor(u.id, 'hs', e.target.value)}
                      className="w-24 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-sm tabular-nums" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {resultado && <p className="text-sm text-green-600 dark:text-green-400">{resultado}</p>}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cerrar
          </button>
          <button type="button" onClick={guardar} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar todo'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

const SALUD_ETIQUETAS = { verde: 'Bien (≥80)', ambar: 'A vigilar (50-79)', rojo: 'Crítica (<50)' }

function nivelSalud(valor) {
  if (valor == null) return null
  if (valor >= 80) return 'verde'
  if (valor >= 50) return 'ambar'
  return 'rojo'
}

export default function Unidades({ usuario, abrirFicha, filtroSaludInicial }) {
  const [unidades, setUnidades] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState([])
  const [filtroCentro, setFiltroCentro] = useState([])
  const [filtroCiudad, setFiltroCiudad] = useState([])
  const [filtroSalud, setFiltroSalud] = useState(filtroSaludInicial ? [filtroSaludInicial] : [])
  const [loading, setLoading] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [unidadEditar, setUnidadEditar] = useState(null)
  const [historialAbierto, setHistorialAbierto] = useState(null)
  const [saludPorUnidad, setSaludPorUnidad] = useState({})
  const [ordenSalud, setOrdenSalud] = useState(null)
  const [cargaMasivaAbierta, setCargaMasivaAbierta] = useState(false)
  const [kmHsAbierto, setKmHsAbierto] = useState(null)
  const [etiquetasConfig, setEtiquetasConfig] = useState({})
  const [unidadesConRutina, setUnidadesConRutina] = useState(new Set())
  const [unidadEliminar, setUnidadEliminar] = useState(null)
  const [mensajeExito, setMensajeExito] = useState('')

  const puedeEscribir = ['administrador', 'supervisor'].includes(usuario?.rol)
  const puedeBorrar = usuario?.rol === 'administrador'

  async function cargar() {
    setLoading(true)
    const [{ data }, { data: saludData }, { data: rutinasData }] = await Promise.all([
      supabase.from('unidades').select('*').eq('activo', true).order('patente_serie'),
      supabase.rpc('get_salud_flota'),
      supabase.from('rutinas_calculado').select('id_unidad').eq('activo', true),
    ])
    setUnidades(data || [])
    setSaludPorUnidad(Object.fromEntries((saludData || []).map(s => [s.id_unidad, s.salud])))
    setUnidadesConRutina(new Set((rutinasData || []).map(r => r.id_unidad)))
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

  async function eliminarUnidad() {
    const { error } = await supabase.from('unidades').update({ activo: false }).eq('id', unidadEliminar.id)
    if (error) throw error
    setUnidadEliminar(null)
    cargar()
  }

  const tipos = [...new Set(unidades.map(u => u.tipo).filter(Boolean))].sort()
  const centros = [...new Set(unidades.map(u => u.centro_costo).filter(Boolean))].sort()
  const ciudades = [...new Set(unidades.map(u => u.ciudad).filter(Boolean))].sort()

  const q = busqueda.toLowerCase()
  const filtradas = unidades
    .filter(u => !q ||
      u.descripcion?.toLowerCase().includes(q) ||
      u.patente_serie?.toLowerCase().includes(q) ||
      u.marca?.toLowerCase().includes(q) ||
      u.modelo?.toLowerCase().includes(q)
    )
    .filter(u => filtroTipo.length === 0 || filtroTipo.includes(u.tipo))
    .filter(u => filtroCentro.length === 0 || filtroCentro.includes(u.centro_costo))
    .filter(u => filtroCiudad.length === 0 || filtroCiudad.includes(u.ciudad))
    .filter(u => filtroSalud.length === 0 || filtroSalud.includes(nivelSalud(saludPorUnidad[u.id])))
  const ordenadas = ordenSalud
    ? [...filtradas].sort((a, b) => {
        const sa = saludPorUnidad[a.id] ?? 101
        const sb = saludPorUnidad[b.id] ?? 101
        return ordenSalud === 'asc' ? sa - sb : sb - sa
      })
    : filtradas

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-base font-medium text-gray-900 dark:text-gray-100">Activos</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportarXlsx('unidades', ordenadas, [
              { label: 'Descripción', get: u => u.descripcion },
              { label: 'Tipo', get: u => u.tipo },
              { label: 'Marca', get: u => u.marca },
              { label: 'Modelo', get: u => u.modelo },
              { label: 'Patente/Serie', get: u => u.patente_serie },
              { label: 'Centro de costo', get: u => u.centro_costo },
              { label: 'Ciudad', get: u => u.ciudad },
              { label: 'Km actuales', get: u => u.km_actuales },
              { label: 'Hs actuales', get: u => u.hs_actuales },
            ])}
            className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg transition-colors"
          >
            ↓ Excel
          </button>
          {puedeEscribir && (
            <button
              onClick={() => setCargaMasivaAbierta(true)}
              className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg transition-colors"
            >
              ⚡ Carga masiva Km/Hs
            </button>
          )}
          {puedeEscribir && (
            <button
              onClick={() => { setUnidadEditar(null); setModalAbierto(true) }}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              + Nueva unidad
            </button>
          )}
        </div>
      </div>

      <div className="p-6">
        {mensajeExito && <p className="text-sm text-green-600 dark:text-green-400 mb-3" aria-live="polite">{mensajeExito}</p>}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex flex-wrap gap-2">
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar patente, descripción, marca, modelo…"
              className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
            <MultiSelectFiltro label="Tipo de unidad" opciones={tipos} seleccionados={filtroTipo} onChange={setFiltroTipo} etiquetas={etiquetasConfig.tipos_unidad} />
            <MultiSelectFiltro label="Centro de costo" opciones={centros} seleccionados={filtroCentro} onChange={setFiltroCentro} etiquetas={etiquetasConfig.centros_costo} />
            <MultiSelectFiltro label="Ciudad" opciones={ciudades} seleccionados={filtroCiudad} onChange={setFiltroCiudad} etiquetas={etiquetasConfig.ciudades} />
            <MultiSelectFiltro label="Salud" opciones={['verde', 'ambar', 'rojo']} seleccionados={filtroSalud} onChange={setFiltroSalud} etiquetas={SALUD_ETIQUETAS} soloEtiqueta />
          </div>

          {loading ? (
            <div className="px-5 py-8 text-sm text-gray-400 dark:text-gray-500 text-center">Cargando…</div>
          ) : filtradas.length === 0 ? (
            <div className="px-5 py-8 text-sm text-gray-400 dark:text-gray-500 text-center">No hay unidades cargadas todavía</div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900">
                <tr className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-400 dark:text-gray-500 font-medium">
                  <th className="px-5 py-3 text-left">Patente / Serie</th>
                  <th className="px-5 py-3 text-left">Tipo</th>
                  <th className="px-5 py-3 text-left">Marca / Modelo</th>
                  <th className="px-5 py-3 text-left">Descripción</th>
                  <th className="px-5 py-3 text-left">Km / Hs</th>
                  <th className="px-5 py-3 text-left">
                    <button
                      onClick={() => setOrdenSalud(o => o === 'asc' ? 'desc' : 'asc')}
                      className="hover:underline"
                      title="Ordenar por salud"
                    >
                      Salud {ordenSalud === 'asc' ? '↑' : ordenSalud === 'desc' ? '↓' : ''}
                    </button>
                  </th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map(u => (
                  <tr key={u.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-5 py-3">
                      <button onClick={() => abrirFicha(u.id)} className="text-gray-900 dark:text-gray-100 font-medium hover:underline text-left">
                        {u.patente_serie || '—'}
                      </button>
                      {!unidadesConRutina.has(u.id) && (
                        <span title="Sin rutinas de mantenimiento configuradas" className="ml-1.5 text-red-500 dark:text-red-400 text-xs">⚠</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{u.tipo || '—'}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{[u.marca, u.modelo].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{u.descripcion}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400 tabular-nums">{u.km_actuales ?? u.hs_actuales ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium tabular-nums ${saludChipClase(saludPorUnidad[u.id])}`}>
                        {saludPorUnidad[u.id] ?? '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <button onClick={() => abrirFicha(u.id)} className="text-blue-600 hover:underline text-xs mr-3">
                        Ficha
                      </button>
                      {puedeEscribir && (
                        <button onClick={() => setKmHsAbierto(u)} className="text-gray-600 dark:text-gray-400 hover:underline text-xs mr-3">
                          📊 Km/Hs
                        </button>
                      )}
                      <button onClick={() => setHistorialAbierto(u)} className="text-gray-600 dark:text-gray-400 hover:underline text-xs mr-3">
                        Historial
                      </button>
                      {puedeEscribir && (
                        <button onClick={() => { setUnidadEditar(u); setModalAbierto(true) }} className="text-blue-600 hover:underline text-xs mr-3">
                          Editar
                        </button>
                      )}
                      {puedeBorrar && (
                        <button onClick={() => setUnidadEliminar(u)} className="text-red-500 dark:text-red-400 hover:underline text-xs">
                          Eliminar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      </div>

      {modalAbierto && (
        <UnidadModal
          unidad={unidadEditar}
          empresaId={usuario.empresa_id}
          onClose={() => setModalAbierto(false)}
          onSaved={() => { setModalAbierto(false); cargar() }}
        />
      )}

      {historialAbierto && (
        <HistorialKmHsModal
          unidad={historialAbierto}
          onClose={() => setHistorialAbierto(null)}
        />
      )}

      {kmHsAbierto && (
        <KmHsModal
          unidad={kmHsAbierto}
          onClose={() => setKmHsAbierto(null)}
          onSaved={() => { setKmHsAbierto(null); cargar() }}
        />
      )}

      {cargaMasivaAbierta && (
        <CargaMasivaModal
          unidades={filtradas}
          onClose={() => setCargaMasivaAbierta(false)}
          onSaved={(n) => {
            setCargaMasivaAbierta(false)
            cargar()
            setMensajeExito(`${n} unidad(es) actualizada(s)`)
            setTimeout(() => setMensajeExito(''), 4000)
          }}
        />
      )}

      {unidadEliminar && (
        <ConfirmModal
          titulo="Dar de baja unidad"
          mensaje={`¿Dar de baja "${unidadEliminar.descripcion}"?`}
          textoBoton="Dar de baja"
          onConfirm={eliminarUnidad}
          onClose={() => setUnidadEliminar(null)}
        />
      )}
    </div>
  )
}
