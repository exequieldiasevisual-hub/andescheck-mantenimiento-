import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { obtenerOpciones } from '../lib/configuracion'
import { exportarXlsx } from '../lib/exportarXlsx'
import MultiSelectFiltro from '../components/MultiSelectFiltro'
import OtModal from '../components/OtModal'
import MotivoModal from '../components/MotivoModal'

const ESTADOS_ABIERTOS = ['Abierta', 'En_Curso']
const TIPOS_OT = ['Correctivo', 'Preventivo', 'Predictivo']

const BADGE_ESTADO = {
  Abierta: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  En_Curso: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  Vencida: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  Cerrada: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  Cerrada_Vencida: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  Anulada: 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
}

function OtCard({ ot, puedeGestionar, abrirDetalle, onAnular }) {
  const total = ot.tareas_total || 0
  const hecho = ot.tareas_completadas || 0
  const pct = total > 0 ? Math.round((hecho / total) * 100) : null
  const estado = ot.estado_calculado
  const colorBar = ot.listo_cierre ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-blue-500'
  const puedeVerProgreso = puedeGestionar && pct !== null

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl border-l-4 border border-gray-200 dark:border-gray-700 p-4 ${ot.listo_cierre ? 'border-l-emerald-500' : estado === 'Vencida' ? 'border-l-red-500' : 'border-l-blue-500'}`}>
      <p className="text-xs text-gray-400">{ot.numero_ot}</p>
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">{ot.descripcion || '(sin descripción)'}</p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
        <span>🚗 {ot.unidad_descripcion} {ot.unidad_patente ? `— ${ot.unidad_patente}` : ''}</span>
        <span className={`px-2 py-0.5 rounded-full font-medium ${BADGE_ESTADO[estado] ?? ''}`}>{estado}</span>
        <span>📅 {new Date(ot.fecha_apertura).toLocaleDateString()}</span>
        {ot.tipo && <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700">{ot.tipo}</span>}
        {ot.listo_cierre && <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-medium">✅ Cierre técnico</span>}
      </div>
      {puedeVerProgreso && (
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1">
            <span className={ot.listo_cierre ? 'text-emerald-600' : 'text-gray-500 dark:text-gray-400'}>{ot.listo_cierre ? '✅ ' : ''}{hecho}/{total} tareas</span>
            <span className="font-semibold text-gray-700 dark:text-gray-300">{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div className={`h-full rounded-full ${colorBar}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => abrirDetalle(ot.id)} className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700">Ver detalle</button>
        {puedeGestionar && ESTADOS_ABIERTOS.includes(ot.estado) && (
          <button onClick={() => onAnular(ot.id)} className="text-xs text-red-500 dark:text-red-400 rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700">Anular</button>
        )}
      </div>
    </div>
  )
}

export default function Ot({ usuario, abrirDetalle }) {
  const [ots, setOts] = useState([])
  const [unidades, setUnidades] = useState([])
  const [secuencias, setSecuencias] = useState([])
  const [tecnicos, setTecnicos] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [centrosCosto, setCentrosCosto] = useState([])
  const [tiposUnidad, setTiposUnidad] = useState([])
  const [ciudades, setCiudades] = useState([])
  const [etiquetasConfig, setEtiquetasConfig] = useState({ centros_costo: {}, tipos_unidad: {}, ciudades: {} })
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('abiertas')
  const [filtroTipo, setFiltroTipo] = useState([])
  const [filtroUnidad, setFiltroUnidad] = useState('')
  const [filtroCentroCosto, setFiltroCentroCosto] = useState([])
  const [filtroTipoUnidad, setFiltroTipoUnidad] = useState([])
  const [filtroCiudad, setFiltroCiudad] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [accionError, setAccionError] = useState('')
  const [idOtAnular, setIdOtAnular] = useState(null)

  const puedeGestionar = ['administrador', 'supervisor'].includes(usuario?.rol)
  const esTecnico = usuario?.rol === 'tecnico'

  async function cargar() {
    setLoading(true)
    // ot_lista trae progreso de tareas + estado calculado (Vencida) + datos de unidad
    let query = supabase.from('ot_lista').select('*').order('fecha_apertura', { ascending: false })
    if (esTecnico) {
      // El técnico ve una OT si está asignado a nivel de OT completa, o si
      // tiene al menos una tarea puntual asignada dentro de esa OT.
      const { data: tareasAsignadas } = await supabase.from('ot_tareas').select('id_ot').contains('tecnicos_asignados', [usuario.id])
      const idsPorTarea = [...new Set((tareasAsignadas || []).map(t => t.id_ot))]
      query = query.or([`tecnicos_asignados.cs.{${usuario.id}}`, idsPorTarea.length > 0 ? `id.in.(${idsPorTarea.join(',')})` : null].filter(Boolean).join(','))
    }

    const [{ data: otsData }, { data: unidadesData }, { data: secuenciasData }, { data: tecnicosData }, { data: proveedoresData }, centrosData, tiposData, ciudadesData] = await Promise.all([
      query,
      supabase.from('unidades').select('id, descripcion, patente_serie, km_actuales, hs_actuales').eq('activo', true).order('descripcion'),
      supabase.from('secuencias').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.rpc('get_tecnicos_con_carga'),
      supabase.from('proveedores').select('id, razon_social').eq('activo', true).order('razon_social'),
      obtenerOpciones('centros_costo'),
      obtenerOpciones('tipos_unidad'),
      obtenerOpciones('ciudades'),
    ])
    setOts(otsData || [])
    setUnidades(unidadesData || [])
    setSecuencias(secuenciasData || [])
    setTecnicos(tecnicosData || [])
    setProveedores(proveedoresData || [])
    setCentrosCosto(centrosData.map(c => c.clave))
    setTiposUnidad(tiposData.map(t => t.clave))
    setCiudades(ciudadesData.map(c => c.clave))
    setEtiquetasConfig({
      centros_costo: Object.fromEntries(centrosData.map(c => [c.clave, c.valor])),
      tipos_unidad: Object.fromEntries(tiposData.map(t => [t.clave, t.valor])),
      ciudades: Object.fromEntries(ciudadesData.map(c => [c.clave, c.valor])),
    })
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  async function anularOt(motivo) {
    setAccionError('')
    const { data, error } = await supabase.rpc('anular_ot', { p_id_ot: idOtAnular, p_motivo: motivo })
    if (error) { setAccionError(error.message); return }
    if (!data?.ok) { setAccionError(data.msg); return }
    setIdOtAnular(null)
    cargar()
  }

  const q = busqueda.trim().toLowerCase()
  const filtradas = ots
    .filter(o => !q || o.numero_ot?.toLowerCase().includes(q) || o.descripcion?.toLowerCase().includes(q) || o.unidad_patente?.toLowerCase().includes(q) || o.unidad_descripcion?.toLowerCase().includes(q))
    .filter(o => {
      if (filtroEstado === 'todas') return true
      if (filtroEstado === 'abiertas') return ESTADOS_ABIERTOS.includes(o.estado)
      if (filtroEstado === 'Vencida') return o.estado_calculado === 'Vencida'
      return o.estado === filtroEstado
    })
    .filter(o => filtroTipo.length === 0 || filtroTipo.includes(o.tipo))
    .filter(o => !filtroUnidad || o.id_unidad === filtroUnidad)
    .filter(o => filtroCentroCosto.length === 0 || filtroCentroCosto.includes(o.unidad_centro_costo))
    .filter(o => filtroTipoUnidad.length === 0 || filtroTipoUnidad.includes(o.unidad_tipo))
    .filter(o => filtroCiudad.length === 0 || filtroCiudad.includes(o.unidad_ciudad))
    // Para el técnico, las "en curso" van siempre arriba — el resto sigue
    // en orden cronológico (más recientes primero, ya viene así de la query).
    .sort((a, b) => esTecnico ? (b.estado === 'En_Curso') - (a.estado === 'En_Curso') : 0)

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-base font-medium text-gray-900 dark:text-gray-100">Órdenes de Trabajo</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportarXlsx('ordenes_trabajo', filtradas, [
              { label: 'N° OT', get: o => o.numero_ot },
              { label: 'Unidad', get: o => o.unidad_descripcion },
              { label: 'Tipo', get: o => o.tipo },
              { label: 'Estado', get: o => o.estado_calculado },
              { label: 'Apertura', get: o => new Date(o.fecha_apertura).toLocaleDateString() },
              { label: 'Tareas', get: o => `${o.tareas_completadas}/${o.tareas_total}` },
              { label: 'Descripción', get: o => o.descripcion },
            ])}
            className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg transition-colors"
          >
            ↓ Excel
          </button>
          {puedeGestionar && (
            <button
              onClick={() => setModalAbierto(true)}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              + Nueva OT
            </button>
          )}
        </div>
      </div>

      <div className="p-6">
        {accionError && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{accionError}</p>}

        <div className="flex flex-wrap gap-2 mb-4">
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por patente, número, descripción…"
            className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
          />
          {usuario?.rol !== 'tecnico' && (
            <>
              <select
                aria-label="Filtrar por estado"
                value={filtroEstado}
                onChange={e => setFiltroEstado(e.target.value)}
                className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="abiertas">Abiertas</option>
                <option value="Vencida">Vencidas</option>
                <option value="Cerrada">Cerradas</option>
                <option value="Cerrada_Vencida">Cerradas vencidas</option>
                <option value="Anulada">Anuladas</option>
                <option value="todas">Todas</option>
              </select>
              <MultiSelectFiltro label="Tipo" opciones={TIPOS_OT} seleccionados={filtroTipo} onChange={setFiltroTipo} />
              <select
                aria-label="Filtrar por unidad"
                value={filtroUnidad}
                onChange={e => setFiltroUnidad(e.target.value)}
                className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todas las unidades</option>
                {unidades.map(u => <option key={u.id} value={u.id}>{[u.patente_serie, u.descripcion].filter(Boolean).join(' — ')}</option>)}
              </select>
              <MultiSelectFiltro label="Centro de costo" opciones={centrosCosto} seleccionados={filtroCentroCosto} onChange={setFiltroCentroCosto} etiquetas={etiquetasConfig.centros_costo} />
              <MultiSelectFiltro label="Tipo de unidad" opciones={tiposUnidad} seleccionados={filtroTipoUnidad} onChange={setFiltroTipoUnidad} etiquetas={etiquetasConfig.tipos_unidad} />
              <MultiSelectFiltro label="Ciudad" opciones={ciudades} seleccionados={filtroCiudad} onChange={setFiltroCiudad} etiquetas={etiquetasConfig.ciudades} />
            </>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Cargando...</p>
        ) : filtradas.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">
            <p className="text-3xl mb-2">🔧</p>
            <p className="text-sm">Sin órdenes de trabajo</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtradas.map(o => (
              <OtCard key={o.id} ot={o} puedeGestionar={puedeGestionar} abrirDetalle={abrirDetalle} onAnular={setIdOtAnular} />
            ))}
          </div>
        )}
      </div>

      {modalAbierto && (
        <OtModal
          unidades={unidades}
          secuencias={secuencias}
          tecnicos={tecnicos}
          proveedores={proveedores}
          onClose={() => setModalAbierto(false)}
          onCreada={idOt => { setModalAbierto(false); abrirDetalle(idOt) }}
        />
      )}

      {idOtAnular && (
        <MotivoModal
          titulo="Anular orden de trabajo"
          label="Motivo de anulación *"
          textoBoton="Anular"
          onConfirm={anularOt}
          onClose={() => setIdOtAnular(null)}
        />
      )}
    </div>
  )
}
