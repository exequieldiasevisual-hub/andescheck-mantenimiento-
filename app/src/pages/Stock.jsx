import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { exportarXlsx } from '../lib/exportarXlsx'
import Modal from '../components/Modal'
import SelectConfig from '../components/SelectConfig'
import ConfirmModal from '../components/ConfirmModal'

const VACIO = { codigo: '', descripcion: '', stock_actual: '0', stock_minimo: '0', unidad_medida: 'unidad' }

function RepuestoModal({ repuesto, empresaId, depositoDefault, onClose, onSaved }) {
  const [form, setForm] = useState(repuesto || VACIO)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.codigo.trim() || !form.descripcion.trim()) { setError('Código y descripción son obligatorios'); return }
    setSaving(true)
    setError('')

    if (repuesto?.id) {
      const { error } = await supabase.from('stock').update({
        codigo: form.codigo.trim(),
        descripcion: form.descripcion.trim(),
        stock_minimo: Number(form.stock_minimo) || 0,
        unidad_medida: form.unidad_medida || 'unidad',
      }).eq('id', repuesto.id)
      setSaving(false)
      if (error) { setError(error.code === '23505' ? 'Ya existe un repuesto con ese código' : error.message); return }
      onSaved()
      return
    }

    const stockInicial = Number(form.stock_actual) || 0
    const { data: nuevo, error } = await supabase.from('stock').insert({
      empresa_id: empresaId,
      codigo: form.codigo.trim(),
      descripcion: form.descripcion.trim(),
      stock_actual: stockInicial,
      stock_minimo: Number(form.stock_minimo) || 0,
      unidad_medida: form.unidad_medida || 'unidad',
    }).select('id').single()

    if (error) {
      setSaving(false)
      setError(error.code === '23505' ? 'Ya existe un repuesto con ese código' : error.message)
      return
    }

    if (stockInicial > 0 && depositoDefault) {
      await supabase.from('stock_por_deposito').insert({ id_repuesto: nuevo.id, id_deposito: depositoDefault, cantidad: stockInicial })
    }

    setSaving(false)
    onSaved()
  }

  return (
    <Modal titulo={repuesto?.id ? 'Editar repuesto' : 'Nuevo repuesto'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Código *</label>
            <input value={form.codigo} onChange={e => setField('codigo', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
          </div>
          <SelectConfig label="Unidad de medida" seccion="unidades_medida" value={form.unidad_medida} onChange={v => setField('unidad_medida', v)} dosColumnas={false} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Descripción *</label>
          <input value={form.descripcion} onChange={e => setField('descripcion', e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
        </div>
        {!repuesto?.id && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Stock físico inicial</label>
              <input type="number" value={form.stock_actual} onChange={e => setField('stock_actual', e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Stock mínimo</label>
              <input type="number" value={form.stock_minimo} onChange={e => setField('stock_minimo', e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        )}
        {repuesto?.id && (
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Stock mínimo</label>
            <input type="number" value={form.stock_minimo} onChange={e => setField('stock_minimo', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
          </div>
        )}
        {repuesto?.id && (
          <p className="text-xs text-gray-400">El stock físico se ajusta con Ingreso/Egreso por depósito, no acá.</p>
        )}

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

function MovimientoModal({ item, tipo, depositos, onClose, onSaved }) {
  const [idDeposito, setIdDeposito] = useState(depositos[0]?.id || '')
  const [cantidad, setCantidad] = useState('')
  const [destinatario, setDestinatario] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const cant = Number(cantidad)
    if (!idDeposito) { setError('Elegí un depósito'); return }
    if (!cant || cant <= 0) { setError('Cantidad inválida'); return }
    if (tipo === 'egreso' && !destinatario.trim()) { setError('El destinatario es obligatorio para un egreso'); return }
    setSaving(true)
    setError('')

    const { data, error } = await supabase.rpc('movimiento_stock', {
      p_id_repuesto: item.id, p_tipo: tipo, p_cantidad: cant, p_id_deposito: idDeposito,
      p_destinatario: tipo === 'egreso' ? destinatario.trim() : null,
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data.msg); return }
    onSaved()
  }

  return (
    <Modal titulo={`${tipo === 'ingreso' ? 'Ingreso' : 'Egreso'} — ${item.descripcion}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Depósito *</label>
          <select value={idDeposito} onChange={e => setIdDeposito(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required>
            {depositos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Cantidad *</label>
          <input type="number" value={cantidad} onChange={e => setCantidad(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required autoFocus />
        </div>
        {tipo === 'egreso' && (
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Destinatario (persona / OT) *</label>
            <input value={destinatario} onChange={e => setDestinatario(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
          </div>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : 'Confirmar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function TransferenciaModal({ item, depositos, onClose, onSaved }) {
  const [origen, setOrigen] = useState(depositos[0]?.id || '')
  const [destino, setDestino] = useState(depositos[1]?.id || '')
  const [cantidad, setCantidad] = useState('')
  const [observacion, setObservacion] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const cant = Number(cantidad)
    if (!origen || !destino) { setError('Elegí origen y destino'); return }
    if (origen === destino) { setError('El origen y el destino no pueden ser el mismo depósito'); return }
    if (!cant || cant <= 0) { setError('Cantidad inválida'); return }
    setSaving(true)
    setError('')

    const { data, error } = await supabase.rpc('transferir_stock', {
      p_id_repuesto: item.id, p_id_deposito_origen: origen, p_id_deposito_destino: destino,
      p_cantidad: cant, p_observacion: observacion.trim() || null,
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data.msg); return }
    onSaved()
  }

  return (
    <Modal titulo={`Transferir — ${item.descripcion}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Desde *</label>
            <select value={origen} onChange={e => setOrigen(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required>
              {depositos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Hacia *</label>
            <select value={destino} onChange={e => setDestino(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required>
              {depositos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Cantidad *</label>
          <input type="number" value={cantidad} onChange={e => setCantidad(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required autoFocus />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Observación</label>
          <input value={observacion} onChange={e => setObservacion(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Transfiriendo…' : 'Transferir'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function DesgloseDepositosModal({ item, onClose }) {
  const [filas, setFilas] = useState(null)

  useEffect(() => {
    supabase.from('stock_por_deposito').select('cantidad, depositos (nombre)').eq('id_repuesto', item.id)
      .then(({ data }) => setFilas(data || []))
  }, [item.id])

  return (
    <Modal titulo={`Stock por depósito — ${item.descripcion}`} onClose={onClose}>
      {filas === null ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : filas.length === 0 ? (
        <p className="text-sm text-gray-400">Sin desglose registrado todavía.</p>
      ) : (
        <ul className="space-y-1">
          {filas.map((f, i) => (
            <li key={i} className="flex justify-between text-sm border-t border-gray-100 dark:border-gray-800 pt-1.5 first:border-t-0 first:pt-0">
              <span className="text-gray-600 dark:text-gray-400">{f.depositos?.nombre}</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{f.cantidad}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

function DepositosModal({ empresaId, depositos, onClose, onChange }) {
  const [error, setError] = useState('')
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [desactivarConfirm, setDesactivarConfirm] = useState(null)

  async function agregar(e) {
    e.preventDefault()
    if (!nuevoNombre.trim()) return
    setError('')
    const { error } = await supabase.from('depositos').insert({ empresa_id: empresaId, nombre: nuevoNombre.trim() })
    if (error) { setError(error.code === '23505' ? 'Ya existe un depósito con ese nombre' : error.message); return }
    setNuevoNombre('')
    onChange()
  }

  async function editar(d, nombre) {
    if (!nombre.trim() || nombre.trim() === d.nombre) return
    setError('')
    const { error } = await supabase.from('depositos').update({ nombre: nombre.trim() }).eq('id', d.id)
    if (error) setError(error.code === '23505' ? 'Ya existe un depósito con ese nombre' : error.message)
    else onChange()
  }

  async function desactivar() {
    const { error } = await supabase.from('depositos').update({ activo: false }).eq('id', desactivarConfirm.id)
    if (error) throw error
    setDesactivarConfirm(null)
    onChange()
  }

  return (
    <Modal titulo="Depósitos" onClose={onClose}>
      <div className="space-y-2">
        {error && <p className="text-sm text-red-600 dark:text-red-400" aria-live="polite">{error}</p>}
        {depositos.map(d => (
          <div key={d.id} className="flex items-center gap-2 text-sm border-t border-gray-100 dark:border-gray-800 pt-2 first:border-t-0 first:pt-0">
            <input
              aria-label={`Nombre del depósito ${d.nombre}`}
              defaultValue={d.nombre}
              onBlur={e => editar(d, e.target.value)}
              className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-sm bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300"
            />
            {depositos.length > 1 && (
              <button onClick={() => setDesactivarConfirm(d)} className="text-xs text-red-500 hover:underline whitespace-nowrap">Desactivar</button>
            )}
          </div>
        ))}
        <form onSubmit={agregar} className="flex items-center gap-2 pt-2">
          <input
            aria-label="Nombre del nuevo depósito"
            value={nuevoNombre}
            onChange={e => setNuevoNombre(e.target.value)}
            placeholder="Nombre del nuevo depósito"
            className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-sm"
          />
          <button type="submit" className="text-xs text-blue-600 hover:underline whitespace-nowrap">+ Agregar</button>
        </form>
      </div>

      {desactivarConfirm && (
        <ConfirmModal
          titulo="Desactivar depósito"
          mensaje={`¿Desactivar el depósito "${desactivarConfirm.nombre}"?`}
          textoBoton="Desactivar"
          onConfirm={desactivar}
          onClose={() => setDesactivarConfirm(null)}
        />
      )}
    </Modal>
  )
}

export default function Stock({ usuario }) {
  const [items, setItems] = useState([])
  const [depositos, setDepositos] = useState([])
  const [stockPorDeposito, setStockPorDeposito] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [repuestoEditar, setRepuestoEditar] = useState(null)
  const [movimiento, setMovimiento] = useState(null)
  const [transferenciaAbierta, setTransferenciaAbierta] = useState(null)
  const [desgloseAbierto, setDesgloseAbierto] = useState(null)
  const [depositosAbierto, setDepositosAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [filtroDeposito, setFiltroDeposito] = useState('')

  const puedeEscribir = ['administrador', 'supervisor'].includes(usuario?.rol)
  const puedeMover = ['administrador', 'supervisor', 'tecnico'].includes(usuario?.rol)

  async function cargar() {
    setLoading(true)
    const [{ data: itemsData }, { data: depositosData }, { data: pdData }] = await Promise.all([
      supabase.from('stock').select('*').eq('activo', true).order('descripcion'),
      supabase.from('depositos').select('*').eq('activo', true).order('nombre'),
      supabase.from('stock_por_deposito').select('id_repuesto, id_deposito, cantidad, depositos (nombre)'),
    ])
    setItems(itemsData || [])
    setDepositos(depositosData || [])
    setStockPorDeposito(pdData || [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  function ubicacionTexto(idRepuesto) {
    const filas = stockPorDeposito.filter(f => f.id_repuesto === idRepuesto && f.cantidad > 0)
    if (filas.length === 0) return '—'
    return filas.map(f => `${f.depositos?.nombre}: ${f.cantidad}`).join(', ')
  }

  function cantidadEnDeposito(idRepuesto, idDeposito) {
    return stockPorDeposito.find(f => f.id_repuesto === idRepuesto && f.id_deposito === idDeposito)?.cantidad ?? 0
  }

  const q = busqueda.trim().toLowerCase()
  const filtrados = items
    .filter(i => !q || i.codigo?.toLowerCase().includes(q) || i.descripcion?.toLowerCase().includes(q))
    .filter(i => !filtroDeposito || cantidadEnDeposito(i.id, filtroDeposito) > 0)

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-base font-medium text-gray-900 dark:text-gray-100">Stock</h1>
        <div className="flex items-center gap-2">
        {puedeEscribir && (
          <button onClick={() => setDepositosAbierto(true)}
            className="text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg transition-colors">
            Depósitos
          </button>
        )}
        <button
          onClick={() => exportarXlsx('stock', filtrados, [
            { label: 'Código', get: i => i.codigo },
            { label: 'Descripción', get: i => i.descripcion },
            { label: 'Físico', get: i => i.stock_actual },
            { label: 'Comprometido', get: i => i.stock_comprometido },
            { label: 'Disponible', get: i => i.stock_disponible },
            { label: 'Mínimo', get: i => i.stock_minimo },
          ])}
          className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg transition-colors"
        >
          ↓ Excel
        </button>
        {puedeEscribir && (
          <button onClick={() => { setRepuestoEditar(null); setModalAbierto(true) }}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            + Nuevo repuesto
          </button>
        )}
        </div>
      </div>

      <div className="p-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex flex-wrap gap-2">
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por código o descripción…"
              className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
            {depositos.length > 1 && (
              <select value={filtroDeposito} onChange={e => setFiltroDeposito(e.target.value)}
                className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Todos los depósitos</option>
                {depositos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
            )}
          </div>
          {loading ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">Cargando…</div>
          ) : filtrados.length === 0 ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">No hay repuestos cargados todavía</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-400 dark:text-gray-500 font-medium">
                  <th className="px-5 py-3 text-left">Código</th>
                  <th className="px-5 py-3 text-left">Descripción</th>
                  <th className="px-5 py-3 text-left">Ubicación</th>
                  <th className="px-5 py-3 text-right">Físico</th>
                  <th className="px-5 py-3 text-right">Comprometido</th>
                  <th className="px-5 py-3 text-right">Disponible</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(i => (
                  <tr key={i.id} className={`border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 ${i.stock_disponible <= i.stock_minimo ? 'bg-red-50 dark:bg-red-950/20' : ''}`}>
                    <td className="px-5 py-3 text-gray-900 dark:text-gray-100 font-medium">{i.codigo}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{i.descripcion}</td>
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">
                      <button onClick={() => setDesgloseAbierto(i)} className="hover:underline text-left">{ubicacionTexto(i.id)}</button>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-700 dark:text-gray-300 tabular-nums">
                      <button onClick={() => setDesgloseAbierto(i)} className="hover:underline" title="Ver por depósito">{i.stock_actual}</button>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-500 dark:text-gray-400 tabular-nums">{i.stock_comprometido}</td>
                    <td className={`px-5 py-3 text-right font-medium tabular-nums ${i.stock_disponible < 0 ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'}`}>{i.stock_disponible}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {puedeMover && (
                        <>
                          <button onClick={() => setMovimiento({ item: i, tipo: 'ingreso' })} className="text-green-600 hover:underline text-xs mr-2">+ Ingreso</button>
                          <button onClick={() => setMovimiento({ item: i, tipo: 'egreso' })} className="text-amber-600 hover:underline text-xs mr-2">– Egreso</button>
                        </>
                      )}
                      {puedeEscribir && depositos.length > 1 && (
                        <button onClick={() => setTransferenciaAbierta(i)} className="text-gray-600 dark:text-gray-400 hover:underline text-xs mr-2">⇄ Transferir</button>
                      )}
                      {puedeEscribir && (
                        <button onClick={() => { setRepuestoEditar(i); setModalAbierto(true) }} className="text-blue-600 hover:underline text-xs">Editar</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modalAbierto && (
        <RepuestoModal
          repuesto={repuestoEditar}
          empresaId={usuario.empresa_id}
          depositoDefault={depositos[0]?.id}
          onClose={() => setModalAbierto(false)}
          onSaved={() => { setModalAbierto(false); cargar() }}
        />
      )}

      {movimiento && (
        <MovimientoModal
          item={movimiento.item}
          tipo={movimiento.tipo}
          depositos={depositos}
          onClose={() => setMovimiento(null)}
          onSaved={() => { setMovimiento(null); cargar() }}
        />
      )}

      {transferenciaAbierta && (
        <TransferenciaModal
          item={transferenciaAbierta}
          depositos={depositos}
          onClose={() => setTransferenciaAbierta(null)}
          onSaved={() => { setTransferenciaAbierta(null); cargar() }}
        />
      )}

      {desgloseAbierto && (
        <DesgloseDepositosModal item={desgloseAbierto} onClose={() => setDesgloseAbierto(null)} />
      )}

      {depositosAbierto && (
        <DepositosModal
          empresaId={usuario.empresa_id}
          depositos={depositos}
          onClose={() => setDepositosAbierto(false)}
          onChange={cargar}
        />
      )}
    </div>
  )
}
