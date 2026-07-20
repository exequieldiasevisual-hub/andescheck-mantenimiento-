import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { exportarXlsx } from '../lib/exportarXlsx'
import CargaCombustibleModal from '../components/CargaCombustibleModal'
import MultiSelectFiltro from '../components/MultiSelectFiltro'

export default function Combustible({ usuario }) {
  const [unidades, setUnidades] = useState([])
  const [cargas, setCargas] = useState([])
  const [alertas, setAlertas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [filtroUnidades, setFiltroUnidades] = useState([])
  const [filtroCentro, setFiltroCentro] = useState([])
  const [filtroCiudad, setFiltroCiudad] = useState([])
  const [etiquetasConfig, setEtiquetasConfig] = useState({})
  const [error, setError] = useState('')

  async function cargar() {
    setLoading(true)
    setError('')
    const [{ data: cargasData, error: cargasError }, { data: alertasData }] = await Promise.all([
      supabase.rpc('get_cargas_combustible', {
        p_unidades: filtroUnidades.length > 0 ? filtroUnidades : null,
        p_centros: filtroCentro.length > 0 ? filtroCentro : null,
        p_ciudades: filtroCiudad.length > 0 ? filtroCiudad : null,
      }),
      supabase.rpc('get_alertas_combustible'),
    ])
    if (cargasError) setError(cargasError.message)
    setCargas(cargasData || [])
    setAlertas(alertasData || [])
    setLoading(false)
  }

  useEffect(() => {
    supabase.from('unidades').select('id, descripcion, patente_serie, km_actuales, hs_actuales, centro_costo, ciudad').eq('activo', true).order('descripcion')
      .then(({ data }) => setUnidades(data || []))
    supabase.from('configuracion').select('seccion, clave, valor')
      .in('seccion', ['centros_costo', 'ciudades'])
      .then(({ data }) => {
        const porSeccion = { centros_costo: {}, ciudades: {} }
        for (const fila of data || []) porSeccion[fila.seccion][fila.clave] = fila.valor
        setEtiquetasConfig(porSeccion)
      })
  }, [])

  useEffect(() => { cargar() }, [filtroUnidades, filtroCentro, filtroCiudad])

  const nombrePorUnidad = Object.fromEntries(unidades.map(u => [u.id, [u.patente_serie, u.descripcion].filter(Boolean).join(' — ')]))
  const centros = [...new Set(unidades.map(u => u.centro_costo).filter(Boolean))].sort()
  const ciudades = [...new Set(unidades.map(u => u.ciudad).filter(Boolean))].sort()

  function exportar() {
    exportarXlsx('combustible', cargas, [
      { label: 'Fecha', get: c => new Date(c.fecha).toLocaleString() },
      { label: 'Unidad', get: c => `${c.patente ?? 's/patente'} — ${c.unidad}` },
      { label: 'Origen', get: c => c.origen },
      { label: 'Estación', get: c => c.estacion },
      { label: 'Litros', get: c => c.litros },
      { label: '$ por litro', get: c => c.precio_unitario },
      { label: '$ total', get: c => c.precio_total },
      { label: 'Rendimiento', get: c => c.rendimiento ? `${c.rendimiento} ${c.unidad_rendimiento}` : '' },
      { label: 'Cargado por', get: c => c.cargado_por },
    ])
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-base font-medium text-gray-900 dark:text-gray-100">Combustible</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={exportar}
            className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg transition-colors"
          >
            ↓ Excel
          </button>
          <button onClick={() => setModalAbierto(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            + Nueva carga
          </button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {alertas.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl p-4">
            <h2 className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-2">⚠ {alertas.length} desvío(s) detectado(s)</h2>
            <div className="space-y-1">
              {alertas.map((a, i) => (
                <div key={i} className="text-xs text-amber-700 dark:text-amber-400">
                  <span className="font-medium">{a.titulo}</span> — {a.detalle}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-wrap gap-3">
          <MultiSelectFiltro label="Unidad" opciones={unidades.map(u => u.id)} seleccionados={filtroUnidades} onChange={setFiltroUnidades} etiquetas={nombrePorUnidad} soloEtiqueta />
          <MultiSelectFiltro label="Centro de costo" opciones={centros} seleccionados={filtroCentro} onChange={setFiltroCentro} etiquetas={etiquetasConfig.centros_costo} />
          <MultiSelectFiltro label="Ciudad" opciones={ciudades} seleccionados={filtroCiudad} onChange={setFiltroCiudad} etiquetas={etiquetasConfig.ciudades} />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">Cargando…</div>
          ) : cargas.length === 0 ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">No hay cargas registradas</div>
          ) : (
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900">
                  <tr className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                    <th className="px-5 py-3 text-left">Fecha</th>
                    <th className="px-5 py-3 text-left">Unidad</th>
                    <th className="px-5 py-3 text-left">Origen</th>
                    <th className="px-5 py-3 text-right">Litros</th>
                    <th className="px-5 py-3 text-right">$ total</th>
                    <th className="px-5 py-3 text-right">Rendimiento</th>
                    <th className="px-5 py-3 text-left">Cargado por</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {cargas.map(c => (
                    <tr key={c.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{new Date(c.fecha).toLocaleString()}</td>
                      <td className="px-5 py-3 text-gray-900 dark:text-gray-100 font-medium">
                        {[c.patente, c.unidad].filter(Boolean).join(' — ')}
                      </td>
                      <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{c.origen === 'Estación externa' ? c.estacion || c.origen : c.origen}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{c.litros}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">{c.precio_total ? `$${Number(c.precio_total).toLocaleString('es-AR')}` : '—'}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">{c.rendimiento ? `${c.rendimiento} ${c.unidad_rendimiento}` : '—'}</td>
                      <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{c.cargado_por}</td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {c.comprobante_url && (
                          <a href={c.comprobante_url} target="_blank" rel="noreferrer" className="text-gray-600 dark:text-gray-400 hover:underline text-xs">📷 Comprobante</a>
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
        <CargaCombustibleModal
          unidades={unidades}
          usuario={usuario}
          onClose={() => setModalAbierto(false)}
          onSaved={() => { setModalAbierto(false); cargar() }}
        />
      )}
    </div>
  )
}
