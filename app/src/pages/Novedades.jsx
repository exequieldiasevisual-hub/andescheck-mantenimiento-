import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { exportarXlsx } from '../lib/exportarXlsx'
import Modal from '../components/Modal'
import MotivoModal from '../components/MotivoModal'
import OtModal from '../components/OtModal'
import NovedadModal from '../components/NovedadModal'
import MultiSelectFiltro from '../components/MultiSelectFiltro'

function ElegirOtModal({ novedad, otAbierta, onClose, onElegirExistente, onElegirNueva }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function usarExistente() {
    setSaving(true)
    setError('')
    const { data, error } = await supabase.rpc('derivar_novedad_a_ot_existente', {
      p_id_novedad: novedad.id, p_id_ot: otAbierta.id,
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data.msg); return }
    onElegirExistente()
  }

  return (
    <Modal titulo="Esta unidad ya tiene una OT abierta" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          La OT <span className="font-medium">{otAbierta.numero_ot}</span> ya está abierta para esta unidad
          ({otAbierta.estado === 'En_Curso' ? 'en curso' : 'abierta'}). ¿Qué querés hacer con esta novedad?
        </p>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex flex-col gap-2 pt-2">
          <button onClick={usarExistente} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Agregando…' : `Agregar como tarea a la OT ${otAbierta.numero_ot}`}
          </button>
          <button onClick={onElegirNueva} disabled={saving}
            className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Crear una OT nueva desde cero
          </button>
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:underline">
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function Novedades({ usuario, abrirOt }) {
  const [novedades, setNovedades] = useState([])
  const [unidades, setUnidades] = useState([])
  const [secuencias, setSecuencias] = useState([])
  const [tecnicos, setTecnicos] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [novedadDerivar, setNovedadDerivar] = useState(null)
  const [novedadRechazar, setNovedadRechazar] = useState(null)
  const [otParaElegir, setOtParaElegir] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtroUnidad, setFiltroUnidad] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroCentro, setFiltroCentro] = useState([])
  const [filtroTipoUnidad, setFiltroTipoUnidad] = useState([])
  const [filtroCiudad, setFiltroCiudad] = useState([])
  const [etiquetasConfig, setEtiquetasConfig] = useState({})

  const [error, setError] = useState('')

  const puedeDerivar = ['administrador', 'supervisor'].includes(usuario?.rol)
  const puedeAprobar = ['jefe_taller', 'administrador'].includes(usuario?.rol)

  async function cargar() {
    setLoading(true)
    const [{ data: novedadesData }, { data: unidadesData }, { data: secuenciasData }, { data: tecnicosData }, { data: proveedoresData }] = await Promise.all([
      supabase.from('novedades').select('*, unidades(descripcion, patente_serie, centro_costo, ciudad, tipo)').order('fecha', { ascending: false }),
      supabase.from('unidades').select('id, descripcion, patente_serie, km_actuales, hs_actuales, centro_costo, ciudad, tipo').eq('activo', true).order('descripcion'),
      supabase.from('secuencias').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.rpc('get_tecnicos_con_carga'),
      supabase.from('proveedores').select('id, razon_social').eq('activo', true).order('razon_social'),
    ])
    setNovedades(novedadesData || [])
    setUnidades(unidadesData || [])
    setSecuencias(secuenciasData || [])
    setTecnicos(tecnicosData || [])
    setProveedores(proveedoresData || [])
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

  async function aprobar(novedad) {
    setError('')
    const { data, error } = await supabase.rpc('aprobar_novedad', { p_id_novedad: novedad.id, p_aprobar: true, p_motivo: null })
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data.msg); return }
    cargar()
  }

  async function rechazar(motivo) {
    setError('')
    const { data, error } = await supabase.rpc('aprobar_novedad', { p_id_novedad: novedadRechazar.id, p_aprobar: false, p_motivo: motivo })
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data.msg); return }
    setNovedadRechazar(null)
    cargar()
  }

  async function iniciarDerivar(novedad) {
    setError('')
    const { data } = await supabase.from('ot_cabecera')
      .select('id, numero_ot, estado')
      .eq('id_unidad', novedad.id_unidad)
      .in('estado', ['Abierta', 'En_Curso'])
      .order('fecha_apertura', { ascending: false })
      .limit(1)
    if (data && data.length > 0) setOtParaElegir({ novedad, ot: data[0] })
    else setNovedadDerivar(novedad)
  }

  const centros = [...new Set(unidades.map(u => u.centro_costo).filter(Boolean))].sort()
  const tiposUnidad = [...new Set(unidades.map(u => u.tipo).filter(Boolean))].sort()
  const ciudades = [...new Set(unidades.map(u => u.ciudad).filter(Boolean))].sort()

  const q = busqueda.trim().toLowerCase()
  const filtradas = novedades.filter(n => {
    if (q && !(n.descripcion?.toLowerCase().includes(q) || n.unidades?.descripcion?.toLowerCase().includes(q) || n.unidades?.patente_serie?.toLowerCase().includes(q))) return false
    if (filtroUnidad && n.id_unidad !== filtroUnidad) return false
    if (filtroEstado === 'Sin_Gestionar' ? n.estado !== 'Pendiente' : filtroEstado && n.estado !== filtroEstado) return false
    if (filtroCentro.length > 0 && !filtroCentro.includes(n.unidades?.centro_costo)) return false
    if (filtroTipoUnidad.length > 0 && !filtroTipoUnidad.includes(n.unidades?.tipo)) return false
    if (filtroCiudad.length > 0 && !filtroCiudad.includes(n.unidades?.ciudad)) return false
    return true
  })

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-base font-medium text-gray-900 dark:text-gray-100">Novedades</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportarXlsx('novedades', filtradas, [
              { label: 'Fecha', get: n => new Date(n.fecha).toLocaleDateString() },
              { label: 'Unidad', get: n => n.unidades?.descripcion },
              { label: 'Descripción', get: n => n.descripcion },
              { label: 'Tipo', get: n => n.tipo },
              { label: 'Centro de costo', get: n => n.unidades?.centro_costo },
              { label: 'Estado', get: n => n.estado },
            ])}
            className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg transition-colors"
          >
            ↓ Excel
          </button>
          <button onClick={() => setModalAbierto(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            + Nueva novedad
          </button>
        </div>
      </div>

      <div className="p-6">
        {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4 flex flex-wrap gap-3">
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por patente, unidad, descripción…"
            className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
          />
          <select aria-label="Filtrar por unidad" value={filtroUnidad} onChange={e => setFiltroUnidad(e.target.value)}
            className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todas las unidades</option>
            {unidades.map(u => <option key={u.id} value={u.id}>{[u.patente_serie, u.descripcion].filter(Boolean).join(' — ')}</option>)}
          </select>
          <select aria-label="Filtrar por estado" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
            className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todos los estados</option>
            <option value="Sin_Gestionar">Sin gestionar</option>
            <option value="Aprobada">Aprobadas</option>
            <option value="Rechazada">Rechazadas</option>
          </select>
          <MultiSelectFiltro label="Centro de costo" opciones={centros} seleccionados={filtroCentro} onChange={setFiltroCentro} etiquetas={etiquetasConfig.centros_costo} />
          <MultiSelectFiltro label="Tipo de unidad" opciones={tiposUnidad} seleccionados={filtroTipoUnidad} onChange={setFiltroTipoUnidad} etiquetas={etiquetasConfig.tipos_unidad} />
          <MultiSelectFiltro label="Ciudad" opciones={ciudades} seleccionados={filtroCiudad} onChange={setFiltroCiudad} etiquetas={etiquetasConfig.ciudades} />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">Cargando…</div>
          ) : filtradas.length === 0 ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">No hay novedades que coincidan con los filtros</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900">
                <tr className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-400 dark:text-gray-500 font-medium">
                  <th className="px-5 py-3 text-left">Fecha</th>
                  <th className="px-5 py-3 text-left">Unidad</th>
                  <th className="px-5 py-3 text-left">Descripción</th>
                  <th className="px-5 py-3 text-left">Centro de costo</th>
                  <th className="px-5 py-3 text-left">Estado</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map(n => (
                  <tr key={n.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{new Date(n.fecha).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{n.unidades?.descripcion}</td>
                    <td className="px-5 py-3 text-gray-900 dark:text-gray-100">{n.descripcion}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{n.unidades?.centro_costo ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">
                      {n.estado}
                      {n.estado === 'Rechazada' && n.motivo_rechazo && (
                        <div className="text-xs text-red-500" title={n.motivo_rechazo}>{n.motivo_rechazo}</div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {n.foto_url && (
                        <a href={n.foto_url} target="_blank" rel="noreferrer" className="text-gray-600 dark:text-gray-400 hover:underline text-xs mr-3">📷 Foto</a>
                      )}
                      {n.ubicacion_url && (
                        <a href={n.ubicacion_url} target="_blank" rel="noreferrer" className="text-gray-600 dark:text-gray-400 hover:underline text-xs mr-3">📍 Ubicación</a>
                      )}
                      {puedeAprobar && n.estado === 'Pendiente' && (
                        <>
                          <button onClick={() => aprobar(n)} className="text-green-600 hover:underline text-xs mr-3">Aprobar</button>
                          <button onClick={() => setNovedadRechazar(n)} className="text-red-500 hover:underline text-xs mr-3">Rechazar</button>
                        </>
                      )}
                      {puedeDerivar && n.estado === 'Aprobada' && (
                        <button onClick={() => iniciarDerivar(n)} className="text-blue-600 hover:underline text-xs">Derivar a OT</button>
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
        <NovedadModal
          unidades={unidades}
          usuario={usuario}
          onClose={() => setModalAbierto(false)}
          onSaved={() => { setModalAbierto(false); cargar() }}
        />
      )}

      {novedadDerivar && (
        <OtModal
          titulo={`Derivar novedad a OT - ${novedadDerivar.unidades?.descripcion ?? ''}`}
          unidades={unidades}
          secuencias={secuencias}
          tecnicos={tecnicos}
          proveedores={proveedores}
          unidadInicial={novedadDerivar.id_unidad}
          descripcionInicial={novedadDerivar.descripcion}
          idNovedadOrigen={novedadDerivar.id}
          onClose={() => setNovedadDerivar(null)}
          onCreada={() => { setNovedadDerivar(null); cargar() }}
        />
      )}

      {otParaElegir && (
        <ElegirOtModal
          novedad={otParaElegir.novedad}
          otAbierta={otParaElegir.ot}
          onClose={() => setOtParaElegir(null)}
          onElegirExistente={() => { const idOt = otParaElegir.ot.id; setOtParaElegir(null); abrirOt(idOt) }}
          onElegirNueva={() => { setNovedadDerivar(otParaElegir.novedad); setOtParaElegir(null) }}
        />
      )}

      {novedadRechazar && (
        <MotivoModal
          titulo={`Rechazar novedad — ${novedadRechazar.descripcion}`}
          label="Motivo del rechazo *"
          textoBoton="Rechazar"
          onConfirm={rechazar}
          onClose={() => setNovedadRechazar(null)}
        />
      )}
    </div>
  )
}
