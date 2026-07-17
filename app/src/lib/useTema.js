import { useEffect, useState } from 'react'

function aplicarTema(modo) {
  document.documentElement.classList.toggle('dark', modo === 'oscuro')
}

export function useTema() {
  const [tema, setTema] = useState(() => localStorage.getItem('tema') || 'claro')

  useEffect(() => {
    aplicarTema(tema)
    localStorage.setItem('tema', tema)
  }, [tema])

  function alternar() {
    setTema(t => (t === 'claro' ? 'oscuro' : 'claro'))
  }

  return { tema, alternar }
}
