import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { exportarXlsx } from '../lib/exportarXlsx'

function money(v) {
  return `$${Number(v || 0).toLocaleString('es-AR')}`
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
      </div>

      <div className="p-6">
        {tab === 'costos' ? <ReporteCostos mes={mes} /> : <ReporteTecnicos mes={mes} />}
      </div>
    </div>
  )
}
