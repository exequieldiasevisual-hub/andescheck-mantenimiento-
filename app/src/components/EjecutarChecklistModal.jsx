import { useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { supabase } from '../lib/supabase'
import { useOnline, encolarRpc } from '../lib/offline'
import { enviarChecklistMail } from '../lib/enviarChecklistMail'
import Modal from './Modal'
import ConfirmModal from './ConfirmModal'
import BuscadorUnidad from './BuscadorUnidad'

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

export default function EjecutarChecklistModal({ unidades, plantillas, itemsPorPlantilla, empresaId, onClose, onSaved }) {
  const [idUnidad, setIdUnidad] = useState('')
  const [idPlantilla, setIdPlantilla] = useState('')
  const [respuestas, setRespuestas] = useState({})
  const [fotos, setFotos] = useState([])
  const [error, setError] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const online = useOnline()
  const padRef = useRef(null)

  const unidadSeleccionada = unidades.find(u => u.id === idUnidad)
  const plantillasDisponibles = plantillas.filter(p => !p.tipo_unidad || !unidadSeleccionada || p.tipo_unidad === unidadSeleccionada.tipo)
  const items = itemsPorPlantilla[idPlantilla] || []

  function elegirPlantilla(id) { setIdPlantilla(id); setRespuestas({}) }
  function setRespuesta(idItem, valor) { setRespuestas(r => ({ ...r, [idItem]: valor })) }

  function handleSubmit(e) {
    e.preventDefault()
    if (!idUnidad) { setError('La unidad es obligatoria'); return }
    if (!idPlantilla) { setError('Elegí una plantilla'); return }
    const faltantes = items.filter(i => !respuestas[i.id]?.trim())
    if (faltantes.length > 0) { setError('Faltan responder ' + faltantes.length + ' ítem(s)'); return }
    if (padRef.current.isEmpty()) { setError('Falta la firma de quien completa el checklist'); return }
    setError('')
    setConfirmando(true)
  }

  async function guardar() {
    const ubicacion_url = await capturarUbicacion()
    const args = {
      p_id_plantilla: idPlantilla,
      p_id_unidad: idUnidad,
      p_respuestas: items.map(i => ({ id_item: i.id, respuesta: respuestas[i.id] })),
      p_ubicacion_url: ubicacion_url,
      p_firma_url: null,
      p_fotos_urls: null,
    }

    if (!online) {
      encolarRpc('ejecutar_checklist', args, `Checklist: ${unidadSeleccionada?.descripcion ?? ''}`)
      onSaved(null)
      return
    }

    const dataUrl = padRef.current.getCanvas().toDataURL('image/png')
    const blobFirma = await (await fetch(dataUrl)).blob()
    const pathFirma = `${empresaId}/checklists/firma-${Date.now()}.png`
    const { error: firmaErr } = await supabase.storage.from('ot-firmas').upload(pathFirma, blobFirma, { contentType: 'image/png' })
    if (firmaErr) throw firmaErr
    args.p_firma_url = supabase.storage.from('ot-firmas').getPublicUrl(pathFirma).data.publicUrl

    const fotos_urls = []
    for (const foto of fotos) {
      const path = `${empresaId}/checklists/${Date.now()}-${foto.name}`
      const { error: upErr } = await supabase.storage.from('ot-fotos').upload(path, foto)
      if (upErr) throw upErr
      fotos_urls.push(supabase.storage.from('ot-fotos').getPublicUrl(path).data.publicUrl)
    }
    if (fotos_urls.length > 0) args.p_fotos_urls = fotos_urls

    const { data, error: errRpc } = await supabase.rpc('ejecutar_checklist', args)
    if (errRpc) throw errRpc
    if (!data?.ok) throw new Error(data?.msg ?? 'No se pudo guardar el checklist')

    enviarChecklistMail(supabase, data.id_ejecucion)
    onSaved(data.novedades_generadas)
  }

  return (
    <Modal titulo="Realizar checklist" onClose={onClose} ancho="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Unidad *</label>
          <BuscadorUnidad unidades={unidades} value={idUnidad} onChange={setIdUnidad} />
        </div>

        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Plantilla *</label>
          <select value={idPlantilla} onChange={e => elegirPlantilla(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
            <option value="">Seleccionar plantilla...</option>
            {plantillasDisponibles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>

        {items.length > 0 && (
          <div className="space-y-3 border-t border-gray-100 dark:border-gray-800 pt-3">
            {items.map(item => (
              <div key={item.id}>
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">{item.pregunta}</p>
                {item.tipo_respuesta === 'texto' ? (
                  <textarea value={respuestas[item.id] || ''} onChange={e => setRespuesta(item.id, e.target.value)}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" rows={2} />
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    {(item.tipo_respuesta === 'si_no' ? ['Sí', 'No'] : ['Bien', 'Regular', 'Mal']).map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setRespuesta(item.id, v)}
                        className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                          respuestas[item.id] === v
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Fotos</label>
          <label className="flex items-center gap-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 w-fit">
            📷 {fotos.length > 0 ? `${fotos.length} foto(s) seleccionada(s)` : 'Adjuntar fotos (opcional)'}
            <input type="file" accept="image/*" capture="environment" multiple onChange={e => setFotos(Array.from(e.target.files))} className="hidden" />
          </label>
        </div>

        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Firma de quien completa *</label>
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white">
            <SignatureCanvas ref={padRef} penColor="black" canvasProps={{ width: 400, height: 150, className: 'w-full' }} />
          </div>
          <button type="button" onClick={() => padRef.current?.clear()} className="text-xs text-blue-600 hover:underline mt-1">
            Limpiar firma
          </button>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="submit" className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
            Guardar checklist
          </button>
        </div>
      </form>

      {confirmando && (
        <ConfirmModal
          titulo="Confirmar checklist"
          mensaje={online
            ? '¿Estás seguro? Se va a guardar el checklist y enviarlo por mail automáticamente a los destinatarios configurados.'
            : '¿Estás seguro? Sin conexión el checklist se guarda localmente y se sincroniza solo — la firma, las fotos y el mail se procesan recién en ese momento.'}
          textoBoton="Confirmar y guardar"
          peligro={false}
          onConfirm={guardar}
          onClose={() => setConfirmando(false)}
        />
      )}
    </Modal>
  )
}
