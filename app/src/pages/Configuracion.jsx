import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { exportarXlsx } from '../lib/exportarXlsx'
import { parseCsv } from '../lib/importarCsv'
import { parseXlsx } from '../lib/importarXlsx'
import SelectConfig from '../components/SelectConfig'
import ConfirmModal from '../components/ConfirmModal'

// --- Parámetros generales (valores sueltos, no listas) -----------------
const PARAMS = [
  { clave: 'nombre_empresa', label: 'Nombre empresa' },
  { clave: 'mail_remitente', label: 'Mail remitente' },
  { clave: 'whatsapp_admin', label: 'WhatsApp admin (con código país)' },
]

function ParametrosGenerales({ empresaId, valores, onChange }) {
  async function guardar(clave, valor) {
    await supabase.from('configuracion').upsert({ empresa_id: empresaId, seccion: 'parametros', clave, valor })
    onChange()
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Parámetros Generales</h2>
      <div className="grid grid-cols-2 gap-3">
        {PARAMS.map(p => (
          <div key={p.clave}>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">{p.label}</label>
            <input
              defaultValue={valores[p.clave] || ''}
              onBlur={e => guardar(p.clave, e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function ToggleUsarSecuencias({ empresaId, activo, onChange }) {
  async function guardar(e) {
    await supabase.from('configuracion').upsert({ empresa_id: empresaId, seccion: 'parametros', clave: 'usar_secuencias', valor: String(e.target.checked) })
    onChange()
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={activo} onChange={guardar} className="mt-0.5" />
        <span>
          <span className="font-medium text-gray-900 dark:text-gray-100">Usar Secuencias</span>
          <span className="block text-xs text-gray-400 mt-0.5">
            Muestra "Secuencias" en el menú — plantillas de checklist + tareas + repuestos para aplicar al crear una OT. Función en evaluación, desactivada por defecto.
          </span>
        </span>
      </label>
    </div>
  )
}

// --- Tabla Código + Descripción (Centros de Costo, Tipos de Unidad, Ciudades) ---
function TablaCodigoDescripcion({ titulo, seccion, empresaId, filas, onChange }) {
  const [filaEliminar, setFilaEliminar] = useState(null)

  async function agregar() {
    let codigo = ''
    let n = 1
    do { codigo = `NUEVO_${n}`; n++ } while (filas.some(f => f.clave === codigo))
    await supabase.from('configuracion').insert({ empresa_id: empresaId, seccion, clave: codigo, valor: '' })
    onChange()
  }

  async function actualizarDescripcion(fila, valor) {
    await supabase.from('configuracion').update({ valor })
      .eq('empresa_id', empresaId).eq('seccion', seccion).eq('clave', fila.clave)
    onChange()
  }

  async function actualizarCodigo(fila, nuevoCodigo) {
    nuevoCodigo = nuevoCodigo.trim()
    if (!nuevoCodigo || nuevoCodigo === fila.clave) return
    await supabase.from('configuracion').delete()
      .eq('empresa_id', empresaId).eq('seccion', seccion).eq('clave', fila.clave)
    await supabase.from('configuracion').insert({ empresa_id: empresaId, seccion, clave: nuevoCodigo, valor: fila.valor })
    onChange()
  }

  async function eliminar() {
    const { error } = await supabase.from('configuracion').delete()
      .eq('empresa_id', empresaId).eq('seccion', seccion).eq('clave', filaEliminar.clave)
    if (error) throw error
    setFilaEliminar(null)
    onChange()
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">{titulo}</h2>
        <button onClick={agregar} className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700">+ Agregar</button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-400 dark:text-gray-500 font-medium">
            <th className="px-4 py-2 text-left w-40">Código</th>
            <th className="px-4 py-2 text-left">Descripción</th>
            <th className="px-4 py-2 w-10"></th>
          </tr>
        </thead>
        <tbody>
          {filas.map(f => (
            <tr key={f.clave} className="border-t border-gray-100 dark:border-gray-800">
              <td className="px-4 py-2">
                <input defaultValue={f.clave} onBlur={e => actualizarCodigo(f, e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-sm" />
              </td>
              <td className="px-4 py-2">
                <input defaultValue={f.valor || ''} onBlur={e => actualizarDescripcion(f, e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-sm" />
              </td>
              <td className="px-4 py-2 text-right">
                <button onClick={() => setFilaEliminar(f)} aria-label={`Eliminar ${f.clave}`} className="bg-red-500 hover:bg-red-600 text-white text-xs w-6 h-6 rounded">✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {filaEliminar && (
        <ConfirmModal
          titulo="Eliminar"
          mensaje={`¿Eliminar "${filaEliminar.clave}"?`}
          textoBoton="Eliminar"
          onConfirm={eliminar}
          onClose={() => setFilaEliminar(null)}
        />
      )}
    </div>
  )
}

// --- Tabla de una sola columna (Tipos de Novedad, Tipos de Documento, etc.) ---
function TablaSimple({ titulo, columna, seccion, empresaId, filas, onChange }) {
  const [filaEliminar, setFilaEliminar] = useState(null)

  async function agregar() {
    let clave = ''
    let n = 1
    do { clave = `Nuevo ${n}`; n++ } while (filas.some(f => f.clave === clave))
    await supabase.from('configuracion').insert({ empresa_id: empresaId, seccion, clave, valor: clave })
    onChange()
  }

  async function actualizar(fila, nuevoValor) {
    nuevoValor = nuevoValor.trim()
    if (!nuevoValor || nuevoValor === fila.clave) return
    await supabase.from('configuracion').delete()
      .eq('empresa_id', empresaId).eq('seccion', seccion).eq('clave', fila.clave)
    await supabase.from('configuracion').insert({ empresa_id: empresaId, seccion, clave: nuevoValor, valor: nuevoValor })
    onChange()
  }

  async function eliminar() {
    const { error } = await supabase.from('configuracion').delete()
      .eq('empresa_id', empresaId).eq('seccion', seccion).eq('clave', filaEliminar.clave)
    if (error) throw error
    setFilaEliminar(null)
    onChange()
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">{titulo}</h2>
        <button onClick={agregar} className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700">+ Agregar</button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-400 dark:text-gray-500 font-medium">
            <th className="px-4 py-2 text-left">{columna}</th>
            <th className="px-4 py-2 w-10"></th>
          </tr>
        </thead>
        <tbody>
          {filas.map(f => (
            <tr key={f.clave} className="border-t border-gray-100 dark:border-gray-800">
              <td className="px-4 py-2">
                <input defaultValue={f.clave} onBlur={e => actualizar(f, e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-sm" />
              </td>
              <td className="px-4 py-2 text-right">
                <button onClick={() => setFilaEliminar(f)} aria-label={`Eliminar ${f.clave}`} className="bg-red-500 hover:bg-red-600 text-white text-xs w-6 h-6 rounded">✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {filaEliminar && (
        <ConfirmModal
          titulo="Eliminar"
          mensaje={`¿Eliminar "${filaEliminar.clave}"?`}
          textoBoton="Eliminar"
          onConfirm={eliminar}
          onClose={() => setFilaEliminar(null)}
        />
      )}
    </div>
  )
}

// --- Días de alerta de vencimiento, por tipo de documento (default: 30) ---
function AlertasDocumentos({ empresaId, tiposDocumento, alertas, onChange }) {
  async function guardar(tipo, dias) {
    dias = Number(dias)
    if (!dias || dias <= 0) return
    await supabase.from('configuracion').upsert({ empresa_id: empresaId, seccion: 'alertas_dias_documento', clave: tipo, valor: String(dias) })
    onChange()
  }

  if (tiposDocumento.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Alertas de vencimiento</h2>
        <p className="text-xs text-gray-400">Cargá primero "Tipos de Documento" en la pestaña General.</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-3">
        <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">Alertas de vencimiento</h2>
        <p className="text-xs text-gray-400 mt-0.5">Días antes del vencimiento en que un documento pasa a "Por vencer".</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-400 dark:text-gray-500 font-medium">
            <th className="px-4 py-2 text-left">Tipo de documento</th>
            <th className="px-4 py-2 text-left w-32">Días de alerta</th>
          </tr>
        </thead>
        <tbody>
          {tiposDocumento.map(tipo => (
            <tr key={tipo} className="border-t border-gray-100 dark:border-gray-800">
              <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{tipo}</td>
              <td className="px-4 py-2">
                <input type="number" min="1" defaultValue={alertas[tipo] || '30'} onBlur={e => guardar(tipo, e.target.value)}
                  className="w-24 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-sm" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// --- Plazos de alerta de rutinas (cuándo una rutina pasa a "Próxima") ---
const ALERTAS_RUTINAS = [
  { clave: 'dias', label: 'Rutinas por días', sufijo: 'días antes', defecto: '7' },
  { clave: 'km_pct', label: 'Rutinas por km', sufijo: '% del intervalo antes', defecto: '10' },
  { clave: 'hs_pct', label: 'Rutinas por horas', sufijo: '% del intervalo antes', defecto: '10' },
]

function AlertasRutinas({ empresaId, valores, onChange }) {
  async function guardar(clave, valor) {
    valor = Number(valor)
    if (!valor || valor <= 0) return
    await supabase.from('configuracion').upsert({ empresa_id: empresaId, seccion: 'alertas_rutinas', clave, valor: String(valor) })
    onChange()
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-3">
        <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">Alertas de vencimiento de Rutinas</h2>
        <p className="text-xs text-gray-400 mt-0.5">Con cuánta anticipación una rutina pasa a estado "Próxima" antes de vencer.</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-400 dark:text-gray-500 font-medium">
            <th className="px-4 py-2 text-left">Tipo de rutina</th>
            <th className="px-4 py-2 text-left w-40">Anticipación</th>
          </tr>
        </thead>
        <tbody>
          {ALERTAS_RUTINAS.map(a => (
            <tr key={a.clave} className="border-t border-gray-100 dark:border-gray-800">
              <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{a.label}</td>
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <input type="number" min="1" defaultValue={valores[a.clave] || a.defecto} onBlur={e => guardar(a.clave, e.target.value)}
                    className="w-20 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-sm" />
                  <span className="text-xs text-gray-400 whitespace-nowrap">{a.sufijo}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// --- Catálogo de trabajos (tabla propia, no configuracion genérica) ---
function CatalogoTrabajos() {
  const [trabajos, setTrabajos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formAbierto, setFormAbierto] = useState(false)
  const [form, setForm] = useState({ categoria: '', descripcion: '', tiempo_estimado_hs: '1' })
  const [trabajoEliminar, setTrabajoEliminar] = useState(null)

  async function cargar() {
    setLoading(true)
    const { data } = await supabase.from('catalogo_trabajos')
      .select('*, usuarios:usuario_alta (nombre)').eq('activo', true).order('categoria').order('descripcion')
    setTrabajos(data || [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  async function cargarCatalogoEstandar() {
    setError('')
    const { data, error } = await supabase.rpc('seed_catalogo_trabajos')
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data.msg); return }
    cargar()
  }

  async function agregar(e) {
    e.preventDefault()
    if (!form.categoria || !form.descripcion.trim()) return
    setError('')
    const { data, error } = await supabase.rpc('agregar_trabajo_catalogo', {
      p_categoria: form.categoria,
      p_descripcion: form.descripcion.trim(),
      p_tiempo_estimado_hs: Number(form.tiempo_estimado_hs) || null,
    })
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data.msg); return }
    setForm({ categoria: '', descripcion: '', tiempo_estimado_hs: '1' })
    setFormAbierto(false)
    cargar()
  }

  async function eliminar() {
    const { error } = await supabase.from('catalogo_trabajos').update({ activo: false }).eq('id', trabajoEliminar.id)
    if (error) throw error
    setTrabajoEliminar(null)
    cargar()
  }

  function exportar() {
    exportarXlsx('catalogo_trabajos', trabajos, [
      { label: 'Categoría', get: t => t.categoria },
      { label: 'Descripción', get: t => t.descripcion },
      { label: 'Tiempo estimado (hs)', get: t => t.tiempo_estimado_hs },
    ])
  }

  async function importar(e) {
    const archivo = e.target.files[0]
    e.target.value = ''
    if (!archivo) return
    const filas = archivo.name.toLowerCase().endsWith('.csv')
      ? parseCsv(await archivo.text())
      : await parseXlsx(await archivo.arrayBuffer())
    setError('')
    let cargados = 0
    let omitidos = 0
    for (const fila of filas) {
      const categoria = fila['Categoría'] || fila['Categoria']
      const descripcion = fila['Descripción'] || fila['Descripcion']
      const horas = Number(fila['Tiempo estimado (hs)']) || null
      if (!categoria?.trim() || !descripcion?.trim()) { omitidos++; continue }
      const { data } = await supabase.rpc('agregar_trabajo_catalogo', {
        p_categoria: categoria.trim(), p_descripcion: descripcion.trim(), p_tiempo_estimado_hs: horas,
      })
      if (data?.ok) cargados++; else omitidos++
    }
    setError(`Importados: ${cargados}. Omitidos (duplicados o inválidos): ${omitidos}.`)
    cargar()
  }

  const porCategoria = trabajos.reduce((acc, t) => { (acc[t.categoria] ??= []).push(t); return acc }, {})

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">Catálogo de Trabajos</h2>
        <div className="flex gap-2">
          {trabajos.length === 0 && (
            <button onClick={cargarCatalogoEstandar} className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700">
              Cargar catálogo estándar (47 trabajos)
            </button>
          )}
          <button onClick={exportar} className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700">↓ Excel</button>
          <label className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
            ↑ Importar
            <input type="file" accept=".xlsx,.csv" onChange={importar} className="hidden" />
          </label>
          <button onClick={() => setFormAbierto(v => !v)} className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700">+ Agregar</button>
        </div>
      </div>

      {formAbierto && (
        <form onSubmit={agregar} className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-end gap-2">
          <div className="w-40">
            <SelectConfig label="Categoría" seccion="categorias_trabajo" value={form.categoria} onChange={v => setForm(f => ({ ...f, categoria: v }))} dosColumnas={false} required />
          </div>
          <div className="flex-1 min-w-48">
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Descripción</label>
            <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm" required />
          </div>
          <div className="w-28">
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tiempo (hs)</label>
            <input type="number" step="0.25" value={form.tiempo_estimado_hs} onChange={e => setForm(f => ({ ...f, tiempo_estimado_hs: e.target.value }))}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <button type="submit" className="text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5">Guardar</button>
        </form>
      )}

      {error && <p className="px-4 py-2 text-xs text-red-600 dark:text-red-400 border-t border-gray-100 dark:border-gray-800">{error}</p>}
      {loading ? (
        <p className="px-4 py-4 text-sm text-gray-400">Cargando…</p>
      ) : trabajos.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-400">Sin trabajos cargados — usá "Cargar catálogo estándar" o agregalos a mano.</p>
      ) : (
        Object.entries(porCategoria).map(([categoria, items]) => (
          <div key={categoria} className="border-t border-gray-100 dark:border-gray-800">
            <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 text-xs font-medium text-gray-500 dark:text-gray-400">{categoria}</div>
            {items.map(t => (
              <div key={t.id} className="flex items-center justify-between px-4 py-2 border-t border-gray-100 dark:border-gray-800 text-sm">
                <div>
                  <span className="text-gray-700 dark:text-gray-300">{t.descripcion}</span>
                  <div className="text-xs text-gray-400">
                    {t.usuarios?.nombre ?? '—'} · {t.fecha_alta ? new Date(t.fecha_alta).toLocaleDateString() : '—'}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 tabular-nums">{t.tiempo_estimado_hs} hs</span>
                  <button onClick={() => setTrabajoEliminar(t)} className="text-xs text-red-500">Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        ))
      )}

      {trabajoEliminar && (
        <ConfirmModal
          titulo="Eliminar trabajo del catálogo"
          mensaje={`¿Eliminar "${trabajoEliminar.descripcion}"?`}
          textoBoton="Eliminar"
          onConfirm={eliminar}
          onClose={() => setTrabajoEliminar(null)}
        />
      )}
    </div>
  )
}

const TABS = ['General', 'Técnicos', 'Catálogo']

export default function Configuracion({ usuario }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('General')

  const esAdmin = usuario?.rol === 'administrador'

  async function cargar() {
    setLoading(true)
    const { data } = await supabase.from('configuracion').select('*').order('seccion').order('clave')
    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  const porSeccion = seccion => items.filter(i => i.seccion === seccion)
  const parametros = Object.fromEntries(porSeccion('parametros').map(p => [p.clave, p.valor]))

  if (!esAdmin) return <p className="p-6 text-sm text-gray-400">Solo el administrador puede ver la configuración.</p>
  // Solo bloquea toda la página en la carga inicial (sin datos todavía).
  // Los refrescos posteriores (después de editar un campo) no deben
  // desmontar la página entera — eso era lo que hacía "pestañear" la
  // pantalla y perder el scroll en cada edición.
  if (loading && items.length === 0) return <p className="p-6 text-sm text-gray-400">Cargando...</p>

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <h1 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-3">Configuración</h1>
        <div className="flex gap-2">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-sm px-3 py-1.5 rounded-lg ${tab === t
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 max-w-3xl space-y-6">
        {tab === 'General' && (
          <>
            <ParametrosGenerales empresaId={usuario.empresa_id} valores={parametros} onChange={cargar} />
            <ToggleUsarSecuencias empresaId={usuario.empresa_id} activo={parametros.usar_secuencias === 'true'} onChange={cargar} />
            <TablaCodigoDescripcion titulo="Centros de Costo" seccion="centros_costo" empresaId={usuario.empresa_id} filas={porSeccion('centros_costo')} onChange={cargar} />
            <TablaCodigoDescripcion titulo="Tipos de Unidad" seccion="tipos_unidad" empresaId={usuario.empresa_id} filas={porSeccion('tipos_unidad')} onChange={cargar} />
            <TablaCodigoDescripcion titulo="Ciudades" seccion="ciudades" empresaId={usuario.empresa_id} filas={porSeccion('ciudades')} onChange={cargar} />
            <TablaSimple titulo="Tipos de Misión" columna="Descripción" seccion="tipos_mision" empresaId={usuario.empresa_id} filas={porSeccion('tipos_mision')} onChange={cargar} />
            <TablaSimple titulo="Tipos de Novedad" columna="Descripción" seccion="tipos_novedad" empresaId={usuario.empresa_id} filas={porSeccion('tipos_novedad')} onChange={cargar} />
            <TablaSimple titulo="Motivos de Pausa" columna="Motivo" seccion="motivos_pausa" empresaId={usuario.empresa_id} filas={porSeccion('motivos_pausa')} onChange={cargar} />
            <TablaSimple titulo="Tipos de Documento (Unidades)" columna="Tipo de documento" seccion="tipos_documento" empresaId={usuario.empresa_id} filas={porSeccion('tipos_documento')} onChange={cargar} />
            <AlertasDocumentos
              empresaId={usuario.empresa_id}
              tiposDocumento={porSeccion('tipos_documento').map(f => f.clave)}
              alertas={Object.fromEntries(porSeccion('alertas_dias_documento').map(f => [f.clave, f.valor]))}
              onChange={cargar}
            />
            <AlertasRutinas
              empresaId={usuario.empresa_id}
              valores={Object.fromEntries(porSeccion('alertas_rutinas').map(f => [f.clave, f.valor]))}
              onChange={cargar}
            />
          </>
        )}

        {tab === 'Técnicos' && (
          <TablaSimple titulo="Especialidades de Técnicos" columna="Especialidad" seccion="especialidades_tecnico" empresaId={usuario.empresa_id} filas={porSeccion('especialidades_tecnico')} onChange={cargar} />
        )}

        {tab === 'Catálogo' && (
          <>
            <CatalogoTrabajos />
            <TablaSimple titulo="Unidades de Medida (Stock)" columna="Descripción" seccion="unidades_medida" empresaId={usuario.empresa_id} filas={porSeccion('unidades_medida')} onChange={cargar} />
          </>
        )}
      </div>
    </div>
  )
}
