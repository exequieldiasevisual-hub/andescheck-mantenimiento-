import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import ConfirmModal from '../components/ConfirmModal'

function NuevaEmpresaModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ alias: '', razon_social: '', usuario: '', password: '', nombre: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { data, error } = await supabase.rpc('alta_empresa_app', {
      p_alias: form.alias.trim(),
      p_razon_social: form.razon_social.trim(),
      p_usuario: form.usuario.trim(),
      p_password: form.password,
      p_nombre: form.nombre.trim(),
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data.msg); return }
    onSaved()
  }

  return (
    <Modal titulo="Nueva empresa" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Razón social *</label>
          <input value={form.razon_social} onChange={e => setField('razon_social', e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required autoFocus />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Alias (código de empresa para el login) *</label>
          <input value={form.alias} onChange={e => setField('alias', e.target.value)}
            placeholder="ej: acme" spellCheck={false}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
        </div>
        <p className="text-xs text-gray-400 -mt-2">Datos del primer usuario administrador de esta empresa:</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Nombre *</label>
            <input value={form.nombre} onChange={e => setField('nombre', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Usuario *</label>
            <input value={form.usuario} onChange={e => setField('usuario', e.target.value)}
              spellCheck={false} autoComplete="username"
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Contraseña *</label>
          <input type="password" value={form.password} onChange={e => setField('password', e.target.value)}
            autoComplete="new-password"
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400" aria-live="polite">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Creando…' : 'Crear empresa'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function PanelEmpresas() {
  const [empresas, setEmpresas] = useState(null)
  const [error, setError] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [empresaToggle, setEmpresaToggle] = useState(null)

  async function cargar() {
    const { data, error } = await supabase.rpc('get_empresas_resumen')
    if (error || !data?.ok) { setError(error?.message || data?.msg || 'No se pudo cargar el panel'); return }
    setError('')
    setEmpresas(data.empresas)
  }

  useEffect(() => { cargar() }, [])

  async function toggleEmpresa() {
    const { data, error } = await supabase.rpc('toggle_empresa_activa', {
      p_id_empresa: empresaToggle.id,
      p_activo: !empresaToggle.activo,
    })
    if (error) throw error
    if (!data?.ok) throw new Error(data.msg)
    setEmpresaToggle(null)
    cargar()
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-medium text-gray-900 dark:text-gray-100">Panel de Empresas</h1>
          <p className="text-xs text-gray-400 mt-0.5">Gestión de clientes de la plataforma — sin acceso al día a día operativo de cada empresa.</p>
        </div>
        <button onClick={() => setModalAbierto(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
          + Nueva empresa
        </button>
      </div>

      <div className="p-6">
        {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {empresas === null ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">Cargando…</div>
          ) : empresas.length === 0 ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">No hay empresas cargadas todavía</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-400 dark:text-gray-500 font-medium">
                  <th className="px-5 py-3 text-left">Razón social</th>
                  <th className="px-5 py-3 text-left">Alias</th>
                  <th className="px-5 py-3 text-left">Estado</th>
                  <th className="px-5 py-3 text-right">Usuarios</th>
                  <th className="px-5 py-3 text-right">Unidades</th>
                  <th className="px-5 py-3 text-right">OT abiertas</th>
                  <th className="px-5 py-3 text-left">Alta</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {empresas.map(e => (
                  <tr key={e.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-5 py-3 text-gray-900 dark:text-gray-100 font-medium">{e.razon_social}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs">{e.alias}</td>
                    <td className="px-5 py-3">
                      <span className={e.activo ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                        {e.activo ? 'Activa' : 'Desactivada'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">{e.usuarios}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">{e.unidades}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">{e.ot_abiertas}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{new Date(e.fecha_alta).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <button onClick={() => setEmpresaToggle(e)} className={`text-xs hover:underline ${e.activo ? 'text-red-500 dark:text-red-400' : 'text-blue-600'}`}>
                        {e.activo ? 'Desactivar' : 'Reactivar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modalAbierto && (
        <NuevaEmpresaModal
          onClose={() => setModalAbierto(false)}
          onSaved={() => { setModalAbierto(false); cargar() }}
        />
      )}

      {empresaToggle && (
        <ConfirmModal
          titulo={empresaToggle.activo ? 'Desactivar empresa' : 'Reactivar empresa'}
          mensaje={
            empresaToggle.activo
              ? `¿Desactivar "${empresaToggle.razon_social}"? Sus usuarios no van a poder loguearse ni seguir usando sesiones abiertas hasta que la reactives.`
              : `¿Reactivar "${empresaToggle.razon_social}"? Sus usuarios van a poder volver a loguearse.`
          }
          textoBoton={empresaToggle.activo ? 'Desactivar' : 'Reactivar'}
          peligro={empresaToggle.activo}
          onConfirm={toggleEmpresa}
          onClose={() => setEmpresaToggle(null)}
        />
      )}
    </div>
  )
}
