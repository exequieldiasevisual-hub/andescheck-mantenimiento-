import { useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { supabase } from '../lib/supabase'
import { useOnline, encolarRpc } from '../lib/offline'
import { enviarChecklistMail } from '../lib/enviarChecklistMail'
import { comprimirFoto, blobADataUrl } from '../lib/fotos'
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

export default function EjecutarChecklistModal({ unidades, plantillas, itemsPorPlantilla, empresaId, unidadInicial = '', onClose, onSaved }) {
  const [idUnidad, setIdUnidad] = useState(unidadInicial)
  const [idPlantilla, setIdPlantilla] = useState('')
  const [respuestas, setRespuestas] = useState({})
  const [fotos, setFotos] = useState([])
  const [fotosItem, setFotosItem] = useState({}) // id del ítem -> File (foto obligatoria de esa respuesta)
  const [km, setKm] = useState('')
  const [hs, setHs] = useState('')
  const [error, setError] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [intentoSubmit, setIntentoSubmit] = useState(false)
  const online = useOnline()
  const padRef = useRef(null)
  const refsItems = useRef({})

  const unidadSeleccionada = unidades.find(u => u.id === idUnidad)
  const plantillasDisponibles = plantillas.filter(p => !p.tipo_unidad || !unidadSeleccionada || p.tipo_unidad === unidadSeleccionada.tipo)
  const items = itemsPorPlantilla[idPlantilla] || []
  // La plantilla define si pide km / hs y si son obligatorios ('no' | 'opcional' | 'obligatorio').
  const plantillaSel = plantillas.find(p => p.id === idPlantilla)
  const kmModo = plantillaSel?.km_modo ?? 'no'
  const hsModo = plantillaSel?.hs_modo ?? 'no'

  // Foto obligatoria: solo cuando la respuesta de un ítem configurado con "foto obligatoria" genera novedad.
  const requiereFoto = item => item.foto_obligatoria && item.dispara_novedad && item.tipo_respuesta !== 'fecha'
    && item.valor_disparador && respuestas[item.id]?.trim().toLowerCase() === item.valor_disparador.trim().toLowerCase()
  function elegirPlantilla(id) { setIdPlantilla(id); setRespuestas({}); setFotosItem({}) }
  function setRespuesta(idItem, valor) { setRespuestas(r => ({ ...r, [idItem]: valor })) }

  function handleSubmit(e) {
    e.preventDefault()
    if (!idUnidad) { setError('La unidad es obligatoria'); return }
    if (!idPlantilla) { setError('Elegí una plantilla'); return }
    const faltantes = items.filter(i => !respuestas[i.id]?.trim())
    if (faltantes.length > 0) {
      setIntentoSubmit(true)
      setError('Faltan responder ' + faltantes.length + ' ítem(s) — marcados en rojo')
      refsItems.current[faltantes[0].id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    const sinFoto = items.filter(i => requiereFoto(i) && !fotosItem[i.id])
    if (sinFoto.length > 0) {
      setIntentoSubmit(true)
      setError('Falta la foto obligatoria en ' + sinFoto.length + ' respuesta(s) que generan novedad — marcadas en rojo')
      refsItems.current[sinFoto[0].id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (kmModo === 'obligatorio' && km === '') { setError('El km es obligatorio en este checklist'); return }
    if (hsModo === 'obligatorio' && hs === '') { setError('Las hs son obligatorias en este checklist'); return }
    if (kmModo !== 'no' && km !== '' && unidadSeleccionada?.km_actuales != null && Number(km) < Number(unidadSeleccionada.km_actuales)) {
      setError(`El km ingresado (${km}) no puede ser menor al último registrado (${unidadSeleccionada.km_actuales})`); return
    }
    if (hsModo !== 'no' && hs !== '' && unidadSeleccionada?.hs_actuales != null && Number(hs) < Number(unidadSeleccionada.hs_actuales)) {
      setError(`Las hs ingresadas (${hs}) no pueden ser menores a las últimas registradas (${unidadSeleccionada.hs_actuales})`); return
    }
    if (padRef.current.isEmpty()) { setError('Falta la firma de quien completa el checklist'); return }
    setError('')
    setConfirmando(true)
  }

  async function guardar() {
    const ubicacion_url = await capturarUbicacion()
    // Foto de cada respuesta que la exige: online se sube a Storage; sin conexión
    // viaja comprimida en la cola (foto_dataurl) y se sube al sincronizar.
    const respuestasArmadas = []
    for (const i of items) {
      const r = { id_item: i.id, respuesta: respuestas[i.id] }
      if (requiereFoto(i) && fotosItem[i.id]) {
        if (online) {
          const blob = await comprimirFoto(fotosItem[i.id], 1280, 0.8)
          const path = `${empresaId}/checklists/${crypto.randomUUID()}.jpg`
          const { error: upErr } = await supabase.storage.from('ot-fotos').upload(path, blob, { contentType: 'image/jpeg' })
          if (upErr) throw upErr
          r.foto_url = supabase.storage.from('ot-fotos').getPublicUrl(path).data.publicUrl
        } else {
          r.foto_dataurl = await blobADataUrl(await comprimirFoto(fotosItem[i.id], 800, 0.6))
        }
      }
      respuestasArmadas.push(r)
    }
    const args = {
      p_id_plantilla: idPlantilla,
      p_id_unidad: idUnidad,
      p_respuestas: respuestasArmadas,
      p_ubicacion_url: ubicacion_url,
      p_firma_url: null,
      p_fotos_urls: null,
      p_km: kmModo !== 'no' && km !== '' ? Number(km) : null,
      p_hs: hsModo !== 'no' && hs !== '' ? Number(hs) : null,
    }

    if (!online) {
      try {
        encolarRpc('ejecutar_checklist', args, `Checklist: ${unidadSeleccionada?.descripcion ?? ''}`, { empresaId })
      } catch {
        throw new Error('No hay espacio para guardar el checklist sin conexión. Probá con menos fotos o esperá a tener señal.')
      }
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

        {(kmModo !== 'no' || hsModo !== 'no') && (
          <div className="grid grid-cols-2 gap-3">
            {kmModo !== 'no' && (
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Km actuales{kmModo === 'obligatorio' ? ' *' : ''} {unidadSeleccionada?.km_actuales != null && <span className="text-gray-400">(último: {unidadSeleccionada.km_actuales})</span>}
                </label>
                <input type="number" min="0" value={km} onChange={e => setKm(e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
              </div>
            )}
            {hsModo !== 'no' && (
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Hs actuales{hsModo === 'obligatorio' ? ' *' : ''} {unidadSeleccionada?.hs_actuales != null && <span className="text-gray-400">(última: {unidadSeleccionada.hs_actuales})</span>}
                </label>
                <input type="number" min="0" value={hs} onChange={e => setHs(e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
              </div>
            )}
          </div>
        )}

        {items.length > 0 && (
          <div className="space-y-3 border-t border-gray-100 dark:border-gray-800 pt-3">
            {items.map(item => {
              const falta = intentoSubmit && !respuestas[item.id]?.trim()
              return (
              <div key={item.id} ref={el => { refsItems.current[item.id] = el }} className={falta ? 'border border-red-400 dark:border-red-600 rounded-lg p-2 -m-2' : ''}>
                <p className={`text-sm mb-1 ${falta ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>
                  {item.pregunta} {falta && <span className="text-xs">— falta responder</span>}
                </p>
                {requiereFoto(item) && (
                  <div className="mb-2">
                    <label className={`flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 cursor-pointer w-fit hover:bg-gray-50 dark:hover:bg-gray-700 ${
                      intentoSubmit && !fotosItem[item.id] ? 'border-red-400 text-red-600 dark:text-red-400' : fotosItem[item.id] ? 'border-green-300 text-green-700 dark:text-green-400' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>
                      📷 {fotosItem[item.id] ? fotosItem[item.id].name : 'Foto obligatoria (esta respuesta genera una novedad)'}
                      <input type="file" accept="image/*" onChange={e => setFotosItem(f => ({ ...f, [item.id]: e.target.files[0] ?? null }))} className="hidden" />
                    </label>
                  </div>
                )}
                {item.tipo_respuesta === 'texto' ? (
                  <textarea value={respuestas[item.id] || ''} onChange={e => setRespuesta(item.id, e.target.value)}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" rows={2} />
                ) : item.tipo_respuesta === 'fecha' ? (
                  <input type="date" value={respuestas[item.id] || ''} onChange={e => setRespuesta(item.id, e.target.value)}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
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
              )
            })}
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
