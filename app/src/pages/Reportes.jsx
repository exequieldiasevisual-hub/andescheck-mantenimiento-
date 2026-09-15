import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { exportarXlsx } from '../lib/exportarXlsx'
import { parseXlsx } from '../lib/importarXlsx'
import MultiSelectFiltro from '../components/MultiSelectFiltro'
import Modal from '../components/Modal'

function money(v) {
  return `$${Number(v || 0).toLocaleString('es-AR')}`
}

const COLORES = ['#3b82f6', '#f97316', '#8b5cf6', '#22c55e', '#ef4444', '#06b6d4', '#eab308', '#ec4899', '#14b8a6', '#6366f1', '#84cc16', '#f43f5e']

// seleccionados/onToggle son opcionales — si se pasan, la leyenda se vuelve
// clickeable (filtro cruzado tipo Power BI) y resalta lo elegido.
function Donut({ datos, valueKey, labelKey, hueco = false, seleccionados, onToggle }) {
  const total = datos.reduce((s, d) => s + Number(d[valueKey] || 0), 0)
  let acc = 0
  const stops = datos.map((d, i) => {
    const pct = total > 0 ? (Number(d[valueKey]) / total) * 100 : 0
    const desde = acc
    acc += pct
    return `${COLORES[i % COLORES.length]} ${desde}% ${acc}%`
  }).join(', ')
  const interactivo = typeof onToggle === 'function'
  const hayFiltro = interactivo && seleccionados.length > 0

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-32 h-32 shrink-0">
        <div className="w-32 h-32 rounded-full" style={{ background: total > 0 ? `conic-gradient(${stops})` : '#e5e7eb' }} />
        {hueco && <div className="absolute inset-[22%] rounded-full bg-white dark:bg-gray-800" />}
      </div>
      <div className="space-y-1 text-xs min-w-0">
        {datos.length === 0 && <p className="text-gray-400">Sin datos</p>}
        {datos.map((d, i) => {
          const activo = interactivo && seleccionados.includes(d[labelKey])
          const Tag = interactivo ? 'button' : 'div'
          return (
            <Tag
              key={d[labelKey]}
              type={interactivo ? 'button' : undefined}
              onClick={interactivo ? () => onToggle(d[labelKey]) : undefined}
              className={`flex items-center gap-2 w-full text-left ${interactivo ? 'cursor-pointer hover:opacity-80' : ''} ${hayFiltro && !activo ? 'opacity-40' : ''}`}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORES[i % COLORES.length] }} />
              <span className={`text-gray-600 dark:text-gray-400 truncate ${activo ? 'font-semibold text-gray-900 dark:text-gray-100' : ''}`}>{d[labelKey]}</span>
              <span className="text-gray-400 ml-auto tabular-nums shrink-0">
                {total > 0 ? Math.round((Number(d[valueKey]) / total) * 100) : 0}%
              </span>
            </Tag>
          )
        })}
      </div>
    </div>
  )
}

function BarrasHorizontales({ datos, valueKey, labelKey, seleccionados, onToggle }) {
  const max = Math.max(1, ...datos.map(d => Number(d[valueKey] || 0)))
  const interactivo = typeof onToggle === 'function'
  const hayFiltro = interactivo && seleccionados.length > 0
  return (
    <div className="space-y-2">
      {datos.length === 0 && <p className="text-gray-400 text-xs">Sin datos</p>}
      {datos.map(d => {
        const activo = interactivo && seleccionados.includes(d[labelKey])
        const Tag = interactivo ? 'button' : 'div'
        return (
          <Tag
            key={d[labelKey]}
            type={interactivo ? 'button' : undefined}
            onClick={interactivo ? () => onToggle(d[labelKey]) : undefined}
            className={`flex items-center gap-2 text-xs w-full ${interactivo ? 'cursor-pointer' : ''} ${hayFiltro && !activo ? 'opacity-40' : ''}`}
          >
            <span className={`w-32 shrink-0 text-left truncate ${activo ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`} title={d[labelKey]}>{d[labelKey]}</span>
            <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded h-4 overflow-hidden">
              <div className={`h-full rounded ${activo ? 'bg-blue-700' : 'bg-blue-500'}`} style={{ width: `${(Number(d[valueKey]) / max) * 100}%` }} />
            </div>
            <span className="w-8 text-right tabular-nums text-gray-500 dark:text-gray-400">{d[valueKey]}</span>
          </Tag>
        )
      })}
    </div>
  )
}

// Tabla de conteos (no plata) con filas clickeables para filtro cruzado.
// filas: [{ label, cantidad, valor }] — valor es lo que se manda a onToggle.
function ListaClic({ titulo, filas, seleccionados, onToggle }) {
  const interactivo = typeof onToggle === 'function'
  const hayFiltro = interactivo && seleccionados.length > 0
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">{titulo}</h2>
      {filas.length === 0 ? (
        <p className="text-sm text-gray-400">Sin datos</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {filas.map((f, i) => {
              const activo = interactivo && seleccionados.includes(f.valor)
              return (
                <tr
                  key={i}
                  onClick={interactivo ? () => onToggle(f.valor) : undefined}
                  role={interactivo ? 'button' : undefined}
                  tabIndex={interactivo ? 0 : undefined}
                  onKeyDown={interactivo ? e => { if (e.key === 'Enter' || e.key === ' ') onToggle(f.valor) } : undefined}
                  className={`border-t border-gray-100 dark:border-gray-800 first:border-t-0 ${interactivo ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700' : ''} ${hayFiltro && !activo ? 'opacity-40' : ''}`}
                >
                  <td className={`py-2 ${activo ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>{f.label}</td>
                  <td className="py-2 text-right font-medium text-gray-900 dark:text-gray-100 tabular-nums">{f.cantidad}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

function TablaReporte({ titulo, filas, columnas }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">{titulo}</h2>
      {filas.length === 0 ? (
        <p className="text-sm text-gray-400">Sin costos este mes</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {filas.map((f, i) => (
              <tr key={i} className="border-t border-gray-100 dark:border-gray-800 first:border-t-0">
                <td className="py-2 text-gray-700 dark:text-gray-300">{columnas.etiqueta(f)}</td>
                <td className="py-2 text-right font-medium text-gray-900 dark:text-gray-100">{money(f.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function CargarDatosCostosModal({ mes, onClose, onGuardado }) {
  const [sub, setSub] = useState('facturado')
  const [unidades, setUnidades] = useState([])
  const [choferes, setChoferes] = useState([])
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  // facturado masivo
  const [filasFacturado, setFilasFacturado] = useState([])
  const [guardandoFacturado, setGuardandoFacturado] = useState(false)

  // costo anual por unidad
  const [anioAnual, setAnioAnual] = useState(new Date().getFullYear())
  const [unidadAnual, setUnidadAnual] = useState('')
  const [conceptoAnual, setConceptoAnual] = useState('Seguro')
  const [montoAnual, setMontoAnual] = useState('')

  // sueldo chofer
  const [choferSueldo, setChoferSueldo] = useState('')
  const [montoSueldo, setMontoSueldo] = useState('')

  // costo por centro
  const [centroCosto, setCentroCosto] = useState('')
  const [conceptoCentro, setConceptoCentro] = useState('')
  const [montoCentro, setMontoCentro] = useState('')

  useEffect(() => {
    supabase.from('unidades').select('id, descripcion, patente_serie, centro_costo').eq('activo', true).order('descripcion')
      .then(({ data }) => setUnidades(data || []))
    supabase.from('usuarios').select('id, nombre').eq('rol', 'chofer').eq('activo', true).order('nombre')
      .then(({ data }) => setChoferes(data || []))
  }, [])

  const centros = [...new Set(unidades.map(u => u.centro_costo).filter(Boolean))].sort()

  async function leerExcelFacturado(e) {
    const archivo = e.target.files[0]
    if (!archivo) return
    setError('')
    try {
      const filas = await parseXlsx(await archivo.arrayBuffer())
      const encontradas = []
      for (const fila of filas) {
        const patente = String(fila['Patente'] ?? fila['patente'] ?? '').trim().toLowerCase()
        const monto = Number(fila['Monto'] ?? fila['monto'] ?? 0)
        if (!patente || !monto) continue
        const u = unidades.find(x => x.patente_serie?.trim().toLowerCase() === patente)
        if (!u) continue
        encontradas.push({ id_unidad: u.id, unidad: u.descripcion, patente: u.patente_serie, monto })
      }
      setFilasFacturado(encontradas)
      setAviso(`${encontradas.length} unidad(es) reconocida(s) del Excel. Revisá y guardá.`)
    } catch (err) {
      setError('No se pudo leer el archivo: ' + err.message)
    }
  }

  async function guardarFacturadoMasivo() {
    if (filasFacturado.length === 0) { setError('No hay filas cargadas'); return }
    setGuardandoFacturado(true)
    setError('')
    const { data, error } = await supabase.rpc('guardar_facturado_masivo', {
      p_filas: filasFacturado.map(f => ({ id_unidad: f.id_unidad, mes: `${mes}-01`, monto: f.monto })),
    })
    setGuardandoFacturado(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo guardar'); return }
    setFilasFacturado([])
    setAviso(`Se guardaron ${data.cargados} fila(s).`)
    onGuardado()
  }

  async function guardarUnaFacturado(id_unidad, monto) {
    setError('')
    const { data, error } = await supabase.rpc('guardar_facturado_masivo', {
      p_filas: [{ id_unidad, mes: `${mes}-01`, monto: Number(monto) || 0 }],
    })
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo guardar'); return }
    onGuardado()
  }

  async function guardarCostoAnual() {
    setError('')
    if (!unidadAnual || !conceptoAnual.trim()) { setError('Faltan campos'); return }
    const { data, error } = await supabase.rpc('guardar_costo_anual', {
      p_id_unidad: unidadAnual, p_anio: Number(anioAnual), p_concepto: conceptoAnual.trim(), p_monto_anual: Number(montoAnual) || 0,
    })
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo guardar'); return }
    setMontoAnual('')
    setAviso('Costo anual guardado.')
    onGuardado()
  }

  async function guardarSueldoChofer() {
    setError('')
    if (!choferSueldo) { setError('Elegí un chofer'); return }
    const { data, error } = await supabase.rpc('guardar_sueldo_chofer', {
      p_id_chofer: choferSueldo, p_mes: `${mes}-01`, p_monto: Number(montoSueldo) || 0,
    })
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo guardar'); return }
    setMontoSueldo('')
    setAviso('Sueldo del chofer guardado.')
    onGuardado()
  }

  async function guardarCostoCentro() {
    setError('')
    if (!centroCosto.trim() || !conceptoCentro.trim()) { setError('Faltan campos'); return }
    const { data, error } = await supabase.rpc('guardar_costo_centro', {
      p_centro_costo: centroCosto.trim(), p_mes: `${mes}-01`, p_concepto: conceptoCentro.trim(), p_monto: Number(montoCentro) || 0,
    })
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo guardar'); return }
    setConceptoCentro('')
    setMontoCentro('')
    setAviso('Costo del centro guardado.')
    onGuardado()
  }

  const SUBTABS = [
    { key: 'facturado', label: 'Facturado' },
    { key: 'anual', label: 'Seguro / RTO / etc.' },
    { key: 'sueldo', label: 'Sueldo chofer' },
    { key: 'centro', label: 'Por centro de costo' },
  ]

  return (
    <Modal titulo={`Cargar datos de costos — ${mes}`} onClose={onClose} ancho="max-w-2xl">
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-4 -mt-1">
        {SUBTABS.map(t => (
          <button key={t.key} type="button" onClick={() => { setSub(t.key); setError(''); setAviso('') }}
            className={`px-3 py-2 text-xs font-medium border-b-2 ${sub === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 dark:text-gray-400'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}
      {aviso && <p className="text-sm text-green-600 dark:text-green-400 mb-3">{aviso}</p>}

      {sub === 'facturado' && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Excel (columnas: Patente, Monto)</label>
            <input type="file" accept=".xlsx" onChange={leerExcelFacturado} className="text-sm" />
          </div>
          {filasFacturado.length > 0 && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-48 overflow-y-auto">
              <table className="w-full text-sm">
                <tbody>
                  {filasFacturado.map(f => (
                    <tr key={f.id_unidad} className="border-t border-gray-100 dark:border-gray-800 first:border-t-0">
                      <td className="px-3 py-1.5">{f.patente} — {f.unidad}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{money(f.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filasFacturado.length > 0 && (
            <button type="button" onClick={guardarFacturadoMasivo} disabled={guardandoFacturado}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
              {guardandoFacturado ? 'Guardando…' : `Guardar ${filasFacturado.length} fila(s)`}
            </button>
          )}

          <p className="text-xs text-gray-400 pt-2">O cargá el monto de cada unidad a mano:</p>
          <div className="max-h-56 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-800">
            {unidades.map(u => (
              <FilaFacturadoManual key={u.id} unidad={u} onGuardar={guardarUnaFacturado} />
            ))}
          </div>
        </div>
      )}

      {sub === 'anual' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">Se carga una vez por año, el sistema prorratea 1/12 cada mes solo.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Unidad</label>
              <select value={unidadAnual} onChange={e => setUnidadAnual(e.target.value)} className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900">
                <option value="">Elegir…</option>
                {unidades.map(u => <option key={u.id} value={u.id}>{u.patente_serie} — {u.descripcion}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Año</label>
              <input type="number" value={anioAnual} onChange={e => setAnioAnual(e.target.value)} className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900" />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Concepto</label>
              <input value={conceptoAnual} onChange={e => setConceptoAnual(e.target.value)} placeholder="Seguro, RTO, Patente…" className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900" />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Monto anual</label>
              <input type="number" value={montoAnual} onChange={e => setMontoAnual(e.target.value)} className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900" />
            </div>
          </div>
          <button type="button" onClick={guardarCostoAnual} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg">Guardar</button>
        </div>
      )}

      {sub === 'sueldo' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">Monto mensual del chofer (sueldo + cargas sociales). Se reparte solo entre las unidades que manejó este mes.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Chofer</label>
              <select value={choferSueldo} onChange={e => setChoferSueldo(e.target.value)} className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900">
                <option value="">Elegir…</option>
                {choferes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Monto del mes</label>
              <input type="number" value={montoSueldo} onChange={e => setMontoSueldo(e.target.value)} className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900" />
            </div>
          </div>
          <button type="button" onClick={guardarSueldoChofer} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg">Guardar</button>
        </div>
      )}

      {sub === 'centro' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">Costos que no son de una unidad puntual (sueldo técnicos, servicios, impuesto municipal…). Se reparten por partes iguales entre las unidades activas de ese centro de costo.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Centro de costo</label>
              <input list="centros-costo-lista" value={centroCosto} onChange={e => setCentroCosto(e.target.value)} className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900" />
              <datalist id="centros-costo-lista">
                {centros.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Concepto</label>
              <input value={conceptoCentro} onChange={e => setConceptoCentro(e.target.value)} placeholder="Sueldo técnicos, servicios…" className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900" />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Monto del mes</label>
              <input type="number" value={montoCentro} onChange={e => setMontoCentro(e.target.value)} className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900" />
            </div>
          </div>
          <button type="button" onClick={guardarCostoCentro} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg">Guardar</button>
        </div>
      )}
    </Modal>
  )
}

function FilaFacturadoManual({ unidad, onGuardar }) {
  const [monto, setMonto] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setGuardando(true)
    await onGuardar(unidad.id, monto)
    setGuardando(false)
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span className="text-sm flex-1 truncate">{unidad.patente_serie} — {unidad.descripcion}</span>
      <input type="number" value={monto} onChange={e => setMonto(e.target.value)} placeholder="Monto" className="w-28 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-sm bg-white dark:bg-gray-900" />
      <button type="button" onClick={guardar} disabled={guardando || monto === ''} className="text-xs text-blue-600 hover:underline disabled:opacity-40 shrink-0">Guardar</button>
    </div>
  )
}

function ResultadoNeto({ mes }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)

  function cargar() {
    setError('')
    supabase.rpc('get_resultado_neto', { p_mes: `${mes}-01` }).then(({ data, error }) => {
      if (error) setError(error.message)
      else if (!data?.ok) setError(data?.msg ?? 'No se pudo cargar el resultado neto')
      else setDatos(data)
    })
  }

  useEffect(() => { setDatos(null); cargar() }, [mes])

  function exportar() {
    if (!datos) return
    exportarXlsx(`resultado_neto_${mes}`, datos.unidades, [
      { label: 'Unidad', get: f => f.unidad },
      { label: 'Patente', get: f => f.patente },
      { label: 'Centro de costo', get: f => f.centro_costo },
      { label: 'Facturado', get: f => f.facturado },
      { label: 'Combustible', get: f => f.combustible },
      { label: 'Mantenimiento', get: f => f.mantenimiento },
      { label: 'Anual prorrateado', get: f => f.anual_prorateado },
      { label: 'Sueldo chofer prorrateado', get: f => f.sueldo_chofer_prorateado },
      { label: 'Costo centro prorrateado', get: f => f.costo_centro_prorateado },
      { label: 'Km', get: f => f.km },
      { label: 'Resultado', get: f => f.resultado },
    ])
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">Resultado neto por unidad</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => setModalAbierto(true)} className="text-sm text-blue-600 hover:underline">Cargar datos</button>
          {datos && <button onClick={exportar} className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-lg">↓ Excel</button>}
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!datos && !error && <p className="text-sm text-gray-400">Cargando…</p>}

      {datos && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {datos.unidades.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400 text-center">No hay unidades activas</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                    <th className="px-4 py-3 text-left">Unidad</th>
                    <th className="px-4 py-3 text-left">Centro</th>
                    <th className="px-4 py-3 text-right">Facturado</th>
                    <th className="px-4 py-3 text-right">Combustible</th>
                    <th className="px-4 py-3 text-right">Mantenim.</th>
                    <th className="px-4 py-3 text-right">Anual prorrat.</th>
                    <th className="px-4 py-3 text-right">Chofer prorrat.</th>
                    <th className="px-4 py-3 text-right">Centro prorrat.</th>
                    <th className="px-4 py-3 text-right">Km</th>
                    <th className="px-4 py-3 text-right">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.unidades.map(u => (
                    <tr key={u.id_unidad} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-medium">{u.patente ?? 's/patente'} — {u.unidad}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{u.centro_costo ?? '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(u.facturado)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">{money(u.combustible)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">{money(u.mantenimiento)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">{money(u.anual_prorateado)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">{money(u.sueldo_chofer_prorateado)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">{money(u.costo_centro_prorateado)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">{u.km ?? '—'}</td>
                      <td className={`px-4 py-3 text-right tabular-nums font-semibold ${Number(u.resultado) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{money(u.resultado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {modalAbierto && (
        <CargarDatosCostosModal mes={mes} onClose={() => setModalAbierto(false)} onGuardado={cargar} />
      )}
    </div>
  )
}

function ReporteCostos({ mes }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setDatos(null)
    setError('')
    supabase.rpc('get_reporte_costos', { p_mes: mes }).then(({ data, error }) => {
      if (error) setError(error.message)
      else if (!data?.ok) setError(data?.msg ?? 'No se pudo cargar el reporte')
      else setDatos(data)
    })
  }, [mes])

  function exportar() {
    if (!datos) return
    exportarXlsx(`costos_${mes}`, datos.por_unidad, [
      { label: 'Unidad', get: f => f.unidad },
      { label: 'Patente', get: f => f.patente },
      { label: 'Total', get: f => f.total },
    ])
  }

  const delta = datos ? Number(datos.total) - Number(datos.total_mes_anterior) : 0

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!datos && !error && <p className="text-sm text-gray-400">Cargando…</p>}

      {datos && (
        <>
          <div className="flex justify-end">
            <button
              onClick={exportar}
              className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg transition-colors"
            >
              ↓ Excel
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{money(datos.total)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Costo total del mes</p>
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{money(datos.total_mes_anterior)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Mes anterior</p>
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <p className={`text-2xl font-semibold ${delta > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {delta > 0 ? '+' : ''}{money(delta)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Variación</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <TablaReporte titulo="Por centro de costo" filas={datos.por_centro} columnas={{ etiqueta: f => f.centro }} />
            <TablaReporte titulo="Por tipo de costo" filas={datos.por_tipo} columnas={{ etiqueta: f => f.tipo }} />
          </div>

          <TablaReporte titulo="Por unidad" filas={datos.por_unidad} columnas={{ etiqueta: f => `${f.patente ?? 's/patente'} — ${f.unidad}` }} />

          <ResultadoNeto mes={mes} />
        </>
      )}
    </div>
  )
}

function ReporteTecnicos({ mes }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setDatos(null)
    setError('')
    supabase.rpc('get_reporte_tecnicos', { p_mes: mes }).then(({ data, error }) => {
      if (error) setError(error.message)
      else if (!data?.ok) setError(data?.msg ?? 'No se pudo cargar el reporte')
      else setDatos(data)
    })
  }, [mes])

  function exportar() {
    if (!datos) return
    exportarXlsx(`tecnicos_${mes}`, datos.tecnicos, [
      { label: 'Técnico', get: t => t.nombre },
      { label: 'Especialidad', get: t => t.especialidad },
      { label: 'Tareas completadas', get: t => t.tareas_completadas },
      { label: 'Horas estimadas', get: t => t.horas_estimadas },
      { label: 'Horas reales', get: t => t.horas_reales },
      { label: 'Novedades reportadas', get: t => t.novedades_reportadas },
      { label: 'Tareas pendientes ahora', get: t => t.tareas_pendientes_ahora },
    ])
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!datos && !error && <p className="text-sm text-gray-400">Cargando…</p>}

      {datos && (
        <>
          <div className="flex justify-end">
            <button
              onClick={exportar}
              className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg transition-colors"
            >
              ↓ Excel
            </button>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {datos.tecnicos.length === 0 ? (
              <p className="px-5 py-8 text-sm text-gray-400 text-center">No hay técnicos cargados</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                      <th className="px-5 py-3 text-left">Técnico</th>
                      <th className="px-5 py-3 text-left">Especialidad</th>
                      <th className="px-5 py-3 text-right">Tareas completadas</th>
                      <th className="px-5 py-3 text-right">Hs. estimadas</th>
                      <th className="px-5 py-3 text-right">Hs. reales</th>
                      <th className="px-5 py-3 text-right">Novedades reportadas</th>
                      <th className="px-5 py-3 text-right">Pendientes ahora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.tecnicos.map(t => (
                      <tr key={t.id} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="px-5 py-3 text-gray-900 dark:text-gray-100 font-medium">{t.nombre}</td>
                        <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{t.especialidad ?? '—'}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{t.tareas_completadas}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">{t.horas_estimadas}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">{t.horas_reales}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{t.novedades_reportadas}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-amber-600 dark:text-amber-400">{t.tareas_pendientes_ahora}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function PanelTecnicos({ mes }) {
  const [tecnicos, setTecnicos] = useState([])
  const [centros, setCentros] = useState([])
  const [ciudades, setCiudades] = useState([])
  const [filtroTecnicos, setFiltroTecnicos] = useState([])
  const [filtroCentro, setFiltroCentro] = useState('')
  const [filtroCiudad, setFiltroCiudad] = useState('')
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('usuarios').select('id, nombre').eq('rol', 'tecnico').eq('activo', true).order('nombre')
      .then(({ data }) => setTecnicos(data || []))
    supabase.from('unidades').select('centro_costo, ciudad').eq('activo', true)
      .then(({ data }) => {
        setCentros([...new Set((data || []).map(u => u.centro_costo).filter(Boolean))].sort())
        setCiudades([...new Set((data || []).map(u => u.ciudad).filter(Boolean))].sort())
      })
  }, [])

  useEffect(() => {
    setDatos(null)
    setError('')
    supabase.rpc('get_panel_tecnicos', {
      p_mes: mes,
      p_tecnicos: filtroTecnicos.length > 0 ? filtroTecnicos : null,
      p_centro_costo: filtroCentro || null,
      p_ciudad: filtroCiudad || null,
    }).then(({ data, error }) => {
      if (error) setError(error.message)
      else if (!data?.ok) setError(data?.msg ?? 'No se pudo cargar el panel')
      else setDatos(data)
    })
  }, [mes, filtroTecnicos, filtroCentro, filtroCiudad])

  const nombrePorTecnico = Object.fromEntries(tecnicos.map(t => [t.id, t.nombre]))

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-wrap gap-3">
        <MultiSelectFiltro label="Técnico" opciones={tecnicos.map(t => t.id)} seleccionados={filtroTecnicos} onChange={setFiltroTecnicos} etiquetas={nombrePorTecnico} soloEtiqueta />
        <select aria-label="Filtrar por centro de costo" value={filtroCentro} onChange={e => setFiltroCentro(e.target.value)}
          className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos los centros de costo</option>
          {centros.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select aria-label="Filtrar por ciudad" value={filtroCiudad} onChange={e => setFiltroCiudad(e.target.value)}
          className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todas las ciudades</option>
          {ciudades.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!datos && !error && <p className="text-sm text-gray-400">Cargando…</p>}

      {datos && (
        <>
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Técnico — tareas completadas</h2>
              <div className="max-h-72 overflow-y-auto">
                {datos.tecnicos.length === 0 ? <p className="text-sm text-gray-400">Sin datos</p> : (
                  <table className="w-full text-sm">
                    <tbody>
                      {datos.tecnicos.map(t => (
                        <tr key={t.id} className="border-t border-gray-100 dark:border-gray-800 first:border-t-0">
                          <td className="py-2 text-gray-700 dark:text-gray-300">{t.nombre}</td>
                          <td className="py-2 text-right font-medium text-gray-900 dark:text-gray-100 tabular-nums">{t.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Eficiencia (horas reales vs. estimadas)</h2>
              <Donut datos={datos.por_eficiencia} valueKey="cantidad" labelKey="label" />
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Por tipo de OT</h2>
              <Donut datos={datos.por_tipo_ot} valueKey="cantidad" labelKey="tipo" hueco />
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Por tipo de unidad</h2>
              <BarrasHorizontales datos={datos.por_tipo_unidad} valueKey="cantidad" labelKey="tipo_unidad" />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Por sistema</h2>
            <Donut datos={datos.por_sistema} valueKey="cantidad" labelKey="sistema" />
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 px-5 pt-4">Detalle</h2>
            {datos.detalle.length === 0 ? (
              <p className="px-5 py-8 text-sm text-gray-400 text-center">Sin datos</p>
            ) : (
              <div className="overflow-x-auto mt-2 max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900">
                    <tr className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                      <th className="px-5 py-3 text-left">Técnico</th>
                      <th className="px-5 py-3 text-left">Tipo unidad</th>
                      <th className="px-5 py-3 text-left">Trabajo</th>
                      <th className="px-5 py-3 text-left">Sistema</th>
                      <th className="px-5 py-3 text-right">Hs. reales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.detalle.map((d, i) => (
                      <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="px-5 py-3 text-gray-900 dark:text-gray-100 font-medium">{d.tecnico}</td>
                        <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{d.tipo_unidad}</td>
                        <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{d.trabajo}</td>
                        <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{d.sistema}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">{d.horas_reales ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function GestionOt({ mes }) {
  const [creadores, setCreadores] = useState([])
  const [filtroCreadores, setFiltroCreadores] = useState([])
  const [filtroEstados, setFiltroEstados] = useState([])
  const [filtroCondiciones, setFiltroCondiciones] = useState([])
  const [filtroTipos, setFiltroTipos] = useState([])
  const [filtroPrioridades, setFiltroPrioridades] = useState([])
  const [filtroProveedores, setFiltroProveedores] = useState([])
  const [filtroMotivos, setFiltroMotivos] = useState([])
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('usuarios').select('id, nombre').in('rol', ['administrador', 'supervisor']).eq('activo', true).order('nombre')
      .then(({ data }) => setCreadores(data || []))
  }, [])

  useEffect(() => {
    setDatos(null)
    setError('')
    supabase.rpc('get_gestion_ot', {
      p_mes: mes,
      p_creadores: filtroCreadores.length > 0 ? filtroCreadores : null,
      p_estados: filtroEstados.length > 0 ? filtroEstados : null,
      p_condiciones: filtroCondiciones.length > 0 ? filtroCondiciones : null,
      p_tipos: filtroTipos.length > 0 ? filtroTipos : null,
      p_prioridades: filtroPrioridades.length > 0 ? filtroPrioridades : null,
      p_proveedores: filtroProveedores.length > 0 ? filtroProveedores : null,
      p_motivos: filtroMotivos.length > 0 ? filtroMotivos : null,
    }).then(({ data, error }) => {
      if (error) setError(error.message)
      else if (!data?.ok) setError(data?.msg ?? 'No se pudo cargar el reporte')
      else setDatos(data)
    })
  }, [mes, filtroCreadores, filtroEstados, filtroCondiciones, filtroTipos, filtroPrioridades, filtroProveedores, filtroMotivos])

  const nombrePorCreador = Object.fromEntries(creadores.map(c => [c.id, c.nombre]))

  function toggle(valor, arr, setter) {
    setter(arr.includes(valor) ? arr.filter(v => v !== valor) : [...arr, valor])
  }

  function limpiarFiltros() {
    setFiltroCreadores([]); setFiltroEstados([]); setFiltroCondiciones([])
    setFiltroTipos([]); setFiltroPrioridades([]); setFiltroProveedores([]); setFiltroMotivos([])
  }

  const hayFiltrosCruzados = filtroEstados.length + filtroCondiciones.length + filtroTipos.length
    + filtroPrioridades.length + filtroProveedores.length + filtroMotivos.length > 0

  function exportar() {
    if (!datos) return
    exportarXlsx(`gestion_ot_${mes}`, datos.detalle, [
      { label: 'N° OT', get: d => d.numero_ot },
      { label: 'Fecha de creación', get: d => new Date(d.fecha_apertura).toLocaleDateString() },
      { label: 'Creado por', get: d => d.creador },
      { label: 'Motivo de ingreso', get: d => d.motivo_ingreso },
    ])
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-wrap items-center gap-3">
        <MultiSelectFiltro label="Creado por" opciones={creadores.map(c => c.id)} seleccionados={filtroCreadores} onChange={setFiltroCreadores} etiquetas={nombrePorCreador} soloEtiqueta />
        {hayFiltrosCruzados && (
          <button onClick={limpiarFiltros} className="text-xs text-blue-600 hover:underline">
            Limpiar filtros de gráficos y tablas ({filtroEstados.length + filtroCondiciones.length + filtroTipos.length + filtroPrioridades.length + filtroProveedores.length + filtroMotivos.length})
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!datos && !error && <p className="text-sm text-gray-400">Cargando…</p>}
      {datos && (
      <>
      <p className="text-xs text-gray-400 dark:text-gray-500">💡 Tocá cualquier gráfico, barra o fila de una tabla para filtrar el resto del panel.</p>
      <div className="flex items-center justify-between">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{datos.total_ot}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">OT generadas este mes</p>
        </div>
        <button
          onClick={exportar}
          className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg transition-colors"
        >
          ↓ Excel
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Estado de la OT</h2>
          <Donut datos={datos.por_estado} valueKey="cantidad" labelKey="estado" hueco
            seleccionados={filtroEstados} onToggle={v => toggle(v, filtroEstados, setFiltroEstados)} />
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Condición de cierre</h2>
          <Donut datos={datos.por_condicion_cierre} valueKey="cantidad" labelKey="condicion"
            seleccionados={filtroCondiciones} onToggle={v => toggle(v, filtroCondiciones, setFiltroCondiciones)} />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Por tipo de OT</h2>
          <BarrasHorizontales datos={datos.por_tipo} valueKey="cantidad" labelKey="tipo"
            seleccionados={filtroTipos} onToggle={v => toggle(v, filtroTipos, setFiltroTipos)} />
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Por prioridad</h2>
          <BarrasHorizontales datos={datos.por_prioridad} valueKey="cantidad" labelKey="prioridad"
            seleccionados={filtroPrioridades} onToggle={v => toggle(v, filtroPrioridades, setFiltroPrioridades)} />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <ListaClic
          titulo="Creado por"
          filas={datos.por_creador.map(f => ({ label: f.nombre, cantidad: f.cantidad, valor: f.id }))}
          seleccionados={filtroCreadores} onToggle={v => toggle(v, filtroCreadores, setFiltroCreadores)}
        />
        <ListaClic
          titulo="Proveedor"
          filas={datos.por_proveedor.map(f => ({ label: f.proveedor, cantidad: f.cantidad, valor: f.id }))}
          seleccionados={filtroProveedores} onToggle={v => toggle(v, filtroProveedores, setFiltroProveedores)}
        />
      </div>

      <ListaClic
        titulo="Motivo de pausa"
        filas={datos.por_motivo_pausa.map(f => ({ label: f.motivo, cantidad: f.cantidad, valor: f.motivo }))}
        seleccionados={filtroMotivos} onToggle={v => toggle(v, filtroMotivos, setFiltroMotivos)}
      />

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 px-5 pt-4">Detalle</h2>
        {datos.detalle.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">Sin datos</p>
        ) : (
          <div className="overflow-x-auto mt-2 max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900">
                <tr className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                  <th className="px-5 py-3 text-left">N° OT</th>
                  <th className="px-5 py-3 text-left">Fecha de creación</th>
                  <th className="px-5 py-3 text-left">Creado por</th>
                  <th className="px-5 py-3 text-left">Motivo de ingreso</th>
                </tr>
              </thead>
              <tbody>
                {datos.detalle.map((d, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-5 py-3 text-gray-900 dark:text-gray-100 font-medium">{d.numero_ot}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{new Date(d.fecha_apertura).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{d.creador}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{d.motivo_ingreso}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  )
}

export default function Reportes() {
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7))
  const [tab, setTab] = useState('costos')

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-base font-medium text-gray-900 dark:text-gray-100">Reportes</h1>
        <input
          type="month"
          value={mes}
          onChange={e => setMes(e.target.value)}
          className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="px-6 pt-4 flex gap-1 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setTab('costos')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'costos' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          Costos
        </button>
        <button
          onClick={() => setTab('tecnicos')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'tecnicos' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          Técnicos
        </button>
        <button
          onClick={() => setTab('gestion_ot')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'gestion_ot' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          Gestión OT
        </button>
      </div>

      <div className="p-6">
        {tab === 'costos' && <ReporteCostos mes={mes} />}
        {tab === 'gestion_ot' && <GestionOt mes={mes} />}
        {tab === 'tecnicos' && (
          <div className="space-y-6">
            <ReporteTecnicos mes={mes} />
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 pt-2 border-t border-gray-200 dark:border-gray-700">Panel visual</h2>
              <PanelTecnicos mes={mes} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
