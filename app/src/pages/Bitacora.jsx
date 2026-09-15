import { useEffect, useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import ConfirmModal from '../components/ConfirmModal'
import BuscadorUnidad from '../components/BuscadorUnidad'

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

  async function handleSubmit(e) {
    e.preventDefault()
    if (!concepto.trim() || monto === '') { setError('Faltan campos obligatorios'); return }
    setSaving(true)
    setError('')

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

function RendirViajeModal({ viaje, empresaId, onClose, onSaved }) {
  const padRef = useRef(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const totalGastado = (viaje.gastos || []).reduce((s, g) => s + Number(g.monto), 0)
  const sobra = Number(viaje.viaticos_monto) - totalGastado

  async function confirmar() {
    if (padRef.current.isEmpty()) { setError('Falta la firma'); return }
    setSaving(true)
    setError('')

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

        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Firma</p>
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white">
            <SignatureCanvas ref={padRef} penColor="black" canvasProps={{ width: 400, height: 150, className: 'w-full' }} />
          </div>
          <button type="button" onClick={() => padRef.current?.clear()} className="text-xs text-blue-600 hover:underline mt-1">Limpiar firma</button>
        </div>

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
  const [rendirViajeSel, setRendirViajeSel] = useState(null)
  const [viajeEliminar, setViajeEliminar] = useState(null)
  const [error, setError] = useState('')

  async function cargar() {
    setLoading(true)
    const { data: viajesData } = await supabase.from('bitacora_viajes')
      .select('*, unidades(descripcion, patente_serie), chofer:usuarios!bitacora_viajes_id_chofer_fkey(nombre), gastos:bitacora_gastos(id, concepto, monto, foto_url)')
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

  async function aprobar(viaje) {
    setError('')
    const { data, error } = await supabase.rpc('aprobar_viaje', { p_id_viaje: viaje.id })
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo aprobar'); return }
    cargar()
  }

  async function eliminar() {
    const { data, error } = await supabase.rpc('eliminar_viaje_bitacora', { p_id_viaje: viajeEliminar.id })
    if (error) throw error
    if (!data?.ok) throw new Error(data?.msg ?? 'No se pudo eliminar')
    setViajeEliminar(null)
    cargar()
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-base font-medium text-gray-900 dark:text-gray-100">Bitácora</h1>
        {puedeGestionar && (
          <button onClick={() => setNuevoViajeAbierto(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            + Nuevo viaje
          </button>
        )}
      </div>

      <div className="p-6 space-y-3">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-8">Cargando…</p>
        ) : viajes.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No hay viajes cargados todavía</p>
        ) : (
          viajes.map(v => {
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
                </div>

                {v.gastos?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {v.gastos.map(g => (
                      <p key={g.id} className="text-xs text-gray-600 dark:text-gray-400">
                        • {g.concepto}: {moneda(g.monto)}
                        {g.foto_url && <a href={g.foto_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline ml-1">Ver ticket</a>}
                      </p>
                    ))}
                  </div>
                )}

                {v.firma_url && (
                  <a href={v.firma_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline block mt-2">Ver firma</a>
                )}

                <div className="flex gap-3 mt-3">
                  {esChofer && v.estado === 'En_curso' && (
                    <>
                      <button onClick={() => setGastoViaje(v)} className="text-xs text-blue-600 hover:underline">+ Agregar gasto</button>
                      <button onClick={() => setRendirViajeSel(v)} className="text-xs text-green-600 hover:underline">Rendir y firmar</button>
                    </>
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
          onSaved={() => { setGastoViaje(null); cargar() }}
        />
      )}

      {rendirViajeSel && (
        <RendirViajeModal
          viaje={rendirViajeSel}
          empresaId={usuario.empresa_id}
          onClose={() => setRendirViajeSel(null)}
          onSaved={() => { setRendirViajeSel(null); cargar() }}
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
    </div>
  )
}
