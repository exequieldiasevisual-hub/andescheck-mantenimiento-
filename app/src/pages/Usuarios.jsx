import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'

const ROLES = ['administrador', 'supervisor', 'jefe_taller', 'tecnico', 'auditor']

function UsuarioModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ usuario: '', password: '', nombre: '', apellido: '', email: '', dni: '', puesto: '', rol: 'tecnico' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.usuario.trim() || !form.password || !form.nombre.trim()) { setError('Faltan campos obligatorios'); return }
    setSaving(true)
    setError('')

    const { data, error } = await supabase.rpc('crear_usuario_admin', {
      p_usuario: form.usuario.trim(), p_password: form.password, p_nombre: form.nombre.trim(),
      p_apellido: form.apellido.trim(), p_email: form.email.trim(), p_dni: form.dni.trim(),
      p_puesto: form.puesto.trim(), p_rol: form.rol,
    })

    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo crear el usuario'); return }
    onSaved()
  }

  return (
    <Modal titulo="Nuevo usuario" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Nombre *</label>
            <input value={form.nombre} onChange={e => setField('nombre', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Apellido</label>
            <input value={form.apellido} onChange={e => setField('apellido', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Email</label>
            <input type="email" autoComplete="email" spellCheck={false} value={form.email} onChange={e => setField('email', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">DNI</label>
            <input inputMode="numeric" spellCheck={false} value={form.dni} onChange={e => setField('dni', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Puesto</label>
          <input value={form.puesto} onChange={e => setField('puesto', e.target.value)}
            placeholder="ej: Jefe de taller"
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Usuario *</label>
            <input autoComplete="username" spellCheck={false} value={form.usuario} onChange={e => setField('usuario', e.target.value)}
              placeholder="ej: jperez"
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Contraseña *</label>
            <input type="password" autoComplete="new-password" value={form.password} onChange={e => setField('password', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Rol</label>
          <select value={form.rol} onChange={e => setField('rol', e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm">
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function PerfilTecnicoModal({ tecnico, onClose, onSaved }) {
  const [form, setForm] = useState({
    telefono: tecnico.tecnicos_perfil?.telefono || '',
    tel_emergencia: tecnico.tecnicos_perfil?.tel_emergencia || '',
    direccion: tecnico.tecnicos_perfil?.direccion || '',
    especialidad: tecnico.tecnicos_perfil?.especialidad || '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { data, error } = await supabase.rpc('guardar_perfil_tecnico', {
      p_id_usuario: tecnico.id, p_telefono: form.telefono, p_tel_emergencia: form.tel_emergencia,
      p_direccion: form.direccion, p_especialidad: form.especialidad,
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo guardar'); return }
    onSaved()
  }

  return (
    <Modal titulo={`Perfil de ${tecnico.nombre}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Teléfono</label>
            <input value={form.telefono} onChange={e => setField('telefono', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tel. emergencia</label>
            <input value={form.tel_emergencia} onChange={e => setField('tel_emergencia', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Dirección</label>
          <input value={form.direccion} onChange={e => setField('direccion', e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Especialidad</label>
          <input value={form.especialidad} onChange={e => setField('especialidad', e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function CambiarPasswordModal({ tecnico, onClose, onSaved }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (password.length < 6) { setError('Mínimo 6 caracteres'); return }
    setSaving(true)
    setError('')
    const { data, error } = await supabase.rpc('cambiar_password_usuario_admin', { p_auth_user_id: tecnico.auth_user_id, p_password: password })
    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo cambiar la contraseña'); return }
    onSaved()
  }

  return (
    <Modal titulo={`Cambiar contraseña — ${tecnico.usuario}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="nueva-password" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Nueva contraseña *</label>
          <input
            id="nueva-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            autoFocus
          />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400" aria-live="polite">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : 'Cambiar contraseña'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function Usuarios({ usuario }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [perfilAbierto, setPerfilAbierto] = useState(null)
  const [passwordAbierto, setPasswordAbierto] = useState(null)
  const [error, setError] = useState('')
  const [mensajeExito, setMensajeExito] = useState('')

  const esAdmin = usuario?.rol === 'administrador'

  async function cargar() {
    setLoading(true)
    const { data } = await supabase.from('usuarios').select('*, tecnicos_perfil (telefono, tel_emergencia, direccion, especialidad)').order('nombre')
    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  async function toggleActivo(u) {
    setError('')
    const rpc = u.activo ? 'desactivar_usuario_admin' : 'reactivar_usuario_admin'
    const { data, error } = await supabase.rpc(rpc, { p_auth_user_id: u.auth_user_id })
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo actualizar el usuario'); return }
    cargar()
  }

  if (!esAdmin) return <p className="p-6 text-sm text-gray-400">Solo el administrador puede gestionar usuarios.</p>

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-base font-medium text-gray-900 dark:text-gray-100">Usuarios</h1>
        <button onClick={() => setModalAbierto(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
          + Nuevo usuario
        </button>
      </div>

      <div className="p-6">
        {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}
        {mensajeExito && <p className="text-sm text-green-600 dark:text-green-400 mb-3" aria-live="polite">{mensajeExito}</p>}

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">Cargando…</div>
          ) : items.length === 0 ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">No hay usuarios cargados todavía</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-400 dark:text-gray-500 font-medium">
                  <th className="px-5 py-3 text-left">Nombre</th>
                  <th className="px-5 py-3 text-left">Puesto</th>
                  <th className="px-5 py-3 text-left">Usuario</th>
                  <th className="px-5 py-3 text-left">Rol</th>
                  <th className="px-5 py-3 text-left">Estado</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map(u => (
                  <tr key={u.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-5 py-3 text-gray-900 dark:text-gray-100 font-medium">{[u.nombre, u.apellido].filter(Boolean).join(' ')}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{u.puesto || '—'}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{u.usuario}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400 capitalize">{u.rol}</td>
                    <td className="px-5 py-3">
                      <span className={u.activo ? 'text-gray-500 dark:text-gray-400' : 'text-red-600'}>{u.activo ? 'Activo' : 'Inactivo'}</span>
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {u.rol === 'tecnico' && (
                        <button onClick={() => setPerfilAbierto(u)} className="text-blue-600 hover:underline text-xs mr-3">
                          Perfil
                        </button>
                      )}
                      <button onClick={() => setPasswordAbierto(u)} className="text-blue-600 hover:underline text-xs mr-3">
                        Cambiar contraseña
                      </button>
                      {u.id !== usuario.id && (
                        <button onClick={() => toggleActivo(u)} className="text-blue-600 hover:underline text-xs">
                          {u.activo ? 'Desactivar' : 'Reactivar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modalAbierto && (
        <UsuarioModal
          onClose={() => setModalAbierto(false)}
          onSaved={() => { setModalAbierto(false); cargar() }}
        />
      )}

      {perfilAbierto && (
        <PerfilTecnicoModal
          tecnico={perfilAbierto}
          onClose={() => setPerfilAbierto(null)}
          onSaved={() => { setPerfilAbierto(null); cargar() }}
        />
      )}

      {passwordAbierto && (
        <CambiarPasswordModal
          tecnico={passwordAbierto}
          onClose={() => setPasswordAbierto(null)}
          onSaved={() => { setPasswordAbierto(null); setMensajeExito('Contraseña actualizada'); setTimeout(() => setMensajeExito(''), 4000) }}
        />
      )}
    </div>
  )
}
