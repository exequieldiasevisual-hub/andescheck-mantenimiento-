import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOnline, encolar } from '../lib/offline'
import Modal from './Modal'
import BuscadorUnidad from './BuscadorUnidad'
import SelectConfig from './SelectConfig'

function capturarUbicacion() {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve(`https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`),
      () => resolve(null),
      { timeout: 5000 }
    )
  })
}

export default function NovedadModal({ unidades, usuario, onClose, onSaved }) {
  const [form, setForm] = useState({ id_unidad: '', descripcion: '', tipo: '' })
  const [foto, setFoto] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const online = useOnline()

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.id_unidad) { setError('La unidad es obligatoria'); return }
    if (!form.descripcion.trim()) { setError('La descripción es obligatoria'); return }
    setSaving(true)
    setError('')

    // Sin conexión no se puede subir la foto a Storage — se encola solo el
    // resto de la novedad y se sincroniza sola al reconectar.
    if (!online) {
      encolar('novedades', {
        empresa_id: usuario.empresa_id,
        id_unidad: form.id_unidad,
        descripcion: form.descripcion.trim(),
        tipo: form.tipo || null,
        usuario_carga: usuario.id,
        ubicacion_url: null,
      }, `Novedad: ${unidades.find(u => u.id === form.id_unidad)?.descripcion ?? ''}`)
      setSaving(false)
      if (foto) setError('La foto no se guardó — necesita conexión. La novedad sí quedó guardada y se sincronizará sola.')
      onSaved()
      return
    }

    const ubicacion_url = await capturarUbicacion()

    let foto_url = null
    if (foto) {
      const path = `${usuario.empresa_id}/novedades/${Date.now()}-${foto.name}`
      const { error: upErr } = await supabase.storage.from('ot-fotos').upload(path, foto)
      if (upErr) { setSaving(false); setError(upErr.message); return }
      foto_url = supabase.storage.from('ot-fotos').getPublicUrl(path).data.publicUrl
    }

    const payload = {
      empresa_id: usuario.empresa_id,
      id_unidad: form.id_unidad,
      descripcion: form.descripcion.trim(),
      tipo: form.tipo || null,
      usuario_carga: usuario.id,
      ubicacion_url,
      foto_url,
    }

    const { error } = await supabase.from('novedades').insert(payload)

    setSaving(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  return (
    <Modal titulo="Nueva novedad" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Unidad *</label>
          <BuscadorUnidad unidades={unidades} value={form.id_unidad} onChange={id => setField('id_unidad', id)} />
        </div>
        <SelectConfig label="Tipo" seccion="tipos_novedad" value={form.tipo} onChange={v => setField('tipo', v)} dosColumnas={false} />
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Descripción *</label>
          <textarea value={form.descripcion} onChange={e => setField('descripcion', e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" rows={3} required />
        </div>
        <label className="flex items-center gap-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 w-fit">
          📷 {foto ? foto.name : 'Adjuntar foto (opcional)'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={e => setFoto(e.target.files[0] ?? null)}
            className="hidden"
          />
        </label>

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
