import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import OtModal from '../components/OtModal'
import NovedadModal from '../components/NovedadModal'
import KmHsModal from '../components/KmHsModal'
import MotivoModal from '../components/MotivoModal'
import Modal from '../components/Modal'
import SelectConfig from '../components/SelectConfig'
import { exportarXlsx } from '../lib/exportarXlsx'

const ESTADO_COLOR = {
  Vencido: 'text-red-600 font-medium',
  'Por vencer': 'text-amber-600 font-medium',
  Vigente: 'text-gray-500 dark:text-gray-400',
  'Sin fecha': 'text-gray-400',
}

const PUNTO_TIMELINE = {
  alta: 'bg-gray-400',
  ot_apertura: 'bg-blue-500',
  ot_cierre: 'bg-green-500',
  novedad: 'bg-amber-500',
  documento: 'bg-purple-400',
}

function money(valor) {
  return `$${Number(valor || 0).toLocaleString('es-AR')}`
}

function formatDate(fecha) {
  if (!fecha) return '—'
  return new Date(fecha).toLocaleDateString()
}

function formatMes(mes) {
  if (!mes) return ''
  const [anio, numeroMes] = mes.split('-')
  return `${numeroMes}/${String(anio).slice(-2)}`
}

function saludColor(total) {
  if (total >= 80) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
  if (total >= 50) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
}

function estadoOperativoColor(estado) {
  if (estado === 'Operativa') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
  if (estado === 'Fuera de servicio') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
}

function triggerLabel(tipo) {
  if (tipo === 'km') return 'km'
  if (tipo === 'hs') return 'hs'
    return 'días'
}

// Negativo = vencido hace esa cantidad, positivo = falta esa cantidad.
function faltanValor(item, unidad) {
  if (item.tipo_trigger === 'dias') {
    if (!item.proxima_fecha) return null
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    return Math.round((new Date(item.proxima_fecha) - hoy) / 86400000)
  }
  const actual = item.tipo_trigger === 'km' ? unidad.km_actuales : unidad.hs_actuales
  if (item.proximo_km_hs == null || actual == null) return null
  return item.proximo_km_hs - actual
}

function faltanTexto(item, unidad) {
  const v = faltanValor(item, unidad)
  if (v == null) return '—'
  const etiqueta = item.tipo_trigger === 'dias' ? (Math.abs(v) === 1 ? 'día' : 'días') : triggerLabel(item.tipo_trigger)
  return v < 0 ? `Vencido hace ${Math.abs(v)} ${etiqueta}` : `Faltan ${v} ${etiqueta}`
}

function Card({ title, children }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">{title}</h2>
      {children}
    </div>
  )
}

function KpiCard({ valor, etiqueta }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{valor}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{etiqueta}</p>
    </div>
  )
}

function BarraSalud({ label, valor, maximo }) {
  const porcentaje = maximo > 0 ? Math.max(0, Math.min(100, (Number(valor || 0) / maximo) * 100)) : 0

  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-gray-700 dark:text-gray-300">{label}</span>
        <span className="text-gray-500 dark:text-gray-400">
          {Number(valor || 0)}/{maximo}
        </span>
      </div>
      <div className="bg-gray-100 dark:bg-gray-700 rounded-full h-2">
        <div className="bg-blue-500 rounded-full h-2" style={{ width: `${porcentaje}%` }} />
      </div>
    </div>
  )
}

function CambiarMisionModal({ idUnidad, misionActual, onClose, onSaved }) {
  const [nuevaMision, setNuevaMision] = useState('')
  const [impacto, setImpacto] = useState(null)
  const [decisiones, setDecisiones] = useState({})
  const [errorModal, setErrorModal] = useState('')
  const [cargando, setCargando] = useState(false)

  const inputClase = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'

  function setDecision(idRutina, campos) {
    setDecisiones((prev) => ({ ...prev, [idRutina]: { ...prev[idRutina], ...campos } }))
  }

  async function verImpacto() {
    setErrorModal('')
    if (!nuevaMision) { setErrorModal('Elegí la nueva misión'); return }
    setCargando(true)
    const { data, error } = await supabase.rpc('get_impacto_cambio_mision', { p_id_unidad: idUnidad, p_nueva_mision: nuevaMision })
    setCargando(false)
    if (error || !data?.ok) { setErrorModal(data?.msg || error?.message || 'No se pudo calcular el impacto'); return }
    setImpacto(data)
    setDecisiones(Object.fromEntries((data.planes_a_desactivar || []).map((r) => [r.id_rutina, { decision: 'mantener', motivo: '', id_plan_transferir: '' }])))
  }

  async function confirmar() {
    setErrorModal('')
    const lista = Object.entries(decisiones).map(([id_rutina, d]) => ({
      id_rutina,
      decision: d.decision,
      motivo: d.motivo?.trim() || null,
      id_plan_transferir: d.id_plan_transferir || null,
    }))
    if (lista.some((d) => d.decision === 'cancelar' && !d.motivo)) {
      setErrorModal('El motivo es obligatorio para cancelar una rutina')
      return
    }
    setCargando(true)
    const { data, error } = await supabase.rpc('cambiar_mision_con_decisiones', {
      p_id_unidad: idUnidad,
      p_nueva_mision: nuevaMision,
      p_decisiones: lista,
    })
    setCargando(false)
    if (error || !data?.ok) { setErrorModal(data?.msg || error?.message || 'No se pudo cambiar la misión'); return }
    onSaved()
  }

  return (
    <Modal titulo="Cambiar misión" onClose={onClose} ancho="max-w-2xl">
      <div className="space-y-4">
        {errorModal && <p className="text-sm text-red-600 dark:text-red-400">{errorModal}</p>}

        <p className="text-sm text-gray-500 dark:text-gray-400">
          Misión actual: <span className="font-medium text-gray-900 dark:text-gray-100">{misionActual || 'Sin definir'}</span>
        </p>

        <SelectConfig
          label="Nueva misión *"
          seccion="tipos_mision"
          value={nuevaMision}
          onChange={(v) => { setNuevaMision(v); setImpacto(null) }}
          dosColumnas={false}
          required
        />

        {!impacto ? (
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
            <button type="button" onClick={verImpacto} disabled={cargando} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">Ver impacto</button>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {impacto.continuan_activos} rutina(s) propias o de otro alcance continúan sin cambios.
            </p>

            {impacto.planes_a_activar_sugeridos?.length > 0 && (
              <div className="text-sm text-gray-700 dark:text-gray-300">
                <p className="font-medium mb-1">Planes sugeridos para la nueva misión:</p>
                {impacto.planes_a_activar_sugeridos.map((p) => (
                  <p key={p.id} className="text-gray-500 dark:text-gray-400">• {p.descripcion}</p>
                ))}
                <p className="text-xs text-gray-400 mt-1">Se pueden aplicar desde Planes de mantenimiento o al transferir una rutina pendiente.</p>
              </div>
            )}

            {(impacto.planes_a_desactivar || []).length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">La misión actual no tiene rutinas de planes por misión: el cambio no afecta ningún mantenimiento.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Rutinas de la misión actual — decidí qué hacer con cada una:</p>
                {impacto.planes_a_desactivar.map((r) => {
                  const d = decisiones[r.id_rutina] || { decision: 'mantener', motivo: '', id_plan_transferir: '' }
                  return (
                    <div key={r.id_rutina} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {r.descripcion}
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">({r.estado_calculado}{r.tiene_programada ? ' · con OT programada' : ''})</span>
                      </p>
                      <select value={d.decision} onChange={(e) => setDecision(r.id_rutina, { decision: e.target.value })} className={inputClase}>
                        <option value="mantener">Mantener activa</option>
                        <option value="transferir">Transferir a un plan de la nueva misión</option>
                        <option value="cancelar">Cancelar (requiere motivo)</option>
                        <option value="absorbida">Considerar absorbida por nueva intervención</option>
                      </select>
                      {(d.decision === 'cancelar' || d.decision === 'absorbida') && (
                        <input placeholder={d.decision === 'cancelar' ? 'Motivo *' : 'Observaciones (opcional)'} value={d.motivo} onChange={(e) => setDecision(r.id_rutina, { motivo: e.target.value })} className={inputClase} />
                      )}
                      {d.decision === 'transferir' && (
                        <select value={d.id_plan_transferir} onChange={(e) => setDecision(r.id_rutina, { id_plan_transferir: e.target.value })} className={inputClase}>
                          <option value="">Sin plan (solo desactivar)</option>
                          {(impacto.planes_a_activar_sugeridos || []).map((p) => (
                            <option key={p.id} value={p.id}>{p.descripcion}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
              <button type="button" onClick={confirmar} disabled={cargando} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">Confirmar cambio</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

function SinRutinaModal({ idUnidad, onClose, onAplicado }) {
  const [planes, setPlanes] = useState(null)
  const [error, setError] = useState('')
  const [aplicando, setAplicando] = useState(null)

  useEffect(() => {
    supabase.rpc('sugerir_planes_para_unidad', { p_id_unidad: idUnidad }).then(({ data, error }) => {
      if (error || !data?.ok) { setError(data?.msg || error?.message || 'No se pudo consultar planes sugeridos'); return }
      setPlanes(data.planes)
    })
  }, [idUnidad])

  async function aplicar(plan) {
    setAplicando(plan.id)
    setError('')
    const { data, error } = await supabase.rpc('aplicar_plan_a_unidad', { p_id_plan: plan.id, p_id_unidad: idUnidad })
    setAplicando(null)
    if (error || !data?.ok) { setError(data?.msg || error?.message || 'No se pudo aplicar el plan'); return }
    onAplicado()
  }

  return (
    <Modal titulo="Esta unidad no tiene rutinas de mantenimiento" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Sin rutinas configuradas no hay alertas de vencimiento preventivo para esta unidad.
        </p>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {planes === null ? (
          <p className="text-sm text-gray-400">Buscando planes que le corresponden…</p>
        ) : planes.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No hay ningún plan de mantenimiento cargado para el tipo o la misión de esta unidad. Podés crear uno desde Rutinas de Mantenimiento → Planes, o cargarle una rutina individual.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Planes que le corresponden:</p>
            {planes.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-2 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <div>
                  <p className="text-sm text-gray-900 dark:text-gray-100">{p.descripcion}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {p.alcance === 'tipo_unidad' ? 'Tipo de unidad' : p.alcance === 'mision' ? 'Misión' : 'Componente'}: {p.alcance_valor}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => aplicar(p)}
                  disabled={aplicando === p.id}
                  className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 shrink-0"
                >
                  {aplicando === p.id ? 'Aplicando…' : 'Aplicar'}
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </Modal>
  )
}

const ESTADO_CUMPLIMIENTO_COLOR = {
  'A tiempo': 'text-green-600 dark:text-green-400',
  Vencida: 'text-red-600 font-medium',
  Anulada: 'text-gray-400 italic',
  'En curso': 'text-blue-600 dark:text-blue-400',
}

function estadoCumplimiento(c) {
  if (c.estado === 'Anulada') return 'Anulada'
  if (c.estado === 'Programada') return 'En curso'
  // Cumplida: compara contra el objetivo capturado al programar (rutinas
  // creadas antes de esta funcionalidad no tienen objetivo — quedan en "—").
  if (c.objetivo_km_hs != null && c.km_hs_valor != null) {
    return c.km_hs_valor > c.objetivo_km_hs ? 'Vencida' : 'A tiempo'
  }
  if (c.objetivo_fecha != null && c.fecha_valor != null) {
    return new Date(c.fecha_valor) > new Date(c.objetivo_fecha) ? 'Vencida' : 'A tiempo'
  }
  return '—'
}

function HistorialRutinaModal({ rutina, onClose }) {
  const [historial, setHistorial] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.rpc('get_historial_cumplimientos_rutina', { p_id_rutina: rutina.id }).then(({ data, error }) => {
      if (error || !data?.ok) { setError(data?.msg || error?.message || 'No se pudo cargar el historial'); return }
      setHistorial(data.historial)
    })
  }, [rutina.id])

  const esKmHs = rutina.tipo_trigger === 'km' || rutina.tipo_trigger === 'hs'
  const unidadTrigger = rutina.tipo_trigger === 'km' ? 'km' : rutina.tipo_trigger === 'hs' ? 'hs' : ''

  function exportar() {
    exportarXlsx(`historial_rutina_${rutina.descripcion}`, historial, [
      { label: 'Fecha', get: c => formatDate(c.creado_en) },
      { label: 'OT', get: c => c.numero_ot || '' },
      { label: 'Debía realizarse a', get: c => esKmHs ? (c.objetivo_km_hs ?? '') : formatDate(c.objetivo_fecha) },
      { label: 'Se realizó a', get: c => esKmHs ? (c.km_hs_valor ?? '') : formatDate(c.fecha_valor) },
      { label: 'Estado', get: c => estadoCumplimiento(c) },
      { label: 'Motivo (si fue anulada)', get: c => c.estado === 'Anulada' ? (c.observaciones || '') : '' },
    ])
  }

  return (
    <Modal titulo={`Historial — ${rutina.descripcion}`} onClose={onClose} ancho="max-w-3xl">
      {historial?.length > 0 && (
        <div className="flex justify-end mb-3">
          <button
            type="button"
            onClick={exportar}
            className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            ↓ Excel
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}
      {historial === null ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : historial.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Todavía no hay ciclos registrados para esta rutina.</p>
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <th className="py-2 pr-3 font-medium">Fecha</th>
                <th className="py-2 pr-3 font-medium">OT</th>
                <th className="py-2 pr-3 font-medium">Debía realizarse a</th>
                <th className="py-2 pr-3 font-medium">Se realizó a</th>
                <th className="py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {historial.map((c) => (
                <tr key={c.id} className="border-b border-gray-100 dark:border-gray-700/60 last:border-b-0">
                  <td className="py-2 pr-3 text-gray-500 dark:text-gray-400">{formatDate(c.creado_en)}</td>
                  <td className="py-2 pr-3 text-gray-900 dark:text-gray-100">{c.numero_ot || '—'}</td>
                  <td className="py-2 pr-3 text-gray-500 dark:text-gray-400">
                    {esKmHs ? (c.objetivo_km_hs != null ? `${c.objetivo_km_hs} ${unidadTrigger}` : '—') : formatDate(c.objetivo_fecha)}
                  </td>
                  <td className="py-2 pr-3 text-gray-500 dark:text-gray-400">
                    {esKmHs ? (c.km_hs_valor != null ? `${c.km_hs_valor} ${unidadTrigger}` : '—') : formatDate(c.fecha_valor)}
                  </td>
                  <td className={`py-2 ${ESTADO_CUMPLIMIENTO_COLOR[estadoCumplimiento(c)] || 'text-gray-500 dark:text-gray-400'}`}>
                    {estadoCumplimiento(c)}
                    {c.estado === 'Anulada' && c.observaciones && (
                      <div className="text-xs text-gray-400 italic" title={c.observaciones}>{c.observaciones}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

export default function ActivoDetalle({ idUnidad, usuario, volver, abrirOt }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [unidades, setUnidades] = useState([])
  const [secuencias, setSecuencias] = useState([])
  const [tecnicos, setTecnicos] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [modalOt, setModalOt] = useState(false)
  const [modalNovedad, setModalNovedad] = useState(false)
  const [kmHsAbierto, setKmHsAbierto] = useState(false)
  const [paradas, setParadas] = useState(null)
  const [fueraServicioAbierto, setFueraServicioAbierto] = useState(false)
  const [componentes, setComponentes] = useState([])
  const [solapamientos, setSolapamientos] = useState([])
  const [historialMision, setHistorialMision] = useState([])
  const [origenPorRutina, setOrigenPorRutina] = useState({})
  const [misionAbierto, setMisionAbierto] = useState(false)
  const [historialRutinaAbierto, setHistorialRutinaAbierto] = useState(null)
  const [avisoSinRutinaAbierto, setAvisoSinRutinaAbierto] = useState(false)

  const puedeAccionar = usuario?.rol === 'administrador' || usuario?.rol === 'supervisor'

  async function cargar() {
    setError('')
    setData(null)

    const fichaPromise = supabase.rpc('get_ficha_activo', { p_id_unidad: idUnidad })
    const paradasPromise = supabase.rpc('get_paradas_unidad', { p_id_unidad: idUnidad })
    const componentesPromise = supabase.rpc('get_componentes_unidad', { p_id_unidad: idUnidad })
    const solapamientosPromise = supabase.rpc('get_solapamientos_unidad', { p_id_unidad: idUnidad })
    const misionPromise = supabase.rpc('get_historial_mision', { p_id_unidad: idUnidad })
    const rutinasOrigenPromise = supabase.from('rutinas_calculado').select('id, id_componente, id_plan_origen').eq('id_unidad', idUnidad).eq('activo', true)
    const auxiliaresPromise = puedeAccionar
      ? Promise.all([
          supabase.from('unidades').select('id, descripcion, patente_serie, km_actuales, hs_actuales').eq('activo', true).order('descripcion'),
          supabase.from('secuencias').select('id, nombre').eq('activo', true).order('nombre'),
          supabase.rpc('get_tecnicos_con_carga'),
          supabase.from('proveedores').select('id, razon_social').eq('activo', true).order('razon_social'),
        ])
      : Promise.resolve(null)

    const [{ data: ficha, error: fichaError }, paradasRes, componentesRes, solapamientosRes, misionRes, rutinasOrigenRes, auxiliares] =
      await Promise.all([fichaPromise, paradasPromise, componentesPromise, solapamientosPromise, misionPromise, rutinasOrigenPromise, auxiliaresPromise])

    if (fichaError || !ficha?.ok) {
      setError(ficha?.msg || fichaError?.message || 'No se pudo cargar la ficha del activo')
      setData(false)
      return
    }

    setData(ficha)
    setParadas(paradasRes.data?.ok ? paradasRes.data : null)
    setComponentes(componentesRes.data?.ok ? componentesRes.data.componentes : [])
    setSolapamientos(solapamientosRes.data?.ok ? solapamientosRes.data.solapamientos : [])
    setHistorialMision(misionRes.data?.ok ? misionRes.data.historial : [])
    setOrigenPorRutina(Object.fromEntries((rutinasOrigenRes.data || []).map(r => [r.id, r.id_componente ? 'Componente' : r.id_plan_origen ? 'Plan' : 'Propia'])))

    if (auxiliares) {
      const [unidadesRes, secuenciasRes, tecnicosRes, proveedoresRes] = auxiliares
      setUnidades(unidadesRes.data || [])
      setSecuencias(secuenciasRes.data || [])
      setTecnicos(tecnicosRes.data || [])
      setProveedores(proveedoresRes.data || [])
    }
  }

  useEffect(() => {
    cargar()
  }, [idUnidad])

  const unidad = data?.unidad
  const unidadModal = useMemo(() => {
    if (!unidad) return []
    const actual = {
      id: idUnidad,
      descripcion: unidad.descripcion,
      patente_serie: unidad.patente_serie,
      km_actuales: unidad.km_actuales,
      hs_actuales: unidad.hs_actuales,
    }
    const existe = unidades.some((item) => item.id === idUnidad)
    return existe ? unidades : [actual, ...unidades]
  }, [idUnidad, unidad, unidades])

  if (data === null) {
    return (
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-6 text-gray-700 dark:text-gray-300">
        Cargando…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
        <div className="p-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-sm text-red-600 mb-4">{error}</p>
            <button
              type="button"
              onClick={volver}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Volver
            </button>
          </div>
        </div>
      </div>
    )
  }

  const {
    estado_operativo,
    kpis = {},
    salud = {},
    costos_por_tipo = [],
    costos_por_mes = [],
    timeline = [],
    documentos = [],
    rutinas = [],
    herramientas = [],
  } = data

  const subtitulo = [unidad.marca, unidad.modelo, unidad.anio, unidad.tipo, unidad.ciudad].filter(Boolean).join(' · ')
  const maxCostoMes = Math.max(...costos_por_mes.map((item) => Number(item.total || 0)), 0)
  const kpiRutinas = kpis.rutinas_total
    ? `${Number(kpis.rutinas_total || 0) - Number(kpis.rutinas_vencidas || 0)}/${kpis.rutinas_total}`
    : '—'

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <div>
          <button
            type="button"
            onClick={volver}
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 mb-2"
          >
            ← Volver a Activos
          </button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {[unidad.patente_serie, unidad.descripcion].filter(Boolean).join(' · ')}
          </h1>
          {subtitulo && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{subtitulo}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${estadoOperativoColor(estado_operativo)}`}>
            {estado_operativo}
          </span>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${saludColor(Number(salud.total || 0))}`}>
            {Number(salud.total || 0)}/100
          </span>
          {rutinas.length === 0 && (
            <button
              type="button"
              onClick={() => setAvisoSinRutinaAbierto(true)}
              className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
            >
              ⚠ Sin rutinas
            </button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-4">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {puedeAccionar && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setModalOt(true)}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              + Nueva OT
            </button>
            <button
              type="button"
              onClick={() => setModalNovedad(true)}
              className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              + Novedad
            </button>
            <button
              type="button"
              onClick={() => setKmHsAbierto(true)}
              className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              📊 Km/Hs
            </button>
            {paradas?.parada_abierta ? (
              <button
                type="button"
                onClick={async () => {
                  const { data, error } = await supabase.rpc('marcar_en_servicio', { p_id_unidad: idUnidad })
                  if (error || !data?.ok) { setError(data?.msg || error?.message); return }
                  cargar()
                }}
                className="px-4 py-2 text-sm border border-green-300 dark:border-green-800 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
              >
                ✅ Volver a servicio
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setFueraServicioAbierto(true)}
                className="px-4 py-2 text-sm border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                ⛔ Fuera de servicio
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard valor={money(kpis.costo_total)} etiqueta="Costo total" />
          <KpiCard valor={money(kpis.costo_12m)} etiqueta="Costo 12 meses" />
          {unidad.km_actuales ? (
            <KpiCard valor={money(kpis.costo_por_km)} etiqueta="Costo por km" />
          ) : unidad.hs_actuales ? (
            <KpiCard valor={money(kpis.costo_por_hs)} etiqueta="Costo por hs" />
          ) : null}
          <KpiCard valor={kpis.ot_abiertas || 0} etiqueta="OT abiertas" />
          <KpiCard valor={kpis.correctivos_12m || 0} etiqueta="Correctivos (12m)" />
        <KpiCard valor={kpis.dias_prom_resolucion ?? '-'} etiqueta="Días prom. resolución" />
        <KpiCard valor={kpiRutinas} etiqueta="Rutinas al día" />
          <KpiCard valor={kpis.docs_vencidos || 0} etiqueta="Docs vencidos" />
          <KpiCard valor={kpis.novedades_pendientes || 0} etiqueta="Novedades pendientes" />
          <KpiCard valor={paradas?.dias_parada_12m ?? '—'} etiqueta="Días parada (12m)" />
        </div>

        <Card title="Paradas (fuera de servicio)">
          {paradas?.parada_abierta && (
            <div className="mb-4 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-900/10 p-3">
              <p className="text-sm font-medium text-red-700 dark:text-red-400">Parada abierta desde {formatDate(paradas.parada_abierta.desde)}</p>
              {paradas.parada_abierta.motivo && (
                <p className="text-sm text-red-600 dark:text-red-300 mt-1">{paradas.parada_abierta.motivo}</p>
              )}
            </div>
          )}
          {!paradas?.paradas?.length ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Sin paradas registradas</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2 pr-3 font-medium">Desde</th>
                    <th className="py-2 pr-3 font-medium">Hasta</th>
                    <th className="py-2 pr-3 font-medium">Días</th>
                    <th className="py-2 font-medium">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {paradas.paradas.map((item, index) => (
                    <tr key={`${item.desde}-${index}`} className="border-b border-gray-100 dark:border-gray-700/60 last:border-b-0">
                      <td className="py-2 pr-3 text-gray-900 dark:text-gray-100">{formatDate(item.desde)}</td>
                      <td className="py-2 pr-3 text-gray-500 dark:text-gray-400">{item.hasta ? formatDate(item.hasta) : 'Abierta'}</td>
                      <td className="py-2 pr-3 text-gray-500 dark:text-gray-400">{item.dias ?? '—'}</td>
                      <td className="py-2 text-gray-500 dark:text-gray-400">{item.motivo || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

<Card title="Índice de salud">
          <div className="space-y-4">
            <BarraSalud label="Rutinas" valor={salud.rutinas} maximo={30} />
            <BarraSalud label="Correctivos" valor={salud.correctivos} maximo={30} />
            <BarraSalud label="Documentacion" valor={salud.documentacion} maximo={20} />
            <BarraSalud label="Novedades" valor={salud.novedades} maximo={20} />
          </div>
        </Card>

        <Card title="Costos">
          {costos_por_tipo.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Sin costos registrados</p>
          ) : (
            <div className="space-y-2">
              {costos_por_tipo.map((item) => (
                <div key={item.tipo} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 dark:text-gray-300">{item.tipo}</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{money(item.total)}</span>
                </div>
              ))}
            </div>
          )}
          {costos_por_mes.length > 0 && (
            <div className="mt-5">
              <div className="flex items-end gap-1 h-24">
                {costos_por_mes.map((item) => {
                  const total = Number(item.total || 0)
                  const height = maxCostoMes > 0 ? `${Math.max(2, (total / maxCostoMes) * 100)}%` : '2px'
                  return (
                    <div key={item.mes} className="flex-1 flex flex-col items-center justify-end h-full">
                      <div
                        className="w-full bg-blue-400 dark:bg-blue-600 rounded-t"
                        style={{ height }}
                        title={`${item.mes}: ${money(total)}`}
                      />
                    </div>
                  )
                })}
              </div>
              <div className="grid grid-cols-12 gap-1 mt-2">
                {costos_por_mes.map((item) => (
                  <span key={item.mes} className="text-[10px] text-center text-gray-500 dark:text-gray-400">
                    {formatMes(item.mes)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>

<Card title="Línea de tiempo">
          {timeline.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Sin eventos registrados</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {timeline.map((item, index) => (
                <div key={`${item.fecha}-${item.tipo_evento}-${index}`} className="flex gap-3">
                  <span className={`w-2 h-2 rounded-full mt-2 ${PUNTO_TIMELINE[item.tipo_evento] || 'bg-gray-400'}`} />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(item.fecha)}</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.titulo}</p>
                    {item.detalle && <p className="text-sm text-gray-500 dark:text-gray-400">{item.detalle}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {componentes.length > 0 && (
          <Card title="Componentes instalados">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2 pr-3 font-medium">Tipo</th>
                    <th className="py-2 pr-3 font-medium">Marca / Modelo</th>
                    <th className="py-2 pr-3 font-medium">N° serie</th>
                    <th className="py-2 font-medium">Instalado desde</th>
                  </tr>
                </thead>
                <tbody>
                  {componentes.map((c) => (
                    <tr key={c.id} className="border-b border-gray-100 dark:border-gray-700/60 last:border-b-0">
                      <td className="py-2 pr-3 text-gray-900 dark:text-gray-100">{c.tipo}</td>
                      <td className="py-2 pr-3 text-gray-500 dark:text-gray-400">{[c.marca, c.modelo].filter(Boolean).join(' ') || '—'}</td>
                      <td className="py-2 pr-3 text-gray-500 dark:text-gray-400">{c.numero_serie || '—'}</td>
                      <td className="py-2 text-gray-500 dark:text-gray-400">{formatDate(c.desde)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Card title="Misión">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-900 dark:text-gray-100">
              Vigente: <span className="font-medium">{unidad.tipo_mision || 'Sin definir'}</span>
            </p>
            {puedeAccionar && (
              <button
                type="button"
                onClick={() => setMisionAbierto(true)}
                className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Cambiar misión
              </button>
            )}
          </div>
          {historialMision.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Sin historial de misión registrado</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2 pr-3 font-medium">Misión</th>
                    <th className="py-2 pr-3 font-medium">Desde</th>
                    <th className="py-2 font-medium">Hasta</th>
                  </tr>
                </thead>
                <tbody>
                  {historialMision.map((h, i) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-gray-700/60 last:border-b-0">
                      <td className="py-2 pr-3 text-gray-900 dark:text-gray-100">{h.mision}</td>
                      <td className="py-2 pr-3 text-gray-500 dark:text-gray-400">{formatDate(h.desde)}</td>
                      <td className="py-2 text-gray-500 dark:text-gray-400">{h.hasta ? formatDate(h.hasta) : 'Actual'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {solapamientos.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl p-4 text-sm space-y-1.5">
            <p className="font-medium text-amber-800 dark:text-amber-300">⚠ Tareas repetidas entre planes de esta unidad:</p>
            {solapamientos.map((s) => (
              <p key={s.id_catalogo} className="text-amber-700 dark:text-amber-400">
                "{s.descripcion_tarea}" aparece en: {s.rutinas.map(r => r.descripcion_rutina).join(' y ')}
              </p>
            ))}
          </div>
        )}

        <Card title="Rutinas de mantenimiento">
          {puedeAccionar && (
            <div className="flex justify-end mb-3">
              <button
                type="button"
                onClick={() => setAvisoSinRutinaAbierto(true)}
                className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                + Asignar rutina
              </button>
            </div>
          )}
          {rutinas.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Sin rutinas configuradas</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2 pr-3 font-medium">Descripción</th>
                    <th className="py-2 pr-3 font-medium">Cada</th>
                    <th className="py-2 pr-3 font-medium">Próximo</th>
                    <th className="py-2 pr-3 font-medium">Faltan</th>
                    <th className="py-2 pr-3 font-medium">Estado</th>
                    <th className="py-2 pr-3 font-medium">Origen</th>
                    <th className="py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {rutinas.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 dark:border-gray-700/60 last:border-b-0">
                      <td className="py-2 pr-3 text-gray-900 dark:text-gray-100">{item.descripcion}</td>
                      <td className="py-2 pr-3 text-gray-500 dark:text-gray-400">
                        {item.intervalo} {triggerLabel(item.tipo_trigger)}
                      </td>
                      <td className="py-2 pr-3 text-gray-500 dark:text-gray-400">
                        {item.proximo_km_hs ?? formatDate(item.proxima_fecha)}
                      </td>
                      <td
                        className={`py-2 pr-3 ${
                          item.estado_calculado === 'Vencida'
                            ? 'text-red-600 font-medium'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {faltanTexto(item, unidad)}
                      </td>
                      <td
                        className={`py-2 pr-3 ${
                          item.estado_calculado === 'Vencida'
                            ? 'text-red-600 font-medium'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {item.estado_calculado}
                      </td>
                      <td className="py-2 pr-3 text-gray-500 dark:text-gray-400">{origenPorRutina[item.id] || 'Propia'}</td>
                      <td className="py-2 text-right">
                        <button type="button" onClick={() => setHistorialRutinaAbierto(item)} className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                          Ver historial
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Documentos">
          {documentos.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Sin documentos cargados</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2 pr-3 font-medium">N°</th>
                    <th className="py-2 pr-3 font-medium">Tipo</th>
                    <th className="py-2 pr-3 font-medium">Vence</th>
                    <th className="py-2 pr-3 font-medium">Estado</th>
                    <th className="py-2 font-medium">Ver</th>
                  </tr>
                </thead>
                <tbody>
                  {documentos.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 dark:border-gray-700/60 last:border-b-0">
                      <td className="py-2 pr-3 text-gray-900 dark:text-gray-100">{item.numero}</td>
                      <td className="py-2 pr-3 text-gray-500 dark:text-gray-400">{item.tipo}</td>
                      <td className="py-2 pr-3 text-gray-500 dark:text-gray-400">{formatDate(item.fecha_vigencia_hasta)}</td>
                      <td className={`py-2 pr-3 ${ESTADO_COLOR[item.estado_calculado] || 'text-gray-500 dark:text-gray-400'}`}>
                        {item.estado_calculado}
                      </td>
                      <td className="py-2">
                        {item.archivo_url && (
                          <a
                            href={item.archivo_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            Ver
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {herramientas.length > 0 && (
          <Card title="Herramientas asociadas">
            <div>
              {herramientas.map((item) => (
                <span
                  key={item.codigo}
                  className="inline-block px-2.5 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded-full mr-2 mb-2"
                >
                  {item.codigo} — {item.descripcion}
                </span>
              ))}
            </div>
          </Card>
        )}
      </div>

      {modalOt && (
        <OtModal
          unidades={unidadModal}
          secuencias={secuencias}
          tecnicos={tecnicos}
          proveedores={proveedores}
          unidadInicial={idUnidad}
          titulo="Nueva OT"
          onClose={() => setModalOt(false)}
          onCreada={(idOt) => {
            setModalOt(false)
            if (abrirOt) abrirOt(idOt)
            else cargar()
          }}
        />
      )}

      {modalNovedad && (
        <NovedadModal
          unidades={unidadModal.map((item) => ({ id: item.id, descripcion: item.descripcion }))}
          usuario={usuario}
          onClose={() => setModalNovedad(false)}
          onSaved={() => {
            setModalNovedad(false)
            cargar()
          }}
        />
      )}

      {kmHsAbierto && (
        <KmHsModal
          unidad={{ id: idUnidad, descripcion: unidad.descripcion, km_actuales: unidad.km_actuales, hs_actuales: unidad.hs_actuales }}
          onClose={() => setKmHsAbierto(false)}
          onSaved={() => { setKmHsAbierto(false); cargar() }}
        />
      )}

      {fueraServicioAbierto && (
        <MotivoModal
          titulo="Marcar fuera de servicio"
          label="Motivo *"
          textoBoton="Confirmar"
          onConfirm={async (motivo) => {
            const { data, error } = await supabase.rpc('marcar_fuera_de_servicio', { p_id_unidad: idUnidad, p_motivo: motivo })
            if (error || !data?.ok) { setError(data?.msg || error?.message); return }
            setFueraServicioAbierto(false)
            cargar()
          }}
          onClose={() => setFueraServicioAbierto(false)}
        />
      )}

      {misionAbierto && (
        <CambiarMisionModal
          idUnidad={idUnidad}
          misionActual={unidad.tipo_mision}
          onClose={() => setMisionAbierto(false)}
          onSaved={() => { setMisionAbierto(false); cargar() }}
        />
      )}

      {historialRutinaAbierto && (
        <HistorialRutinaModal
          rutina={historialRutinaAbierto}
          onClose={() => setHistorialRutinaAbierto(null)}
        />
      )}

      {avisoSinRutinaAbierto && (
        <SinRutinaModal
          idUnidad={idUnidad}
          onClose={() => setAvisoSinRutinaAbierto(false)}
          onAplicado={() => { setAvisoSinRutinaAbierto(false); cargar() }}
        />
      )}
    </div>
  )
}
