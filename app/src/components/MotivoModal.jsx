import { useState } from 'react'
import Modal from './Modal'

// Modal genérico para pedir un texto obligatorio (motivo, descripción) —
// reemplaza los prompt() nativos del navegador.
export default function MotivoModal({ titulo, label, placeholder, valorInicial = '', textoBoton = 'Confirmar', onConfirm, onClose }) {
  const [texto, setTexto] = useState(valorInicial)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!texto.trim()) { setError('Este campo es obligatorio'); return }
    setSaving(true)
    setError('')
    await onConfirm(texto.trim())
    setSaving(false)
  }

  return (
    <Modal titulo={titulo} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</label>
          <textarea value={texto} onChange={e => setTexto(e.target.value)} placeholder={placeholder}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" rows={3} required autoFocus />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : textoBoton}
          </button>
        </div>
      </form>
    </Modal>
  )
}
