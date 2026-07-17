import { useEffect, useRef, useState } from 'react'

// Combobox predictivo: escribís y filtra en el cliente sobre la lista ya
// cargada. Con cientos de unidades esto evita tener que scrollear un
// <select> gigante — no hace falta pegarle a la base en cada tecla porque
// las unidades activas de una empresa son un volumen chico para filtrar
// en memoria.
export default function BuscadorUnidad({ unidades, value, onChange, placeholder = 'Buscar por patente…' }) {
  const [query, setQuery] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [resaltado, setResaltado] = useState(0)
  const contenedorRef = useRef(null)
  const listaRef = useRef(null)

  const seleccionada = unidades.find(u => u.id === value)

  useEffect(() => {
    function onClickFuera(e) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) setAbierto(false)
    }
    document.addEventListener('mousedown', onClickFuera)
    return () => document.removeEventListener('mousedown', onClickFuera)
  }, [])

  // El valor de referencia de una unidad es la patente/dominio — el
  // buscador prioriza coincidencias ahí (empieza-con primero, después
  // "contiene"), y recién si no matchea nada por patente busca en la
  // descripción.
  const q = query.trim().toLowerCase()
  let filtradas = unidades
  if (q !== '') {
    const porPatenteInicio = unidades.filter(u => u.patente_serie?.toLowerCase().startsWith(q))
    const porPatenteContiene = unidades.filter(u => !porPatenteInicio.includes(u) && u.patente_serie?.toLowerCase().includes(q))
    const porDescripcion = unidades.filter(u =>
      !porPatenteInicio.includes(u) && !porPatenteContiene.includes(u) && u.descripcion?.toLowerCase().includes(q)
    )
    filtradas = [...porPatenteInicio, ...porPatenteContiene, ...porDescripcion]
  }

  function elegir(u) {
    onChange(u.id)
    setQuery('')
    setAbierto(false)
  }

  function onKeyDown(e) {
    if (!abierto && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { setAbierto(true); return }
    if (!abierto || filtradas.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setResaltado(i => (i + 1) % filtradas.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setResaltado(i => (i - 1 + filtradas.length) % filtradas.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtradas[resaltado]) elegir(filtradas[resaltado])
    } else if (e.key === 'Escape') {
      setAbierto(false)
    }
  }

  return (
    <div ref={contenedorRef} className="relative">
      <input
        aria-label="Buscar unidad"
        role="combobox"
        aria-expanded={abierto}
        aria-autocomplete="list"
        value={abierto ? query : (seleccionada ? `${seleccionada.patente_serie || 's/patente'} — ${seleccionada.descripcion}` : '')}
        onChange={e => { setQuery(e.target.value); setAbierto(true); setResaltado(0) }}
        onFocus={() => { setQuery(''); setAbierto(true); setResaltado(0) }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {abierto && (
        <div ref={listaRef} className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
          {filtradas.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">Sin resultados</p>
          ) : (
            filtradas.map((u, i) => (
              <button
                type="button"
                key={u.id}
                onClick={() => elegir(u)}
                onMouseEnter={() => setResaltado(i)}
                className={`w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 ${
                  i === resaltado ? 'bg-gray-50 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <span className="font-medium">{u.patente_serie || 's/patente'}</span> — {u.descripcion}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
