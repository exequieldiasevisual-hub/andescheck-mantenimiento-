import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PlantillaChecklistModal from '../components/PlantillaChecklistModal'
import EjecutarChecklistModal from '../components/EjecutarChecklistModal'

function Plantillas({ usuario }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [editar, setEditar] = useState(null)
  const puedeEscribir = ['administrador', 'supervisor'].includes(usuario?.rol)

  async function cargar() {
    setLoading(true)
    const { data } = await supabase.from('checklist_plantillas').select('*, checklist_items(count)').eq('activo', true).order('nombre')
    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  return (
    <div>
      {puedeEscribir && (
        <div className="flex justify-end mb-4">
          <button onClick={() => { setEditar(null); setModalAbierto(true) }}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            + Nueva plantilla
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="px-5 py-8 text-sm text-gray-400 text-center">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="px-5 py-8 text-sm text-gray-400 text-center">No hay plantillas cargadas todavía</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-400 dark:text-gray-500 font-medium">
                <th className="px-5 py-3 text-left">Nombre</th>
                <th className="px-5 py-3 text-left">Tipo de unidad</th>
                <th className="px-5 py-3 text-left">Ítems</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(p => (
                <tr key={p.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-5 py-3 text-gray-900 dark:text-gray-100 font-medium">{p.nombre}</td>
                  <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{p.tipo_unidad || 'Todas'}</td>
                  <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{p.checklist_items?.[0]?.count ?? 0}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    {puedeEscribir && (
                      <button onClick={() => { setEditar(p); setModalAbierto(true) }} className="text-blue-600 hover:underline text-xs">Editar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalAbierto && (
        <PlantillaChecklistModal
          plantilla={editar}
          empresaId={usuario.empresa_id}
          onClose={() => setModalAbierto(false)}
          onSaved={() => { setModalAbierto(false); cargar() }}
        />
      )}
    </div>
  )
}

function HistorialEjecucion({ ejecucion }) {
  const [respuestas, setRespuestas] = useState(null)
  const [abierto, setAbierto] = useState(false)

  function toggle() {
    setAbierto(a => !a)
    if (!respuestas) {
      supabase.from('checklist_respuestas').select('respuesta, checklist_items(pregunta)').eq('id_ejecucion', ejecucion.id)
        .then(({ data }) => setRespuestas(data || []))
    }
  }

  return (
    <>
      <tr className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer" onClick={toggle}>
        <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{new Date(ejecucion.fecha).toLocaleString()}</td>
        <td className="px-5 py-3 text-gray-900 dark:text-gray-100 font-medium">
          {[ejecucion.unidades?.patente_serie, ejecucion.unidades?.descripcion].filter(Boolean).join(' — ')}
        </td>
        <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{ejecucion.checklist_plantillas?.nombre}</td>
        <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{ejecucion.usuarios?.nombre ?? 'Sin asignar'}</td>
        <td className="px-5 py-3 text-right">
          {ejecucion.ubicacion_url && (
            <a href={ejecucion.ubicacion_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-gray-600 dark:text-gray-400 hover:underline text-xs">📍</a>
          )}
        </td>
      </tr>
      {abierto && (
        <tr>
          <td colSpan={5} className="px-5 py-3 bg-gray-50 dark:bg-gray-900">
            {respuestas === null ? (
              <p className="text-xs text-gray-400">Cargando…</p>
            ) : (
              <div className="space-y-1">
                {respuestas.map((r, i) => (
                  <p key={i} className="text-xs text-gray-600 dark:text-gray-400">
                    <span className="font-medium text-gray-800 dark:text-gray-200">{r.checklist_items?.pregunta}</span>: {r.respuesta}
                  </p>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function EjecutarEHistorial() {
  const [unidades, setUnidades] = useState([])
  const [plantillas, setPlantillas] = useState([])
  const [ejecuciones, setEjecuciones] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [mensaje, setMensaje] = useState('')

  async function cargar() {
    setLoading(true)
    const [{ data: unidadesData }, { data: plantillasData }, { data: ejecucionesData }] = await Promise.all([
      supabase.from('unidades').select('id, descripcion, patente_serie, tipo').eq('activo', true).order('descripcion'),
      supabase.from('checklist_plantillas').select('id, nombre, tipo_unidad').eq('activo', true).order('nombre'),
      supabase.from('checklist_ejecuciones')
        .select('*, unidades(descripcion, patente_serie), checklist_plantillas(nombre), usuarios(nombre)')
        .order('fecha', { ascending: false })
        .limit(200),
    ])
    setUnidades(unidadesData || [])
    setPlantillas(plantillasData || [])
    setEjecuciones(ejecucionesData || [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        {mensaje && <p className="text-sm text-green-600 dark:text-green-400">{mensaje}</p>}
        <button onClick={() => setModalAbierto(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors ml-auto">
          + Realizar checklist
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="px-5 py-8 text-sm text-gray-400 text-center">Cargando…</div>
        ) : ejecuciones.length === 0 ? (
          <div className="px-5 py-8 text-sm text-gray-400 text-center">No hay checklists realizados todavía</div>
        ) : (
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900">
                <tr className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                  <th className="px-5 py-3 text-left">Fecha</th>
                  <th className="px-5 py-3 text-left">Unidad</th>
                  <th className="px-5 py-3 text-left">Plantilla</th>
                  <th className="px-5 py-3 text-left">Cargado por</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {ejecuciones.map(e => <HistorialEjecucion key={e.id} ejecucion={e} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalAbierto && (
        <EjecutarChecklistModal
          unidades={unidades}
          plantillas={plantillas}
          onClose={() => setModalAbierto(false)}
          onSaved={novedadesGeneradas => {
            setModalAbierto(false)
            setMensaje(novedadesGeneradas > 0 ? `Checklist guardado — se generaron ${novedadesGeneradas} novedad(es) automática(s)` : 'Checklist guardado')
            cargar()
          }}
        />
      )}
    </div>
  )
}

export default function Checklists({ usuario }) {
  const [tab, setTab] = useState('ejecutar')

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <h1 className="text-base font-medium text-gray-900 dark:text-gray-100">Checklists</h1>
      </div>

      <div className="px-6 pt-4 flex gap-1 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <button
          onClick={() => setTab('ejecutar')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'ejecutar' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          Ejecutar / Historial
        </button>
        <button
          onClick={() => setTab('plantillas')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'plantillas' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          Plantillas
        </button>
      </div>

      <div className="p-6">
        {tab === 'ejecutar' ? <EjecutarEHistorial /> : <Plantillas usuario={usuario} />}
      </div>
    </div>
  )
}
