import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { exportarXlsx } from '../lib/exportarXlsx'
import Modal from '../components/Modal'
import ConfirmModal from '../components/ConfirmModal'

const VACIO = { razon_social: '', cuit: '', mail: '', telefono: '', direccion: '', ubicacion: '', observaciones: '' }

function ProveedorModal({ proveedor, empresaId, onClose, onSaved }) {
  const [form, setForm] = useState(proveedor || VACIO)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.razon_social.trim()) { setError('La razón social es obligatoria'); return }
    setSaving(true)
    setError('')

    const payload = {
      empresa_id: empresaId,
      razon_social: form.razon_social.trim(),
      cuit: form.cuit || null,
      mail: form.mail || null,
      telefono: form.telefono || null,
      direccion: form.direccion || null,
      ubicacion: form.ubicacion || null,
      observaciones: form.observaciones || null,
    }

    const query = proveedor?.id
      ? supabase.from('proveedores').update(payload).eq('id', proveedor.id)
      : supabase.from('proveedores').insert(payload)

    const { error } = await query
    setSaving(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  return (
    <Modal titulo={proveedor?.id ? 'Editar proveedor' : 'Nuevo proveedor'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Razón social *</label>
          <input value={form.razon_social} onChange={e => setField('razon_social', e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">CUIT</label>
            <input value={form.cuit || ''} onChange={e => setField('cuit', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Teléfono</label>
            <input value={form.telefono || ''} onChange={e => setField('telefono', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Mail</label>
          <input value={form.mail || ''} onChange={e => setField('mail', e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Dirección</label>
            <input value={form.direccion || ''} onChange={e => setField('direccion', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Ubicación</label>
            <input value={form.ubicacion || ''} onChange={e => setField('ubicacion', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Observaciones</label>
          <textarea value={form.observaciones || ''} onChange={e => setField('observaciones', e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" rows={2} />
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

export default function Proveedores({ usuario }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [proveedorEditar, setProveedorEditar] = useState(null)
  const [proveedorEliminar, setProveedorEliminar] = useState(null)

  const puedeEscribir = ['administrador', 'supervisor'].includes(usuario?.rol)

  async function cargar() {
    setLoading(true)
    const { data } = await supabase.from('proveedores').select('*').eq('activo', true).order('razon_social')
    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  async function eliminarProveedor() {
    const { error } = await supabase.from('proveedores').update({ activo: false }).eq('id', proveedorEliminar.id)
    if (error) throw error
    setProveedorEliminar(null)
    cargar()
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-base font-medium text-gray-900 dark:text-gray-100">Proveedores</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportarXlsx('proveedores', items, [
              { label: 'Razón social', get: p => p.razon_social },
              { label: 'CUIT', get: p => p.cuit },
              { label: 'Teléfono', get: p => p.telefono },
              { label: 'Mail', get: p => p.mail },
              { label: 'Dirección', get: p => p.direccion },
            ])}
            className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg transition-colors"
          >
            ↓ Excel
          </button>
          {puedeEscribir && (
            <button onClick={() => { setProveedorEditar(null); setModalAbierto(true) }}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
              + Nuevo proveedor
            </button>
          )}
        </div>
      </div>

      <div className="p-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">Cargando…</div>
          ) : items.length === 0 ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">No hay proveedores cargados todavía</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-400 dark:text-gray-500 font-medium">
                  <th className="px-5 py-3 text-left">Razón social</th>
                  <th className="px-5 py-3 text-left">CUIT</th>
                  <th className="px-5 py-3 text-left">Teléfono</th>
                  <th className="px-5 py-3 text-left">Mail</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map(p => (
                  <tr key={p.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-5 py-3 text-gray-900 dark:text-gray-100 font-medium">{p.razon_social}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{p.cuit || '—'}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{p.telefono || '—'}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{p.mail || '—'}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {puedeEscribir && (
                        <>
                          <button onClick={() => { setProveedorEditar(p); setModalAbierto(true) }} className="text-blue-600 hover:underline text-xs mr-3">Editar</button>
                          <button onClick={() => setProveedorEliminar(p)} className="text-red-500 dark:text-red-400 hover:underline text-xs">Eliminar</button>
                        </>
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
        <ProveedorModal
          proveedor={proveedorEditar}
          empresaId={usuario.empresa_id}
          onClose={() => setModalAbierto(false)}
          onSaved={() => { setModalAbierto(false); cargar() }}
        />
      )}

      {proveedorEliminar && (
        <ConfirmModal
          titulo="Dar de baja proveedor"
          mensaje={`¿Dar de baja "${proveedorEliminar.razon_social}"?`}
          textoBoton="Dar de baja"
          onConfirm={eliminarProveedor}
          onClose={() => setProveedorEliminar(null)}
        />
      )}
    </div>
  )
}
