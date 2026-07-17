import { useState } from 'react'
import { resolverAlias, login, getAliasGuardado } from '../lib/auth'
import logoAndesCheck from '../assets/andescheck-logo.svg'

export default function Login({ onLogin }) {
  const [paso, setPaso] = useState('alias')
  const [alias, setAlias] = useState(getAliasGuardado())
  const [empresa, setEmpresa] = useState(null)
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleAlias(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await resolverAlias(alias)
    setLoading(false)
    if (!result.ok) {
      setError(result.msg)
      return
    }
    setEmpresa(result)
    setPaso('credenciales')
  }

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await login(usuario, password, alias)
    setLoading(false)
    if (!result.ok) {
      setError(result.msg)
      return
    }
    onLogin()
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <img src={logoAndesCheck} alt="AndesCheck Cloud Management" className="w-48 mb-4" width={192} height={106} />
          <h1 className="text-lg font-semibold text-blue-700 dark:text-blue-300">AndesCheck</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Sistema de Gestión de Mantenimiento</p>
        </div>

        <hr className="border-gray-200 dark:border-gray-700 my-6" />

        {paso === 'alias' && (
          <form onSubmit={handleAlias} className="space-y-4">
            <div>
              <label htmlFor="login-alias" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide uppercase mb-1.5">
                Código de empresa
              </label>
              <input
                id="login-alias"
                type="text"
                autoComplete="organization"
                spellCheck={false}
                autoFocus
                value={alias}
                onChange={e => setAlias(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400" aria-live="polite">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Verificando…' : 'Continuar'}
            </button>
          </form>
        )}

        {paso === 'credenciales' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="login-usuario" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide uppercase mb-1.5">Usuario</label>
              <input
                id="login-usuario"
                type="text"
                autoComplete="username"
                spellCheck={false}
                autoFocus
                value={usuario}
                onChange={e => setUsuario(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wide uppercase mb-1.5">Contraseña</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400" aria-live="polite">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Ingresando…' : 'Ingresar'}
            </button>

            <button
              type="button"
              onClick={() => { setPaso('alias'); setEmpresa(null); setError('') }}
              className="w-full text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              Cambiar de empresa
            </button>
          </form>
        )}

        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-6">
          Desarrollado por <span className="font-semibold text-gray-500 dark:text-gray-400">AndesCheck</span> Cloud Management
        </p>
      </div>
    </div>
  )
}
