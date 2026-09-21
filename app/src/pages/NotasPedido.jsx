import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOnline, encolarNotaPedido } from '../lib/offline'
import Modal from '../components/Modal'
import ConfirmModal from '../components/ConfirmModal'
import MotivoModal from '../components/MotivoModal'
import BuscadorUnidad from '../components/BuscadorUnidad'
import MultiSelectFiltro from '../components/MultiSelectFiltro'

const ESTADOS = ['Pendiente', 'Aprobada', 'Rechazada', 'Cumplida']
const ESTADO_LABEL = Object.fromEntries(ESTADOS.map(e => [e, e]))
const PRIORIDADES =['normal', 'urgente']
const PRIORIDAD_LABEL = { normal: 'Normal', urgente: 'Urgente' }
const ESTADO_COLOR = {
  Pendiente: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Aprobada: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Rechazada: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  Cumplida: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
}
const INPUT = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm'

const moneda = n => Number(n ?? 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })
const fecha = f => new Date(f).toLocaleDateString('es-AR')
const nombreUnidad = u => [u?.patente_serie, u?.descripcion].filter(Boolean).join(' — ')

// Redimensiona y comprime la foto en un canvas; devuelve un Blob jpeg.
// Offline se usa una versión más chica para que la cola de localStorage aguante.
function comprimirFoto(file, ancho, calidad) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const escala = Math.min(1, ancho / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * escala)
      canvas.height = Math.round(img.height * escala)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo procesar la foto'))), 'image/jpeg', calidad)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la foto')) }
    img.src = url
  })
}

const blobADataUrl = blob => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(r.result)
  r.onerror = () => reject(new Error('No se pudo leer la foto'))
  r.readAsDataURL(blob)
})

const itemVacio = () => ({ producto: '', cantidad: '', observacion: '', foto: null })

function NuevaNotaModal({ unidades, usuario, onClose, onSaved }) {
  const [idUnidad, setIdUnidad] = useState('')
  const [prioridad, setPrioridad] = useState('normal')
  const [observacion, setObservacion] = useState('')
  const [items, setItems] = useState([itemVacio()])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const online = useOnline()

  function setItem(i, k, v) { setItems(its => its.map((it, j) => (j === i ? { ...it, [k]: v } : it))) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!idUnidad) { setError('Elegí la unidad'); return }
    for (const [i, it] of items.entries()) {
      if (!it.producto.trim()) { setError(`Producto ${i + 1}: falta el nombre`); return }
      if (!(Number(it.cantidad) > 0)) { setError(`Producto ${i + 1}: la cantidad debe ser mayor a 0`); return }
      if (!it.foto) { setError(`Producto ${i + 1}: la foto es obligatoria`); return }
    }
    setSaving(true)
    setError('')
    try {
      const argsBase = {
        p_id_unidad: idUnidad,
        p_prioridad: prioridad,
        p_observacion: observacion.trim() || null,
        p_id_cliente: crypto.randomUUID(),
      }
      const itemsBase = items.map(it => ({ producto: it.producto.trim(), cantidad: Number(it.cantidad), observacion: it.observacion.trim() || null }))

      if (!online) {
        const fotos = []
        for (const it of items) fotos.push(await blobADataUrl(await comprimirFoto(it.foto, 800, 0.6)))
        try {
          encolarNotaPedido({ ...argsBase, p_items: itemsBase }, fotos, `Nota de pedido: ${items.length} producto(s)`, usuario.empresa_id)
        } catch {
          setError('No hay espacio para guardar la nota sin conexión. Probá con menos productos o esperá a tener señal.')
          setSaving(false)
          return
        }
        onSaved('Guardada sin conexión — se enviará sola al volver la señal.')
        return
      }

      const itemsConFoto = []
      for (const [i, it] of itemsBase.entries()) {
        const blob = await comprimirFoto(items[i].foto, 1280, 0.8)
        const path = `${usuario.empresa_id}/notas-pedido/${crypto.randomUUID()}.jpg`
        const { error: upErr } = await supabase.storage.from('ot-fotos').upload(path, blob, { contentType: 'image/jpeg' })
        if (upErr) throw upErr
        itemsConFoto.push({ ...it, foto_url: supabase.storage.from('ot-fotos').getPublicUrl(path).data.publicUrl })
      }
      const { data, error: rpcErr } = await supabase.rpc('crear_nota_pedido', { ...argsBase, p_items: itemsConFoto })
      if (rpcErr) throw rpcErr
      if (!data?.ok) throw new Error(data?.msg ?? 'No se pudo crear la nota')
      onSaved('')
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal titulo="Nueva nota de pedido" onClose={onClose} ancho="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-3">
        {!online && (
          <p className="text-xs text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
            Sin señal: la nota se enviará sola al volver la conexión.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Unidad *</label>
            <BuscadorUnidad unidades={unidades} value={idUnidad} onChange={setIdUnidad} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Prioridad</label>
            <select value={prioridad} onChange={e => setPrioridad(e.target.value)} className={INPUT}>
              {PRIORIDADES.map(p => <option key={p} value={p}>{PRIORIDAD_LABEL[p]}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Observación general</label>
          <input value={observacion} onChange={e => setObservacion(e.target.value)} className={INPUT} />
        </div>

        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Producto {i + 1}</span>
                {items.length > 1 && (
                  <button type="button" onClick={() => setItems(its => its.filter((_, j) => j !== i))} className="text-xs text-red-600 hover:underline">Quitar</button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input value={it.producto} onChange={e => setItem(i, 'producto', e.target.value)} placeholder="Producto *" className={`${INPUT} col-span-2`} />
                <input type="number" min="0" step="0.01" value={it.cantidad} onChange={e => setItem(i, 'cantidad', e.target.value)} placeholder="Cantidad *" className={INPUT} />
              </div>
              <input value={it.observacion} onChange={e => setItem(i, 'observacion', e.target.value)} placeholder="Observación" className={INPUT} />
              <label className={`flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 cursor-pointer w-fit hover:bg-gray-50 dark:hover:bg-gray-700 ${it.foto ? 'border-green-300 text-green-700 dark:text-green-400' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>
                📷 {it.foto ? it.foto.name : 'Foto obligatoria'}
                <input type="file" accept="image/*" capture="environment" onChange={e => setItem(i, 'foto', e.target.files[0] ?? null)} className="hidden" />
              </label>
            </div>
          ))}
          <button type="button" onClick={() => setItems(its => [...its, itemVacio()])} className="text-sm text-blue-600 hover:underline">+ Agregar producto</button>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancelar</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Enviando…' : 'Enviar nota'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function CumplirModal({ nota, onClose, onSaved }) {
  const [monto, setMonto] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (monto === '' || Number(monto) < 0) { setError('Ingresá el costo total (0 si no tuvo costo)'); return }
    setSaving(true)
    setError('')
    const { data, error: err } = await supabase.rpc('cumplir_nota_pedido', { p_id: nota.id, p_monto: Number(monto) })
    setSaving(false)
    if (err) { setError(err.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo marcar como cumplida'); return }
    onSaved()
  }

  return (
    <Modal titulo={`Cumplir nota #${nota.numero}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">El costo se suma a los gastos de la unidad {nombreUnidad(nota.unidades)}.</p>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Costo total *</label>
          <input type="number" min="0" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} className={INPUT} autoFocus />
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancelar</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : 'Marcar cumplida'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function DetalleModal({ nota, onClose }) {
  const [foto, setFoto] = useState(null)
  return (
    <Modal titulo={`Nota #${nota.numero} — ${nombreUnidad(nota.unidades)}`} onClose={onClose} ancho="max-w-2xl">
      <div className="space-y-3 text-sm">
        <p className="text-gray-500 dark:text-gray-400">
          {nota.solicitante?.nombre} · {fecha(nota.fecha)} · {PRIORIDAD_LABEL[nota.prioridad]} · {nota.estado}
          {nota.estado === 'Cumplida' && ` · ${moneda(nota.monto)}`}
        </p>
        {nota.observacion && <p>{nota.observacion}</p>}
        {nota.estado === 'Rechazada' && <p className="text-red-600 dark:text-red-400">Motivo del rechazo: {nota.motivo_rechazo}</p>}
        <div className="space-y-2">
          {(nota.items || []).map(it => (
            <div key={it.id} className="flex items-center gap-3 border border-gray-200 dark:border-gray-700 rounded-lg p-2">
              <button type="button" onClick={() => setFoto(it.foto_url)} className="shrink-0">
                <img src={it.foto_url} alt={it.producto} className="w-16 h-16 object-cover rounded-md" />
              </button>
              <div className="min-w-0">
                <p className="font-medium text-gray-900 dark:text-gray-100">{it.producto} <span className="text-gray-500 font-normal">× {it.cantidad}</span></p>
                {it.observacion && <p className="text-xs text-gray-500 dark:text-gray-400">{it.observacion}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
      {foto && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={() => setFoto(null)}>
          <img src={foto} alt="" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </Modal>
  )
}

export default function NotasPedido({ usuario }) {
  const puedeGestionar = ['administrador', 'supervisor'].includes(usuario.rol)
  const [notas, setNotas] = useState([])
  const [unidades, setUnidades] = useState([])
  const [loading, setLoading] = useState(true)
  const [nuevaAbierta, setNuevaAbierta] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const [aprobarNota, setAprobarNota] = useState(null)
  const [rechazarNota, setRechazarNota] = useState(null)
  const [cumplirNota, setCumplirNota] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [filtroUnidades, setFiltroUnidades] = useState([])
  const [filtroEstados, setFiltroEstados] = useState(['Pendiente', 'Aprobada'])
  const [filtroPrioridades, setFiltroPrioridades] = useState([])

  async function cargar() {
    const [{ data: notasData }, { data: unidadesData }] = await Promise.all([
      supabase.from('notas_pedido')
        .select('*, unidades(descripcion, patente_serie), solicitante:usuarios!notas_pedido_id_solicitante_fkey(nombre), items:notas_pedido_items(id, producto, cantidad, foto_url, observacion)')
        .order('fecha', { ascending: false }),
      supabase.from('unidades').select('id, descripcion, patente_serie').eq('activo', true).order('descripcion'),
    ])
    setNotas(notasData || [])
    setUnidades(unidadesData || [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  // El administrador ve entrar las notas nuevas (y los cambios de estado) sin recargar.
  useEffect(() => {
    const canal = supabase
      .channel('notas_pedido_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notas_pedido' }, () => cargar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [])

  async function resolver(nota, aprobar, motivo = null) {
    setError('')
    const { data, error: err } = await supabase.rpc('resolver_nota_pedido', { p_id: nota.id, p_aprobar: aprobar, p_motivo: motivo })
    if (err) { setError(err.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo resolver la nota'); return }
    cargar()
  }

  const nombrePorUnidad = Object.fromEntries(unidades.map(u => [u.id, nombreUnidad(u)]))
  const notasFiltradas = notas
    .filter(n => filtroUnidades.length === 0 || filtroUnidades.includes(n.id_unidad))
    .filter(n => filtroEstados.length === 0 || filtroEstados.includes(n.estado))
    .filter(n => filtroPrioridades.length === 0 || filtroPrioridades.includes(n.prioridad))
    // Pendientes primero (urgentes antes); el resto queda por fecha desc (orden de la consulta).
    .sort((a, b) => {
      const peso = n => (n.estado === 'Pendiente' ? (n.prioridad === 'urgente' ? 0 : 1) : 2)
      return peso(a) - peso(b)
    })

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-base font-medium text-gray-900 dark:text-gray-100">Notas de pedido</h1>
        <button onClick={() => setNuevaAbierta(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
          + Nueva nota
        </button>
      </div>

      <div className="px-6 pt-4 flex flex-wrap gap-2">
        <MultiSelectFiltro label="Unidad" opciones={unidades.map(u => u.id)} seleccionados={filtroUnidades} onChange={setFiltroUnidades} etiquetas={nombrePorUnidad} soloEtiqueta />
        <MultiSelectFiltro label="Estado" opciones={ESTADOS} seleccionados={filtroEstados} onChange={setFiltroEstados} etiquetas={ESTADO_LABEL} soloEtiqueta />
        <MultiSelectFiltro label="Prioridad" opciones={PRIORIDADES} seleccionados={filtroPrioridades} onChange={setFiltroPrioridades} etiquetas={PRIORIDAD_LABEL} soloEtiqueta />
      </div>

      <div className="p-6 space-y-3">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {aviso && <p className="text-sm text-amber-600 dark:text-amber-400">{aviso}</p>}
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-8">Cargando…</p>
        ) : notasFiltradas.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">{notas.length === 0 ? 'No hay notas de pedido todavía' : 'Ninguna nota coincide con los filtros'}</p>
        ) : (
          notasFiltradas.map(n => (
            <div key={n.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <button type="button" onClick={() => setDetalle(n)} className="text-left min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    #{n.numero} — {nombreUnidad(n.unidades)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {n.solicitante?.nombre} · {fecha(n.fecha)} · {(n.items || []).length} producto(s)
                    {n.estado === 'Cumplida' && ` · ${moneda(n.monto)}`}
                  </p>
                  {n.estado === 'Rechazada' && <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">Rechazada: {n.motivo_rechazo}</p>}
                </button>
                <div className="flex items-center gap-2">
                  {n.prioridad === 'urgente' && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Urgente</span>}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_COLOR[n.estado]}`}>{n.estado}</span>
                </div>
              </div>
              {puedeGestionar && n.estado === 'Pendiente' && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setAprobarNota(n)} className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">Aprobar</button>
                  <button onClick={() => setRechazarNota(n)} className="text-xs px-3 py-1.5 border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">Rechazar</button>
                </div>
              )}
              {puedeGestionar && n.estado === 'Aprobada' && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setCumplirNota(n)} className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg">Marcar cumplida</button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {nuevaAbierta && (
        <NuevaNotaModal unidades={unidades} usuario={usuario} onClose={() => setNuevaAbierta(false)}
          onSaved={msg => { setNuevaAbierta(false); setAviso(msg); cargar() }} />
      )}
      {detalle && <DetalleModal nota={detalle} onClose={() => setDetalle(null)} />}
      {cumplirNota && <CumplirModal nota={cumplirNota} onClose={() => setCumplirNota(null)} onSaved={() => { setCumplirNota(null); cargar() }} />}
      {aprobarNota && (
        <ConfirmModal
          titulo="Aprobar nota"
          mensaje={`¿Aprobar la nota #${aprobarNota.numero} de ${nombreUnidad(aprobarNota.unidades)}?`}
          textoBoton="Aprobar"
          peligro={false}
          onConfirm={async () => { await resolver(aprobarNota, true); setAprobarNota(null) }}
          onClose={() => setAprobarNota(null)}
        />
      )}
      {rechazarNota && (
        <MotivoModal
          titulo={`Rechazar nota #${rechazarNota.numero}`}
          label="Motivo del rechazo *"
          textoBoton="Rechazar"
          onConfirm={async motivo => { await resolver(rechazarNota, false, motivo); setRechazarNota(null) }}
          onClose={() => setRechazarNota(null)}
        />
      )}
    </div>
  )
}
