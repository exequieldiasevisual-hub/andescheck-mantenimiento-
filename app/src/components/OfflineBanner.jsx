import { useState } from 'react'
import { useOnline, useColaPendiente, sincronizarCola } from '../lib/offline'
import { supabase } from '../lib/supabase'

export default function OfflineBanner() {
  const online = useOnline()
  const cola = useColaPendiente()
  const [sincronizando, setSincronizando] = useState(false)

  async function sincronizar() {
    setSincronizando(true)
    await sincronizarCola(supabase)
    setSincronizando(false)
  }

  if (online && cola.length === 0) return null

  return (
    <div className={`px-4 py-1.5 text-xs text-center text-white ${online ? 'bg-blue-600' : 'bg-amber-600'}`}>
      {!online && '📵 Sin conexión — las novedades y notas se guardan localmente y se sincronizan al reconectar'}
      {online && cola.length > 0 && (
        <>
          {cola.length} cambio(s) pendiente(s) de sincronizar.{' '}
          <button onClick={sincronizar} disabled={sincronizando} className="underline font-medium disabled:opacity-50">
            {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
          </button>
        </>
      )}
    </div>
  )
}
