import { useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { supabase } from '../lib/supabase'
import Modal from './Modal'

export default function FirmaModal({ idOt, empresaId, proceso, onClose, onGuardada }) {
  const padRef = useRef(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function limpiar() {
    padRef.current?.clear()
  }

  async function guardar() {
    if (padRef.current.isEmpty()) { setError('Falta la firma'); return }
    setSaving(true)
    setError('')

    const dataUrl = padRef.current.getCanvas().toDataURL('image/png')
    const blob = await (await fetch(dataUrl)).blob()
    const path = `${empresaId}/${idOt}/${proceso}-${Date.now()}.png`

    const { error: upErr } = await supabase.storage.from('ot-firmas').upload(path, blob, { contentType: 'image/png' })
    if (upErr) { setSaving(false); setError(upErr.message); return }

    const { data: { publicUrl } } = supabase.storage.from('ot-firmas').getPublicUrl(path)

    const { data, error: rpcErr } = await supabase.rpc('guardar_firma_ot', {
      p_id_ot: idOt, p_proceso: proceso, p_firma_url: publicUrl,
    })
    setSaving(false)
    if (rpcErr) { setError(rpcErr.message); return }
    if (!data?.ok) { setError(data.msg); return }
    onGuardada()
  }

  return (
    <Modal titulo={`Firma del ${proceso === 'tecnico' ? 'técnico' : 'supervisor'}`} onClose={onClose}>
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white">
        <SignatureCanvas ref={padRef} penColor="black" canvasProps={{ width: 400, height: 200, className: 'w-full' }} />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>}

      <div className="flex justify-between gap-2 pt-4">
        <button onClick={limpiar} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
          Limpiar
        </button>
        <div className="flex gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button onClick={guardar} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar firma'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
