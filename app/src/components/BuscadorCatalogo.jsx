import { useEffect, useRef, useState } from 'react'

// Combobox predictivo para el catálogo de trabajos: con catálogos de miles
// de ítems, un <select> con miles de <option> es inusable — acá escribís y
// filtra en memoria sobre la lista ya cargada, priorizando "empieza con".
export default function BuscadorCatalogo({ catalogo, value, onChange, placeholder = 'Buscar trabajo…' }) {
  const [query, setQuery] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [resaltado, setResaltado] = useState(0)
  const contenedorRef = useRef(null)

  const seleccionado = catalogo.find(t => t.id === value)

  useEffect(() => {
    function onClickFuera(e) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) setAbierto(false)
    }
    document.addEventListener('mousedown', onClickFuera)
    return () => document.removeEventListener('mousedown', onClickFuera)
  }, [])

  const q = query.trim().toLowerCase()
  let filtrados = catalogo
  if (q !== '') {
    const empiezaCon = catalogo.filter(t => t.descripcion?.toLowerCase().startsWith(q))
    const contiene = catalogo.filter(t => !empiezaCon.includes(t) && t.descripcion?.toLowerCase().includes(q))
    const porCategoria = catalogo.filter(t =>
      !empiezaCon.includes(t) && !contiene.includes(t) && t.categoria?.toLowerCase().includes(q)
    )
    filtrados = [...empiezaCon, ...contiene, ...porCategoria]
  }
  const filtradosLimitados = filtrados.slice(0, 100)

  function elegir(t) {
    onChange(t.id)
    setQuery('')
    setAbierto(false)
  }

  function onKeyDown(e) {
    if (!abierto && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { setAbierto(true); return }
    if (!abierto || filtradosLimitados.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setResaltado(i => (i + 1) % filtradosLimitados.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setResaltado(i => (i - 1 + filtradosLimitados.length) % filtradosLimitados.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtradosLimitados[resaltado]) elegir(filtradosLimitados[resaltado])
    } else if (e.key === 'Escape') {
      setAbierto(false)
    }
  }

  return (
    <div ref={contenedorRef} className="relative">
      <input
        aria-label="Buscar trabajo del catálogo"
        role="combobox"
        aria-expanded={abierto}
        aria-autocomplete="list"
        value={abierto ? query : (seleccionado ? seleccionado.descripcion : '')}
        onChange={e => { setQuery(e.target.value); setAbierto(true); setResaltado(0) }}
        onFocus={() => { setQuery(''); setAbierto(true); setResaltado(0) }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {abierto && (
        <div className="absolute z-10 mt-1 w-full max-h-96 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
          {filtradosLimitados.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">Sin resultados</p>
          ) : (
            <>
              {filtradosLimitados.map((t, i) => (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => elegir(t)}
                  onMouseEnter={() => setResaltado(i)}
                  className={`w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 ${
                    i === resaltado ? 'bg-gray-50 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {t.categoria && <span className="text-xs text-gray-400 mr-1.5">[{t.categoria}]</span>}
                  {t.descripcion}
                </button>
              ))}
              {filtrados.length > filtradosLimitados.length && (
                <p className="px-3 py-2 text-xs text-gray-400">Y {filtrados.length - filtradosLimitados.length} más — seguí escribiendo para acotar</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
