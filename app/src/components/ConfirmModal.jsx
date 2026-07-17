import { useState } from 'react'
import Modal from './Modal'

// Reemplaza confirm() nativo para acciones destructivas — con botón
// deshabilitado mientras se ejecuta y feedback de error inline.
export default function ConfirmModal({ titulo, mensaje, textoBoton = 'Confirmar', peligro = true, onConfirm, onClose }) {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function confirmar() {
    setSaving(true)
    setError('')
    try {
      await onConfirm()
    } catch (err) {
      setSaving(false)
      setError(err.message || 'No se pudo completar la acción')
    }
  }

  return (
    <Modal titulo={titulo} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-400">{mensaje}</p>

        {error && <p className="text-sm text-red-600 dark:text-red-400" aria-live="polite">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={saving}
            className={`px-4 py-2 text-sm text-white rounded-lg transition-colors disabled:opacity-50 ${peligro ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {saving ? 'Confirmando…' : textoBoton}
          </button>
        </div>
      </div>
    </Modal>
  )
}
