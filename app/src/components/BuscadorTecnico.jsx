import { useState } from 'react'

export default function BuscadorTecnico({ tecnicos, seleccionados, onToggle }) {
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const filtrados = q === '' ? tecnicos : tecnicos.filter(t => t.nombre?.toLowerCase().includes(q))

  const elegidos = filtrados.filter(t => seleccionados.includes(t.id))
  const resto = filtrados.filter(t => !seleccionados.includes(t.id))
  const ordenados = [...elegidos, ...resto]

  return (
    <div>
      <input
        aria-label="Buscar técnico"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Buscar técnico por nombre…"
        className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
      />
      <div className="max-h-48 overflow-y-auto space-y-1">
        {ordenados.length === 0 ? (
          <p className="text-xs text-gray-400 px-1">Sin resultados</p>
        ) : (
          ordenados.map(t => (
            <label key={t.id} className="flex items-start gap-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700">
              <input
                type="checkbox"
                checked={seleccionados.includes(t.id)}
                onChange={() => onToggle(t.id)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{t.nombre}</span>
                {t.tarea_actual && (
                  <span className="block text-xs text-amber-600 dark:text-amber-400">
                    ▶ En curso: {t.tarea_actual}{t.minutos_restantes_actual > 0 && ` (${t.minutos_restantes_actual} min restantes)`}
                  </span>
                )}
                {t.proxima_tarea && (
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    Próxima: {t.proxima_tarea}
                  </span>
                )}
                {t.tareas_pendientes > 0 && (
                  <span className="block text-xs text-gray-400">
                    {t.tareas_pendientes} tarea(s) pendiente(s){t.minutos_comprometidos > 0 && ` · ${t.minutos_comprometidos} min comprometidos`}
                  </span>
                )}
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  )
}
