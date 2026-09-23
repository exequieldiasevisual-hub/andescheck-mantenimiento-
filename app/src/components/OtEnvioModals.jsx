import { useState } from 'react'
import Modal from './Modal'

// Usados tanto desde el detalle de la OT como desde su tarjeta en el listado.
export function EnviarMailModal({ valorInicial, onClose, onConfirm }) {
  const [destinatario, setDestinatario] = useState(valorInicial || '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!destinatario.trim()) { setError('El email es obligatorio'); return }
    setSaving(true)
    setError('')
    try {
      await onConfirm(destinatario.trim())
    } catch (err) {
      setSaving(false)
      setError(err.message)
    }
  }

  return (
    <Modal titulo="Enviar OT por mail" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="mail-ot-destinatario" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Email destinatario *</label>
          <input
            id="mail-ot-destinatario"
            type="email"
            autoComplete="email"
            spellCheck={false}
            value={destinatario}
            onChange={e => setDestinatario(e.target.value)}
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
            {saving ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function EnviarWhatsappModal({ valorInicial, onClose, onConfirm }) {
  const [telefono, setTelefono] = useState(valorInicial || '')
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    const soloDigitos = telefono.replace(/\D/g, '')
    if (!soloDigitos) { setError('Ingresá un número válido'); return }
    onConfirm(soloDigitos)
  }

  return (
    <Modal titulo="Enviar OT por WhatsApp" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="whatsapp-ot-telefono" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
            Número (con código de país, solo dígitos) *
          </label>
          <input
            id="whatsapp-ot-telefono"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            spellCheck={false}
            value={telefono}
            onChange={e => setTelefono(e.target.value)}
            placeholder="Ej: 5493511234567"
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
          <button type="submit" className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
            Enviar
          </button>
        </div>
      </form>
    </Modal>
  )
}
