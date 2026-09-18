import { useEffect, useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { supabase } from '../lib/supabase'
import { useOnline, encolarRpc } from '../lib/offline'
import Modal from '../components/Modal'
import ConfirmModal from '../components/ConfirmModal'
import BuscadorUnidad from '../components/BuscadorUnidad'
import logoAndesCheck from '../assets/andescheck-logo.svg'

const ESTADO_COLOR = {
  En_curso: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Rendido: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Aprobado: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
}
const ESTADO_LABEL = { En_curso: 'En curso', Rendido: 'Rendido — esperando aprobación', Aprobado: 'Aprobado' }
const moneda = n => `$${Number(n || 0).toLocaleString('es-AR')}`

function NuevoViajeModal({ unidades, choferes, onClose, onSaved }) {
  const [form, setForm] = useState({
    id_unidad: '', id_chofer: '', fecha: new Date().toISOString().slice(0, 10), origen: '', destino: '',
    ubicacion_maps_url: '', celular_contacto: '', km: '', viaticos_monto: '', viaticos_metodo: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.id_unidad) { setError('La unidad es obligatoria'); return }
    if (!form.id_chofer) { setError('El chofer es obligatorio'); return }
    if (!form.destino.trim()) { setError('El destino es obligatorio'); return }
    setSaving(true)
    setError('')
    const { data, error } = await supabase.rpc('crear_viaje_bitacora', {
      p_id_unidad: form.id_unidad, p_id_chofer: form.id_chofer, p_fecha: form.fecha || null,
      p_origen: form.origen || null, p_destino: form.destino.trim(),
      p_ubicacion_maps_url: form.ubicacion_maps_url || null, p_celular_contacto: form.celular_contacto || null,
      p_km: form.km === '' ? null : Number(form.km),
      p_viaticos_monto: form.viaticos_monto === '' ? 0 : Number(form.viaticos_monto),
      p_viaticos_metodo: form.viaticos_metodo || null,
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo crear el viaje'); return }
    onSaved()
  }

  return (
    <Modal titulo="Nuevo viaje" onClose={onClose} ancho="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Unidad *</label>
            <BuscadorUnidad unidades={unidades} value={form.id_unidad} onChange={id => setField('id_unidad', id)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Chofer *</label>
            <select value={form.id_chofer} onChange={e => setField('id_chofer', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required>
              <option value="">Seleccionar...</option>
              {choferes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Origen</label>
            <input value={form.origen} onChange={e => setField('origen', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Destino *</label>
            <input value={form.destino} onChange={e => setField('destino', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Link de Google Maps (ubicación de destino)</label>
          <input value={form.ubicacion_maps_url} onChange={e => setField('ubicacion_maps_url', e.target.value)}
            placeholder="https://maps.google.com/..."
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Celular de contacto en destino</label>
            <input value={form.celular_contacto} onChange={e => setField('celular_contacto', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Fecha</label>
            <input type="date" value={form.fecha} onChange={e => setField('fecha', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Km (base → destino)</label>
          <input type="number" value={form.km} onChange={e => setField('km', e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Viáticos asignados</label>
            <input type="number" step="0.01" value={form.viaticos_monto} onChange={e => setField('viaticos_monto', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Método</label>
            <select value={form.viaticos_metodo} onChange={e => setField('viaticos_metodo', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm">
              <option value="">Seleccionar...</option>
              <option value="Transferencia">Transferencia</option>
              <option value="Cheque">Cheque</option>
              <option value="Efectivo">Efectivo</option>
            </select>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancelar</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Creando…' : 'Crear viaje'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function AgregarGastoModal({ viaje, empresaId, onClose, onSaved }) {
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const [foto, setFoto] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const online = useOnline()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!concepto.trim() || monto === '') { setError('Faltan campos obligatorios'); return }
    setSaving(true)
    setError('')

    if (!online) {
      encolarRpc('registrar_gasto_bitacora', {
        p_id_viaje: viaje.id, p_concepto: concepto.trim(), p_monto: Number(monto), p_foto_url: null,
      }, `Gasto: ${concepto.trim()} — ${viaje.destino}`)
      setSaving(false)
      onSaved(foto ? 'sin_conexion_con_foto' : 'sin_conexion')
      return
    }

    let foto_url = null
    if (foto) {
      const path = `${empresaId}/bitacora/${viaje.id}/${Date.now()}-${foto.name}`
      const { error: upErr } = await supabase.storage.from('ot-fotos').upload(path, foto)
      if (upErr) { setSaving(false); setError(upErr.message); return }
      foto_url = supabase.storage.from('ot-fotos').getPublicUrl(path).data.publicUrl
    }

    const { data, error } = await supabase.rpc('registrar_gasto_bitacora', {
      p_id_viaje: viaje.id, p_concepto: concepto.trim(), p_monto: Number(monto), p_foto_url: foto_url,
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo cargar el gasto'); return }
    onSaved()
  }

  return (
    <Modal titulo={`Nuevo gasto — ${viaje.destino}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {!online && (
          <p className="text-xs text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
            Sin conexión: el gasto se guarda igual y se sincroniza solo, pero la foto del ticket no se va a poder adjuntar.
          </p>
        )}
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Concepto *</label>
          <input value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Ej: Almuerzo"
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Monto *</label>
          <input type="number" step="0.01" value={monto} onChange={e => setMonto(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Foto del ticket</label>
          <label className="flex items-center gap-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 w-fit">
            📷 {foto ? foto.name : 'Adjuntar foto'}
            <input type="file" accept="image/*" capture="environment" onChange={e => setFoto(e.target.files[0] ?? null)} className="hidden" />
          </label>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancelar</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : 'Agregar gasto'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function EditarGastoModal({ gasto, onClose, onSaved }) {
  const [concepto, setConcepto] = useState(gasto.concepto)
  const [monto, setMonto] = useState(String(gasto.monto))
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!concepto.trim() || monto === '') { setError('Faltan campos obligatorios'); return }
    if (!motivo.trim()) { setError('Falta el motivo de la modificación'); return }
    setSaving(true)
    setError('')
    const { data, error } = await supabase.rpc('editar_gasto_bitacora', {
      p_id_gasto: gasto.id, p_concepto: concepto.trim(), p_monto: Number(monto), p_motivo: motivo.trim(),
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo editar el gasto'); return }
    onSaved()
  }

  return (
    <Modal titulo="Editar gasto" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Concepto *</label>
          <input value={concepto} onChange={e => setConcepto(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Monto *</label>
          <input type="number" step="0.01" value={monto} onChange={e => setMonto(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Motivo de la modificación *</label>
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2}
            placeholder="Ej: se cargó mal el monto del ticket"
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancelar</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function AgregarViaticosModal({ viaje, onClose, onSaved }) {
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (monto === '' || Number(monto) <= 0) { setError('Ingresá un monto válido'); return }
    setSaving(true)
    setError('')
    const { data, error } = await supabase.rpc('agregar_viaticos_bitacora', {
      p_id_viaje: viaje.id, p_monto: Number(monto), p_metodo: metodo || null,
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo cargar los viáticos'); return }
    onSaved()
  }

  return (
    <Modal titulo={`Sumar viáticos — ${viaje.destino}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Viáticos asignados hasta ahora: {moneda(viaje.viaticos_monto)}
        </p>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Monto a sumar *</label>
          <input type="number" step="0.01" value={monto} onChange={e => setMonto(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required autoFocus />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Método</label>
          <select value={metodo} onChange={e => setMetodo(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900">
            <option value="">Seleccionar...</option>
            <option value="Transferencia">Transferencia</option>
            <option value="Cheque">Cheque</option>
            <option value="Efectivo">Efectivo</option>
          </select>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancelar</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : 'Sumar viáticos'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function RendirViajeModal({ viaje, empresaId, onClose, onSaved }) {
  const padRef = useRef(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const online = useOnline()

  const totalGastado = (viaje.gastos || []).reduce((s, g) => s + Number(g.monto), 0)
  const sobra = Number(viaje.viaticos_monto) - totalGastado

  async function confirmar() {
    if (online && padRef.current.isEmpty()) { setError('Falta la firma'); return }
    setSaving(true)
    setError('')

    if (!online) {
      encolarRpc('rendir_viaje', { p_id_viaje: viaje.id, p_firma_url: null }, `Rendición: ${viaje.destino}`)
      setSaving(false)
      onSaved('sin_conexion')
      return
    }

    const dataUrl = padRef.current.getCanvas().toDataURL('image/png')
    const blob = await (await fetch(dataUrl)).blob()
    const path = `${empresaId}/${viaje.id}/rendicion-${Date.now()}.png`
    const { error: upErr } = await supabase.storage.from('ot-firmas').upload(path, blob, { contentType: 'image/png' })
    if (upErr) { setSaving(false); setError(upErr.message); return }
    const { data: { publicUrl } } = supabase.storage.from('ot-firmas').getPublicUrl(path)

    const { data, error } = await supabase.rpc('rendir_viaje', { p_id_viaje: viaje.id, p_firma_url: publicUrl })
    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo rendir el viaje'); return }
    onSaved()
  }

  return (
    <Modal titulo={`Rendir viaje — ${viaje.destino}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-sm space-y-1">
          <p>Km del viaje: <span className="font-medium">{viaje.km ?? '—'}</span></p>
          <p>Viáticos asignados: <span className="font-medium">{moneda(viaje.viaticos_monto)}</span></p>
          <p>Total gastado: <span className="font-medium">{moneda(totalGastado)}</span></p>
          <p className={sobra >= 0 ? 'text-green-600' : 'text-red-600'}>
            {sobra >= 0 ? 'Sobra' : 'Excedido'}: <span className="font-medium">{moneda(Math.abs(sobra))}</span>
          </p>
        </div>

        {online ? (
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Firma</p>
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white">
              <SignatureCanvas ref={padRef} penColor="black" canvasProps={{ width: 400, height: 150, className: 'w-full' }} />
            </div>
            <button type="button" onClick={() => padRef.current?.clear()} className="text-xs text-blue-600 hover:underline mt-1">Limpiar firma</button>
          </div>
        ) : (
          <p className="text-xs text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
            Sin conexión: la rendición se guarda igual y se sincroniza sola, pero la firma no se va a poder registrar en este momento.
          </p>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancelar</button>
          <button type="button" onClick={confirmar} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Rindiendo…' : 'Confirmar rendición'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function Bitacora({ usuario }) {
  const esChofer = usuario.rol === 'chofer'
  const puedeGestionar = ['administrador', 'supervisor'].includes(usuario.rol)
  const [viajes, setViajes] = useState([])
  const [unidades, setUnidades] = useState([])
  const [choferes, setChoferes] = useState([])
  const [loading, setLoading] = useState(true)
  const [nuevoViajeAbierto, setNuevoViajeAbierto] = useState(false)
  const [gastoViaje, setGastoViaje] = useState(null)
  const [viaticosViaje, setViaticosViaje] = useState(null)
  const [gastoEditar, setGastoEditar] = useState(null)
  const [gastoEliminar, setGastoEliminar] = useState(null)
  const [rendirViajeSel, setRendirViajeSel] = useState(null)
  const [viajeEliminar, setViajeEliminar] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [busqueda, setBusqueda] = useState('')

  function manejarGuardadoOffline(signal) {
    if (signal === 'sin_conexion_con_foto') setAviso('Guardado sin conexión — se sincroniza solo. La foto del ticket no se pudo adjuntar.')
    else if (signal === 'sin_conexion') setAviso('Guardado sin conexión — se sincroniza solo.')
    else setAviso('')
  }

  async function cargar() {
    setLoading(true)
    const { data: viajesData } = await supabase.from('bitacora_viajes')
      .select('*, unidades(descripcion, patente_serie), chofer:usuarios!bitacora_viajes_id_chofer_fkey(nombre), gastos:bitacora_gastos(id, concepto, monto, foto_url, motivo_edicion), viaticos_adicionales:bitacora_viaticos_adicionales(id, monto, metodo, fecha_alta)')
      .order('fecha', { ascending: false })
    setViajes(viajesData || [])

    if (puedeGestionar) {
      const [{ data: unidadesData }, { data: choferesData }] = await Promise.all([
        supabase.from('unidades').select('id, descripcion, patente_serie').eq('activo', true).order('descripcion'),
        supabase.from('usuarios').select('id, nombre').eq('rol', 'chofer').eq('activo', true).order('nombre'),
      ])
      setUnidades(unidadesData || [])
      setChoferes(choferesData || [])
    }
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  // Se actualiza sola cuando cambia algo en la Bitácora desde otra sesión
  // (ej: el chofer rinde un viaje y el administrador lo ve sin recargar).
  useEffect(() => {
    const canal = supabase
      .channel('bitacora_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bitacora_viajes' }, () => cargar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bitacora_gastos' }, () => cargar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bitacora_viaticos_adicionales' }, () => cargar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [])

  async function aprobar(viaje) {
    setError('')
    const { data, error } = await supabase.rpc('aprobar_viaje', { p_id_viaje: viaje.id })
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo aprobar'); return }
    cargar()
  }

  function imprimirViaje(viaje) {
    const totalGastado = (viaje.gastos || []).reduce((s, g) => s + Number(g.monto), 0)
    const sobra = Number(viaje.viaticos_monto) - totalGastado
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bitácora — ${viaje.destino}</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:13px;color:#222;padding:24px}
        .logo{text-align:center;margin-bottom:12px}
        .logo img{height:48px}
        .header{border-bottom:2px solid #E8821A;padding-bottom:12px;margin-bottom:16px}
        .info{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;margin-bottom:16px}
        th{background:#2D3748;color:#fff;padding:7px 10px;text-align:left;font-size:11px}
        td{padding:7px 10px;border-bottom:1px solid #eee;vertical-align:top}
        .total{text-align:right;font-weight:700;font-size:16px}
        .ticket{max-width:160px;max-height:160px;display:block;margin-top:4px}
        .firma{max-width:300px;max-height:150px;border:1px solid #ccc;margin-top:6px}
        .footer{margin-top:24px;text-align:center;font-size:10px;color:#a0aec0}
        @media print{button{display:none}}
      </style></head><body>
      <div class="logo"><img src="${new URL(logoAndesCheck, window.location.origin).href}" alt="AndesCheck" /></div>
      <div class="header"><strong>BITÁCORA — ${viaje.origen ? `${viaje.origen} → ` : ''}${viaje.destino}</strong></div>
      <div class="info">
        <div><strong>Unidad:</strong> ${[viaje.unidades?.patente_serie, viaje.unidades?.descripcion].filter(Boolean).join(' — ')}</div>
        <div><strong>Chofer:</strong> ${viaje.chofer?.nombre ?? ''}</div>
        <div><strong>Fecha:</strong> ${new Date(viaje.fecha).toLocaleDateString()}</div>
        <div><strong>Estado:</strong> ${ESTADO_LABEL[viaje.estado] ?? viaje.estado}</div>
        <div><strong>Km:</strong> ${viaje.km ?? '—'}</div>
        <div><strong>Viáticos:</strong> ${moneda(viaje.viaticos_monto)} (${viaje.viaticos_metodo || '—'})</div>
      </div>
      <strong>GASTOS</strong>
      <table><thead><tr><th>Concepto</th><th>Monto</th><th>Ticket</th></tr></thead><tbody>
        ${(viaje.gastos || []).map(g => `<tr><td>${g.concepto}${g.motivo_edicion ? `<br><small style="color:#b45309">Editado: ${g.motivo_edicion}</small>` : ''}</td><td>${moneda(g.monto)}</td><td>${g.foto_url ? `<img class="ticket" src="${g.foto_url}" />` : '—'}</td></tr>`).join('')}
      </tbody></table>
      <div class="total">Gastado: ${moneda(totalGastado)} · ${sobra >= 0 ? 'Sobra' : 'Excedido'}: ${moneda(Math.abs(sobra))}</div>
      ${viaje.firma_url ? `<strong>FIRMA</strong><br><img class="firma" src="${viaje.firma_url}" />` : ''}
      <div class="footer">Powered by AndesCheck</div>
      <script>window.print()<\/script>
      </body></html>`)
    w.document.close()
  }

  async function eliminar() {
    const { data, error } = await supabase.rpc('eliminar_viaje_bitacora', { p_id_viaje: viajeEliminar.id })
    if (error) throw error
    if (!data?.ok) throw new Error(data?.msg ?? 'No se pudo eliminar')
    setViajeEliminar(null)
    cargar()
  }

  async function eliminarGasto() {
    const { data, error } = await supabase.rpc('eliminar_gasto_bitacora', { p_id_gasto: gastoEliminar.id })
    if (error) throw error
    if (!data?.ok) throw new Error(data?.msg ?? 'No se pudo eliminar el gasto')
    setGastoEliminar(null)
    cargar()
  }

  const q = busqueda.trim().toLowerCase()
  const viajesFiltrados = viajes
    .filter(v => !q || v.unidades?.patente_serie?.toLowerCase().includes(q) || v.unidades?.descripcion?.toLowerCase().includes(q))
    .slice()
    .sort((a, b) => (a.estado === 'En_curso' ? 0 : 1) - (b.estado === 'En_curso' ? 0 : 1))

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-base font-medium text-gray-900 dark:text-gray-100">Bitácora</h1>
        <div className="flex items-center gap-3">
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="🔍 Buscar por unidad…"
            className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 w-56"
          />
          {puedeGestionar && (
            <button onClick={() => setNuevoViajeAbierto(true)}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
              + Nuevo viaje
            </button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-3">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {aviso && <p className="text-sm text-amber-600 dark:text-amber-400">{aviso}</p>}
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-8">Cargando…</p>
        ) : viajesFiltrados.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">{viajes.length === 0 ? 'No hay viajes cargados todavía' : 'Ningún viaje coincide con la búsqueda'}</p>
        ) : (
          viajesFiltrados.map(v => {
            const totalGastado = (v.gastos || []).reduce((s, g) => s + Number(g.monto), 0)
            const sobra = Number(v.viaticos_monto) - totalGastado
            return (
              <div key={v.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {v.origen ? `${v.origen} → ` : ''}{v.destino}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {[v.unidades?.patente_serie, v.unidades?.descripcion].filter(Boolean).join(' — ')} · {v.chofer?.nombre} · {new Date(v.fecha).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLOR[v.estado] ?? ''}`}>{ESTADO_LABEL[v.estado]}</span>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {v.km != null && <span>{v.km} km</span>}
                  {v.ubicacion_maps_url && <a href={v.ubicacion_maps_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">📍 Ver ubicación</a>}
                  {v.celular_contacto && <span>📞 {v.celular_contacto}</span>}
                  <span>Viáticos: {moneda(v.viaticos_monto)} ({v.viaticos_metodo || '—'})</span>
                  <span>Gastado: {moneda(totalGastado)}</span>
                  <span className={sobra >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {sobra >= 0 ? 'Sobra' : 'Excedido'}: {moneda(Math.abs(sobra))}
                  </span>
                  {puedeGestionar && v.estado === 'En_curso' && (
                    <button type="button" onClick={() => setViaticosViaje(v)} className="text-blue-600 hover:underline">+ Viáticos</button>
                  )}
                </div>

                {v.viaticos_adicionales?.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {v.viaticos_adicionales.map(a => (
                      <p key={a.id} className="text-xs text-gray-500 dark:text-gray-400">
                        + Viáticos: {moneda(a.monto)} ({a.metodo || '—'}) — {new Date(a.fecha_alta).toLocaleDateString()}
                      </p>
                    ))}
                  </div>
                )}

                {v.gastos?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {v.gastos.map(g => (
                      <p key={g.id} className="text-xs text-gray-600 dark:text-gray-400">
                        • {g.concepto}: {moneda(g.monto)}
                        {g.foto_url && <a href={g.foto_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline ml-1">Ver ticket</a>}
                        {(esChofer || puedeGestionar) && v.estado === 'En_curso' && (
                          <button type="button" onClick={() => setGastoEditar(g)} title="Editar gasto" className="text-gray-400 hover:text-blue-600 ml-1">✏️</button>
                        )}
                        {puedeGestionar && v.estado === 'En_curso' && (
                          <button type="button" onClick={() => setGastoEliminar(g)} title="Eliminar gasto" className="text-gray-400 hover:text-red-600 ml-1">🗑</button>
                        )}
                        {g.motivo_edicion && <span className="text-amber-600 dark:text-amber-400 ml-1" title={`Editado: ${g.motivo_edicion}`}>(editado)</span>}
                      </p>
                    ))}
                  </div>
                )}

                {v.firma_url && (
                  <a href={v.firma_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline block mt-2">Ver firma</a>
                )}

                <div className="flex gap-3 mt-3">
                  <button onClick={() => imprimirViaje(v)} className="text-xs text-gray-500 dark:text-gray-400 hover:underline">🖨 Imprimir / PDF</button>
                  {(esChofer || puedeGestionar) && v.estado === 'En_curso' && (
                    <button onClick={() => setGastoViaje(v)} className="text-xs text-blue-600 hover:underline">+ Agregar gasto</button>
                  )}
                  {(esChofer || puedeGestionar) && v.estado === 'En_curso' && (
                    <button onClick={() => setRendirViajeSel(v)} className="text-xs text-green-600 hover:underline">Rendir y firmar</button>
                  )}
                  {puedeGestionar && v.estado === 'Rendido' && (
                    <button onClick={() => aprobar(v)} className="text-xs text-green-600 hover:underline">Aprobar</button>
                  )}
                  {puedeGestionar && v.estado === 'En_curso' && (
                    <button onClick={() => setViajeEliminar(v)} className="text-xs text-red-500 dark:text-red-400 hover:underline">Eliminar</button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {nuevoViajeAbierto && (
        <NuevoViajeModal
          unidades={unidades}
          choferes={choferes}
          onClose={() => setNuevoViajeAbierto(false)}
          onSaved={() => { setNuevoViajeAbierto(false); cargar() }}
        />
      )}

      {gastoViaje && (
        <AgregarGastoModal
          viaje={gastoViaje}
          empresaId={usuario.empresa_id}
          onClose={() => setGastoViaje(null)}
          onSaved={(signal) => { setGastoViaje(null); manejarGuardadoOffline(signal); cargar() }}
        />
      )}

      {viaticosViaje && (
        <AgregarViaticosModal
          viaje={viaticosViaje}
          onClose={() => setViaticosViaje(null)}
          onSaved={() => { setViaticosViaje(null); cargar() }}
        />
      )}

      {gastoEditar && (
        <EditarGastoModal
          gasto={gastoEditar}
          onClose={() => setGastoEditar(null)}
          onSaved={() => { setGastoEditar(null); cargar() }}
        />
      )}

      {rendirViajeSel && (
        <RendirViajeModal
          viaje={rendirViajeSel}
          empresaId={usuario.empresa_id}
          onClose={() => setRendirViajeSel(null)}
          onSaved={(signal) => { setRendirViajeSel(null); manejarGuardadoOffline(signal); cargar() }}
        />
      )}

      {viajeEliminar && (
        <ConfirmModal
          titulo="Eliminar viaje"
          mensaje={`¿Eliminar el viaje a "${viajeEliminar.destino}"?`}
          textoBoton="Eliminar"
          onConfirm={eliminar}
          onClose={() => setViajeEliminar(null)}
        />
      )}

      {gastoEliminar && (
        <ConfirmModal
          titulo="Eliminar gasto"
          mensaje={`¿Eliminar el gasto "${gastoEliminar.concepto}" (${moneda(gastoEliminar.monto)})?`}
          textoBoton="Eliminar"
          onConfirm={eliminarGasto}
          onClose={() => setGastoEliminar(null)}
        />
      )}
    </div>
  )
}
