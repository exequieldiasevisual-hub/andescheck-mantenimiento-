import { useEffect, useRef, useState } from 'react'

// Multiselect predictivo: dropdown con buscador arriba (filtra las opciones
// mientras se tipea), checkboxes para elegir varias a la vez, y botones
// Todos / Ninguno para marcar o desmarcar en bloque.
// etiquetas (opcional): mapa valor -> texto a mostrar. Por defecto arma
// "código — descripción" (centros_costo, tipos_unidad, ciudades). Con
// soloEtiqueta=true reemplaza el texto entero en vez de anteponer el código
// (útil cuando el valor guardado es un estado interno tipo 'Sin_base').
export default function MultiSelectFiltro({ label, opciones, seleccionados, onChange, etiquetas, soloEtiqueta = false }) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [posicion, setPosicion] = useState(null)
  const botonRef = useRef(null)
  const panelRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    function onClickFuera(e) {
      if (botonRef.current?.contains(e.target)) return
      if (panelRef.current?.contains(e.target)) return
      setAbierto(false)
    }
    document.addEventListener('mousedown', onClickFuera)
    return () => document.removeEventListener('mousedown', onClickFuera)
  }, [])

  useEffect(() => {
    if (!abierto) return
    setBusqueda('')
    inputRef.current?.focus()

    // El panel usa position:fixed (calculado desde el botón) en vez de
    // absolute, para no quedar clipeado por el contenedor con scroll de la
    // página — un absolute ahí se corta contra el borde del contenedor
    // aunque el panel en sí sea chico. Si no entra abajo, se abre hacia arriba.
    const rect = botonRef.current.getBoundingClientRect()
    const alturaEstimada = 260
    const abreHaciaArriba = rect.bottom + alturaEstimada > window.innerHeight && rect.top > alturaEstimada
    setPosicion({
      left: rect.left,
      top: abreHaciaArriba ? null : rect.bottom + 4,
      bottom: abreHaciaArriba ? window.innerHeight - rect.top + 4 : null,
    })
  }, [abierto])

  function toggle(op) {
    onChange(seleccionados.includes(op) ? seleccionados.filter(s => s !== op) : [...seleccionados, op])
  }

  if (opciones.length === 0) return null

  function textoDe(op) {
    if (!etiquetas?.[op]) return String(op)
    return soloEtiqueta ? etiquetas[op] : `${op} — ${etiquetas[op]}`
  }

  const q = busqueda.trim().toLowerCase()
  const visibles = q === '' ? opciones : opciones.filter(op => textoDe(op).toLowerCase().includes(q))

  // "Todos" marca solo las visibles (respeta lo que se buscó); "Ninguno" limpia todo.
  function marcarTodos() {
    onChange([...new Set([...seleccionados, ...visibles])])
  }
  function marcarNinguno() {
    onChange([])
  }

  return (
    <div className="relative">
      <button
        ref={botonRef}
        type="button"
        onClick={() => setAbierto(a => !a)}
        className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 whitespace-nowrap"
      >
        {label}{seleccionados.length > 0 ? ` (${seleccionados.length})` : ''}
      </button>
      {abierto && posicion && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', left: posicion.left, top: posicion.top ?? undefined, bottom: posicion.bottom ?? undefined }}
          className="z-20 min-w-[12rem] max-h-[70vh] overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 space-y-1"
        >
          <input
            ref={inputRef}
            aria-label={`Buscar ${label.toLowerCase()}`}
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder={`Buscar ${label.toLowerCase()}…`}
            className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="max-h-48 overflow-y-auto space-y-1">
            {visibles.length === 0 ? (
              <p className="px-1 py-1 text-xs text-gray-400">Sin resultados</p>
            ) : (
              visibles.map(op => (
                <label key={op} className="flex items-center gap-1.5 text-xs px-1 py-0.5 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer">
                  <input type="checkbox" checked={seleccionados.includes(op)} onChange={() => toggle(op)} />
                  {textoDe(op)}
                </label>
              ))
            )}
          </div>
          <div className="flex justify-end gap-1.5 pt-1 border-t border-gray-100 dark:border-gray-700">
            <button type="button" onClick={marcarTodos}
              className="px-2 py-0.5 text-xs border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
              Todos
            </button>
            <button type="button" onClick={marcarNinguno}
              className="px-2 py-0.5 text-xs border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
              Ninguno
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
