import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import MultiSelectFiltro from '../components/MultiSelectFiltro'

const TARJETAS = [
  { key: 'unidades_activas', label: 'Unidades activas', porcentaje: true, denominador: 'unidades_total' },
  { key: 'unidades_operativas', label: 'Unidades operativas', porcentaje: true },
  { key: 'ot_abiertas', label: 'OT abiertas' },
  { key: 'rutinas_vencidas', label: 'Rutinas vencidas', porcentaje: true },
  { key: 'novedades_pendientes', label: 'Novedades pendientes' },
  { key: 'stock_critico', label: 'Stock crítico' },
  { key: 'docs_vencidos', label: 'Documentos vencidos', porcentaje: true },
  { key: 'docs_por_vencer', label: 'Documentos por vencer' },
]

const PUNTO_COLA = {
  ot: 'bg-red-500',
  rutina: 'bg-amber-500',
  documento: 'bg-purple-500',
  novedad: 'bg-blue-500',
}

const FILTROS_COLA = [
  { tipo: 'ot', label: 'OT' },
  { tipo: 'rutina', label: 'Rutinas' },
  { tipo: 'documento', label: 'Documentación' },
  { tipo: 'novedad', label: 'Novedades' },
]

export default function Dashboard({ abrirOt, navegarA }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [filtroCola, setFiltroCola] = useState(null)
  const [modoPorcentaje, setModoPorcentaje] = useState({})
  const [unidades, setUnidades] = useState([])
  const [etiquetasConfig, setEtiquetasConfig] = useState({})
  const [filtroCentro, setFiltroCentro] = useState([])
  const [filtroTipo, setFiltroTipo] = useState([])
  const [filtroCiudad, setFiltroCiudad] = useState([])

  useEffect(() => {
    supabase.from('unidades').select('centro_costo, tipo, ciudad').eq('activo', true)
      .then(({ data }) => setUnidades(data || []))
    supabase.from('configuracion').select('seccion, clave, valor')
      .in('seccion', ['centros_costo', 'tipos_unidad', 'ciudades'])
      .then(({ data }) => {
        const porSeccion = { centros_costo: {}, tipos_unidad: {}, ciudades: {} }
        for (const fila of data || []) porSeccion[fila.seccion][fila.clave] = fila.valor
        setEtiquetasConfig(porSeccion)
      })
  }, [])

  useEffect(() => {
    supabase.rpc('get_dashboard', {
      p_centros: filtroCentro.length ? filtroCentro : null,
      p_tipos: filtroTipo.length ? filtroTipo : null,
      p_ciudades: filtroCiudad.length ? filtroCiudad : null,
    }).then(({ data, error }) => {
      if (error) setError(error.message)
      else setDatos(data)
    })
  }, [filtroCentro, filtroTipo, filtroCiudad])

  if (error) return <p className="p-6 text-sm text-red-600 dark:text-red-400">{error}</p>
  if (!datos) return <p className="p-6 text-sm text-gray-400">Cargando…</p>

  const semaforo = datos.semaforo || {}
  const cola = (datos.cola || []).filter(item => !filtroCola || item.tipo === filtroCola)
  const centros = [...new Set(unidades.map(u => u.centro_costo).filter(Boolean))].sort()
  const tipos = [...new Set(unidades.map(u => u.tipo).filter(Boolean))].sort()
  const ciudades = [...new Set(unidades.map(u => u.ciudad).filter(Boolean))].sort()

  function irA(item) {
    if (item.tipo === 'ot') abrirOt(item.id)
    else if (item.tipo === 'rutina') navegarA('rutinas')
    else if (item.tipo === 'documento') navegarA('documentos')
    else if (item.tipo === 'novedad') navegarA('novedades')
  }

  function valorTarjeta(t) {
    const valor = datos[t.key] ?? 0
    if (!t.porcentaje || !modoPorcentaje[t.key]) return valor
    const total = datos[t.denominador || 'unidades_activas'] || 0
    return total > 0 ? `${Math.round((valor / total) * 100)}%` : '—'
  }

  return (
    <div className="p-6 space-y-4">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-6 flex-wrap">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Estado de flota</p>
          <button
            type="button"
            onClick={() => navegarA('unidades', { salud: 'verde' })}
            className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            <span className="w-3 h-3 rounded-full bg-green-500" /> {semaforo.verde ?? 0} bien
          </button>
          <button
            type="button"
            onClick={() => navegarA('unidades', { salud: 'ambar' })}
            className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            <span className="w-3 h-3 rounded-full bg-amber-500" /> {semaforo.ambar ?? 0} a vigilar
          </button>
          <button
            type="button"
            onClick={() => navegarA('unidades', { salud: 'rojo' })}
            className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            <span className="w-3 h-3 rounded-full bg-red-500" /> {semaforo.rojo ?? 0} críticas
          </button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <MultiSelectFiltro label="Centro de costo" opciones={centros} seleccionados={filtroCentro} onChange={setFiltroCentro} etiquetas={etiquetasConfig.centros_costo} />
          <MultiSelectFiltro label="Tipo de unidad" opciones={tipos} seleccionados={filtroTipo} onChange={setFiltroTipo} etiquetas={etiquetasConfig.tipos_unidad} />
          <MultiSelectFiltro label="Ciudad" opciones={ciudades} seleccionados={filtroCiudad} onChange={setFiltroCiudad} etiquetas={etiquetasConfig.ciudades} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {TARJETAS.map(t => (
          <div key={t.key} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 relative">
            <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{valorTarjeta(t)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t.label}</p>
            {t.porcentaje && (
              <button
                type="button"
                onClick={() => setModoPorcentaje(m => ({ ...m, [t.key]: !m[t.key] }))}
                title="Alternar entre número y porcentaje de la flota"
                className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                {modoPorcentaje[t.key] ? '#' : '%'}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">Para hoy</h2>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setFiltroCola(null)}
              className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                !filtroCola
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              Todos
            </button>
            {FILTROS_COLA.map(f => (
              <button
                key={f.tipo}
                type="button"
                onClick={() => setFiltroCola(actual => actual === f.tipo ? null : f.tipo)}
                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                  filtroCola === f.tipo
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {cola.length === 0 ? (
          <p className="text-sm text-gray-400">{filtroCola ? 'Nada pendiente de este tipo.' : 'Nada urgente pendiente. 👌'}</p>
        ) : (
          <div className="space-y-1">
            {cola.map((item, i) => (
              <button
                key={`${item.tipo}-${item.id}-${i}`}
                onClick={() => irA(item)}
                className="w-full flex items-start gap-3 text-left px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${PUNTO_COLA[item.tipo] || 'bg-gray-400'}`} />
                <span className="min-w-0">
                  <span className="block text-sm text-gray-900 dark:text-gray-100 truncate">{item.titulo}</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">{item.detalle}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
