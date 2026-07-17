import { Fragment, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { exportarXlsx } from '../lib/exportarXlsx'
import Modal from '../components/Modal'
import MotivoModal from '../components/MotivoModal'
import MultiSelectFiltro from '../components/MultiSelectFiltro'
import SelectConfig from '../components/SelectConfig'
import BuscadorCatalogo from '../components/BuscadorCatalogo'

const VACIO = { id_unidad: '', descripcion: '', tipo_trigger: 'km', intervalo: '' }

const LABEL_TRIGGER = { km: 'km', hs: 'hs', dias: 'días' }

const ESTADO_COLOR = {
  Sin_base: 'text-gray-400',
  Vigente: 'text-gray-500 dark:text-gray-400',
  Proxima: 'text-amber-600 font-medium',
  Vencida: 'text-red-600 font-medium',
  Pausada: 'text-gray-400 italic',
}

const ESTADO_LABEL = {
  Sin_base: 'Sin base',
  Vigente: 'Vigente',
  Proxima: 'Próxima',
  Vencida: 'Vencida',
  Pausada: 'Pausada',
}

// Vencida primero (la que más lleva vencido arriba de todo), después Próxima
// (la que menos falta arriba), y recién después el resto.
const PRIORIDAD_ESTADO = { Vencida: 0, Proxima: 1, Vigente: 2, Sin_base: 3, Pausada: 4 }

function actualValor(r) {
  return r.tipo_trigger === 'km' ? r.unidad_km_actuales : r.tipo_trigger === 'hs' ? r.unidad_hs_actuales : null
}

function actualTexto(r) {
  if (r.tipo_trigger === 'dias') return new Date().toLocaleDateString()
  const actual = actualValor(r)
  return actual != null ? `${actual} ${LABEL_TRIGGER[r.tipo_trigger]}` : '—'
}

function ultimaActualizacionTexto(r) {
  if (r.tipo_trigger === 'dias') return r.fecha_ultimo ? new Date(r.fecha_ultimo).toLocaleDateString() : '—'
  return r.unidad_km_hs_actualizado_en ? new Date(r.unidad_km_hs_actualizado_en).toLocaleDateString() : '—'
}

// Negativo = vencido hace esa cantidad, positivo = falta esa cantidad.
function faltanValor(r) {
  if (r.tipo_trigger === 'dias') {
    if (!r.proxima_fecha) return null
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    return Math.round((new Date(r.proxima_fecha) - hoy) / 86400000)
  }
  const actual = actualValor(r)
  if (r.proximo_km_hs == null || actual == null) return null
  return r.proximo_km_hs - actual
}

function faltanTexto(r) {
  const v = faltanValor(r)
  if (v == null) return '—'
  const unidad = r.tipo_trigger === 'dias' ? (Math.abs(v) === 1 ? 'día' : 'días') : LABEL_TRIGGER[r.tipo_trigger]
  return v < 0 ? `Vencido hace ${Math.abs(v)} ${unidad}` : `Faltan ${v} ${unidad}`
}

function RutinaModal({ rutina, unidades, onClose, onSaved }) {
  const [form, setForm] = useState(rutina || VACIO)
  const [tareas, setTareas] = useState([''])
  const [unidadesSel, setUnidadesSel] = useState([])
  const [filtroUnidades, setFiltroUnidades] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [catalogo, setCatalogo] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let activo = true

    async function cargarTareas() {
      setForm(rutina || VACIO)
      setError('')

      if (!rutina?.id) {
        setTareas([''])
        return
      }

      const { data, error } = await supabase
        .from('rutina_tareas')
        .select('id_catalogo')
        .eq('id_rutina', rutina.id)
        .order('orden')

      if (!activo) return
      if (error) {
        setError(error.message)
        setTareas([''])
        return
      }

      const tareasCargadas = (data || []).map(t => t.id_catalogo || '')
      setTareas(tareasCargadas.length > 0 ? tareasCargadas : [''])
    }

    cargarTareas()
    return () => { activo = false }
  }, [rutina])

  useEffect(() => {
    supabase.from('catalogo_trabajos').select('id, categoria, descripcion').eq('activo', true).order('categoria').order('descripcion')
      .then(({ data }) => setCatalogo(data || []))
  }, [])

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }
  function toggleUnidad(id) {
    setUnidadesSel(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id])
  }
  function setTarea(index, value) { setTareas(ts => ts.map((t, i) => i === index ? value : t)) }
  function agregarTarea() { setTareas(ts => [...ts, '']) }
  function quitarTarea(index) { setTareas(ts => ts.filter((_, i) => i !== index)) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.descripcion.trim() || !form.intervalo) { setError('Faltan campos obligatorios'); return }
    if (Number(form.intervalo) <= 0) { setError('El intervalo debe ser mayor a cero'); return }
    if (form.tipo_trigger === 'dias' && Number(form.intervalo) !== Math.floor(Number(form.intervalo))) {
      setError('El intervalo en días debe ser un número entero'); return
    }
    if (rutina?.id) {
      if (!form.id_unidad) { setError('Faltan campos obligatorios'); return }
    } else if (unidadesSel.length === 0) {
      setError('Seleccioná al menos una unidad'); return
    }
    const idsCatalogo = tareas.filter(t => t !== '')
    if (idsCatalogo.length === 0) { setError('Cada rutina debe tener al menos una tarea'); return }
    if (new Set(idsCatalogo).size !== idsCatalogo.length) { setError('Hay trabajos repetidos en la lista de tareas'); return }
    const tareasPayload = idsCatalogo.map(id => ({ id_catalogo: id }))

    setSaving(true)
    setError('')

    if (rutina?.id) {
      const { data, error } = await supabase.rpc('guardar_rutina', {
        p_id: rutina.id,
        p_id_unidad: form.id_unidad,
        p_descripcion: form.descripcion.trim(),
        p_tipo_trigger: form.tipo_trigger,
        p_intervalo: Number(form.intervalo),
        p_tareas: tareasPayload,
      })
      setSaving(false)
      if (error) { setError(error.message); return }
      if (!data?.ok) { setError(data?.msg ?? 'No se pudo guardar la rutina'); return }
      onSaved(null)
    } else {
      const { data, error } = await supabase.rpc('aplicar_rutina_a_unidades', {
        p_descripcion: form.descripcion.trim(),
        p_tipo_trigger: form.tipo_trigger,
        p_intervalo: Number(form.intervalo),
        p_tareas: tareasPayload,
        p_unidades: unidadesSel,
      })
      setSaving(false)
      if (error) { setError(error.message); return }
      if (!data?.ok) { setError(data?.msg ?? 'No se pudo guardar la rutina'); return }
      onSaved({ creadas: data.creadas, omitidas: data.omitidas })
    }
  }

  return (
    <Modal titulo={rutina?.id ? 'Editar rutina' : 'Nueva rutina de mantenimiento'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {rutina?.id ? (
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Unidad *</label>
            <select value={form.id_unidad} onChange={e => setField('id_unidad', e.target.value)} disabled
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50 dark:disabled:bg-gray-900">
              {unidades.map(u => <option key={u.id} value={u.id}>{[u.patente_serie, u.descripcion].filter(Boolean).join(' — ')}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Unidades * ({unidadesSel.length} seleccionadas)</label>
            <div className="flex gap-2 mb-2">
              <input
                aria-label="Buscar unidad"
                value={filtroUnidades}
                onChange={e => setFiltroUnidades(e.target.value)}
                placeholder="Buscar por patente o descripción…"
                className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm"
              />
              <select
                aria-label="Filtrar por tipo de unidad"
                value={filtroTipo}
                onChange={e => setFiltroTipo(e.target.value)}
                className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Todos los tipos</option>
                {[...new Set(unidades.map(u => u.tipo).filter(Boolean))].sort().map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-2 space-y-1">
              {unidades
                .filter(u => !filtroUnidades.trim() || `${u.patente_serie || ''} ${u.descripcion || ''}`.toLowerCase().includes(filtroUnidades.trim().toLowerCase()))
                .filter(u => !filtroTipo || u.tipo === filtroTipo)
                .map(u => (
                  <label key={u.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" checked={unidadesSel.includes(u.id)} onChange={() => toggleUnidad(u.id)} />
                    {u.patente_serie && <span className="font-medium">{u.patente_serie}</span>}
                    {u.descripcion}
                  </label>
                ))}
            </div>
            <button type="button" className="text-xs text-blue-600 hover:underline mt-1"
              onClick={() => {
                const visibles = unidades
                  .filter(u => !filtroUnidades.trim() || `${u.patente_serie || ''} ${u.descripcion || ''}`.toLowerCase().includes(filtroUnidades.trim().toLowerCase()))
                  .filter(u => !filtroTipo || u.tipo === filtroTipo)
                  .map(u => u.id)
                setUnidadesSel(sel => [...new Set([...sel, ...visibles])])
              }}>
              Seleccionar todas las visibles
            </button>
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Descripción *</label>
          <input value={form.descripcion} onChange={e => setField('descripcion', e.target.value)}
            placeholder="Ej: Service 10.000km"
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tareas de esta rutina *</label>
          <div className="space-y-2">
            {tareas.map((tarea, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="w-full">
                  <BuscadorCatalogo catalogo={catalogo} value={tarea} onChange={v => setTarea(index, v)} />
                </div>
                {tareas.length > 1 && (
                  <button type="button" onClick={() => quitarTarea(index)}
                    className="px-2 py-1 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={agregarTarea} className="text-blue-600 hover:underline text-xs">
              + Agregar tarea
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Se repite cada</label>
            <select value={form.tipo_trigger} onChange={e => setField('tipo_trigger', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm">
              <option value="km">Kilómetros</option>
              <option value="hs">Horas</option>
              <option value="dias">Días</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Intervalo *</label>
            <input type="number" min="1" step={form.tipo_trigger === 'dias' ? '1' : 'any'} value={form.intervalo} onChange={e => setField('intervalo', e.target.value)}
              placeholder={form.tipo_trigger === 'dias' ? 'ej: 180' : 'ej: 10000'}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
          </div>
        </div>
        <p className="text-xs text-gray-400">
          El próximo vencimiento se calcula solo, comparando contra el {form.tipo_trigger === 'dias' ? 'calendario' : `${LABEL_TRIGGER[form.tipo_trigger]} actual de la unidad`}. No hace falta cargarlo a mano.
        </p>

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

function ElegirDestinoModal({ rutina, otAbierta, onClose, onListo }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pantalla, setPantalla] = useState('elegir')
  const [prioridad, setPrioridad] = useState('Media')
  const [fechaEst, setFechaEst] = useState('')

  async function usarExistente() {
    setSaving(true)
    setError('')
    const { data, error } = await supabase.rpc('cumplir_rutina_en_ot', { p_id_ot: otAbierta.id, p_id_rutina: rutina.id })
    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data.msg); return }
    onListo()
  }

  async function crearNueva(e) {
    e.preventDefault()
    if (!fechaEst) { setError('La fecha estimada de cierre es obligatoria'); return }
    setSaving(true)
    setError('')
    const { data, error } = await supabase.rpc('programar_cumplimiento_rutina', {
      p_id_rutina: rutina.id, p_prioridad: prioridad, p_fecha_est_cierre: new Date(fechaEst).toISOString(),
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data.msg); return }
    onListo()
  }

  if (pantalla === 'elegir' && otAbierta) {
    return (
      <Modal titulo="Esta unidad ya tiene una OT abierta" onClose={onClose}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            La OT <span className="font-medium">{otAbierta.numero_ot}</span> ya está abierta para esta unidad. ¿Qué querés hacer?
          </p>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex flex-col gap-2 pt-2">
            <button onClick={usarExistente} disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
              {saving ? 'Agregando…' : `Agregar tareas a la OT ${otAbierta.numero_ot}`}
            </button>
            <button onClick={() => setPantalla('nueva')} disabled={saving}
              className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              Crear una OT nueva desde cero
            </button>
            <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:underline">
              Cancelar
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal titulo={`Programar cumplimiento — ${rutina.descripcion}`} onClose={onClose}>
      <form onSubmit={crearNueva} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Prioridad</label>
            <select value={prioridad} onChange={e => setPrioridad(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm">
              <option value="Baja">Baja</option>
              <option value="Media">Media</option>
              <option value="Alta">Alta</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Fecha estimada de cierre *</label>
            <input type="date" value={fechaEst} onChange={e => setFechaEst(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Se crea una OT preventiva con las tareas de la rutina ya cargadas. La rutina recién avanza cuando esa OT se cierre — si se anula, sigue pendiente.
        </p>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Programando…' : 'Programar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

const VACIO_PLAN = { descripcion: '', alcance: 'tipo_unidad', alcance_valor: '' }
const VACIO_NIVEL = { nombre: '', tipo_trigger: 'km', intervalo: '' }

// A diferencia de tipos_unidad/tipos_mision, el "tipo" de componente no vive
// en Configuración: es el texto libre que se carga al dar de alta cada
// componente (Componentes.jsx). Acá se ofrecen los valores ya existentes
// para que el alcance del plan matchee exacto (si no, no aplicaría nunca).
function SelectTipoComponente({ value, onChange }) {
  const [tipos, setTipos] = useState(null)

  useEffect(() => {
    supabase.from('componentes_mantenibles').select('tipo').eq('activo', true)
      .then(({ data }) => setTipos([...new Set((data || []).map(c => c.tipo))].sort()))
  }, [])

  if (tipos === null) return null

  return (
    <div>
      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tipo de componente *</label>
      {tipos.length === 0 ? (
        <p className="text-xs text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
          Sin componentes cargados — dalos de alta primero en Componentes
        </p>
      ) : (
        <select value={value || ''} onChange={e => onChange(e.target.value)} required
          className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Seleccionar...</option>
          {tipos.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      )}
    </div>
  )
}

function PlanModal({ plan, onClose, onSaved }) {
  const [form, setForm] = useState(plan ? { ...plan } : VACIO_PLAN)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.descripcion.trim() || !form.alcance_valor) { setError('Faltan campos obligatorios'); return }

    setSaving(true)
    setError('')
    const { data, error } = await supabase.rpc('guardar_plan_mantenimiento', {
      p_id: plan?.id ?? null,
      p_descripcion: form.descripcion.trim(),
      p_alcance: form.alcance,
      p_alcance_valor: form.alcance_valor,
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo guardar el plan'); return }
    onSaved()
  }

  return (
    <Modal titulo={plan?.id ? 'Editar plan de mantenimiento' : 'Nuevo plan de mantenimiento'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Descripción *</label>
          <input value={form.descripcion} onChange={e => setField('descripcion', e.target.value)}
            placeholder="Ej: IVECO Campo / Campo Severo"
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">¿A qué aplica? *</label>
          <select value={form.alcance} onChange={e => setForm(f => ({ ...f, alcance: e.target.value, alcance_valor: '' }))}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm">
            <option value="tipo_unidad">Tipo de unidad</option>
            <option value="mision">Misión</option>
            <option value="componente_tipo">Componente</option>
          </select>
        </div>
        {form.alcance === 'tipo_unidad' ? (
          <SelectConfig label="Tipo de unidad *" seccion="tipos_unidad" value={form.alcance_valor} onChange={v => setField('alcance_valor', v)} required />
        ) : form.alcance === 'mision' ? (
          <SelectConfig label="Misión *" seccion="tipos_mision" value={form.alcance_valor} onChange={v => setField('alcance_valor', v)} dosColumnas={false} required />
        ) : (
          <SelectTipoComponente value={form.alcance_valor} onChange={v => setField('alcance_valor', v)} />
        )}
        <p className="text-xs text-gray-400">
          Después de guardar el plan, agregale los niveles (M1, M2, M3...) desde la lista de planes.
        </p>

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

function NivelModal({ idPlan, nivel, onClose, onSaved }) {
  const [form, setForm] = useState(nivel ? { ...nivel } : VACIO_NIVEL)
  const [tareas, setTareas] = useState([''])
  const [catalogo, setCatalogo] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let activo = true
    async function cargarTareas() {
      if (!nivel?.id) { setTareas(['']); return }
      const { data, error } = await supabase.from('plan_tareas').select('id_catalogo').eq('id_nivel', nivel.id).order('orden')
      if (!activo) return
      if (error) { setError(error.message); setTareas(['']); return }
      const cargadas = (data || []).map(t => t.id_catalogo || '')
      setTareas(cargadas.length > 0 ? cargadas : [''])
    }
    cargarTareas()
    return () => { activo = false }
  }, [nivel])

  useEffect(() => {
    supabase.from('catalogo_trabajos').select('id, categoria, descripcion').eq('activo', true).order('categoria').order('descripcion')
      .then(({ data }) => setCatalogo(data || []))
  }, [])

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }
  function setTarea(index, value) { setTareas(ts => ts.map((t, i) => i === index ? value : t)) }
  function agregarTarea() { setTareas(ts => [...ts, '']) }
  function quitarTarea(index) { setTareas(ts => ts.filter((_, i) => i !== index)) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.nombre.trim() || !form.intervalo) { setError('Faltan campos obligatorios'); return }
    if (Number(form.intervalo) <= 0) { setError('El intervalo debe ser mayor a cero'); return }
    const idsCatalogo = tareas.filter(t => t !== '')
    if (idsCatalogo.length === 0) { setError('El nivel debe tener al menos una tarea'); return }
    if (new Set(idsCatalogo).size !== idsCatalogo.length) { setError('Hay trabajos repetidos en la lista de tareas'); return }

    setSaving(true)
    setError('')
    const { data, error } = await supabase.rpc('guardar_nivel_plan', {
      p_id: nivel?.id ?? null,
      p_id_plan: idPlan,
      p_nombre: form.nombre.trim(),
      p_tipo_trigger: form.tipo_trigger,
      p_intervalo: Number(form.intervalo),
      p_tareas: idsCatalogo.map(id => ({ id_catalogo: id })),
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo guardar el nivel'); return }
    onSaved()
  }

  return (
    <Modal titulo={nivel?.id ? `Editar nivel — ${nivel.nombre}` : 'Nuevo nivel del plan'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {nivel?.id && (
          <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
            Este nivel ya tiene rutinas activas en unidades reales. Guardar acá actualiza el intervalo/tareas de inmediato en todas ellas, y queda registrado en el historial del plan.
          </p>
        )}
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Nombre del nivel *</label>
          <input value={form.nombre} onChange={e => setField('nombre', e.target.value)}
            placeholder="Ej: M1, M1+M2, Líquido de frenos…"
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tareas de este nivel *</label>
          <div className="space-y-2">
            {tareas.map((tarea, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="w-full">
                  <BuscadorCatalogo catalogo={catalogo} value={tarea} onChange={v => setTarea(index, v)} />
                </div>
                {tareas.length > 1 && (
                  <button type="button" onClick={() => quitarTarea(index)}
                    className="px-2 py-1 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={agregarTarea} className="text-blue-600 hover:underline text-xs">
              + Agregar tarea
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Se repite cada</label>
            <select value={form.tipo_trigger} onChange={e => setField('tipo_trigger', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm">
              <option value="km">Kilómetros</option>
              <option value="hs">Horas</option>
              <option value="dias">Días</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Intervalo *</label>
            <input type="number" min="1" value={form.intervalo} onChange={e => setField('intervalo', e.target.value)}
              placeholder={form.tipo_trigger === 'dias' ? 'ej: 30' : 'ej: 5000'}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
          </div>
        </div>

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

function HistorialPlanModal({ plan, onClose }) {
  const [historial, setHistorial] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.rpc('get_historial_plan', { p_id_plan: plan.id }).then(({ data, error }) => {
      if (error || !data?.ok) { setError(data?.msg || error?.message || 'No se pudo cargar el historial'); return }
      setHistorial(data.historial)
    })
  }, [plan.id])

  const CAMPO_LABEL = { nivel_creado: 'Nivel creado', nombre: 'Nombre', intervalo: 'Intervalo', tareas: 'Tareas' }

  function exportar() {
    exportarXlsx(`historial_plan_${plan.descripcion}`, historial, [
      { label: 'Nivel', get: h => h.nivel_nombre || 'Plan' },
      { label: 'Campo', get: h => CAMPO_LABEL[h.campo] ?? h.campo },
      { label: 'Valor anterior', get: h => h.valor_anterior ?? '' },
      { label: 'Valor nuevo', get: h => h.valor_nuevo ?? '' },
      { label: 'Usuario', get: h => h.usuario_nombre || '' },
      { label: 'Fecha', get: h => new Date(h.fecha).toLocaleString() },
    ])
  }

  return (
    <Modal titulo={`Historial de cambios — ${plan.descripcion}`} onClose={onClose} ancho="max-w-2xl">
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
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {historial === null ? (
        <p className="text-sm text-gray-400">Cargando...</p>
      ) : historial.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Sin cambios registrados todavía.</p>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {historial.map(h => (
            <div key={h.id} className="border-b border-gray-100 dark:border-gray-700/60 pb-2 last:border-b-0 text-sm">
              <p className="text-gray-900 dark:text-gray-100">
                <span className="font-medium">{h.nivel_nombre || 'Plan'}</span> — {CAMPO_LABEL[h.campo] ?? h.campo}
              </p>
              {h.valor_anterior != null && (
                <p className="text-gray-500 dark:text-gray-400 text-xs">
                  {h.valor_anterior} → {h.valor_nuevo}
                </p>
              )}
              {h.valor_anterior == null && h.valor_nuevo && (
                <p className="text-gray-500 dark:text-gray-400 text-xs">{h.valor_nuevo}</p>
              )}
              <p className="text-xs text-gray-400 mt-0.5">
                {h.usuario_nombre || 'Usuario'} · {new Date(h.fecha).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

export default function RutinasMantenimiento({ usuario, abrirOt }) {
  const [items, setItems] = useState([])
  const [unidades, setUnidades] = useState([])
  const [programadas, setProgramadas] = useState({})
  const [loading, setLoading] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [rutinaEditar, setRutinaEditar] = useState(null)
  const [rutinaCumplir, setRutinaCumplir] = useState(null)
  const [otAbiertaParaCumplir, setOtAbiertaParaCumplir] = useState(null)
  const [rutinaPausar, setRutinaPausar] = useState(null)
  const [resultadoAlta, setResultadoAlta] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState([])
  const [filtroCentro, setFiltroCentro] = useState([])
  const [etiquetasCentro, setEtiquetasCentro] = useState({})
  const [tab, setTab] = useState('rutinas')
  const [planes, setPlanes] = useState([])
  const [planesLoading, setPlanesLoading] = useState(true)
  const [planModalAbierto, setPlanModalAbierto] = useState(false)
  const [planEditar, setPlanEditar] = useState(null)
  const [resultadoAplicarPlan, setResultadoAplicarPlan] = useState(null)
  const [aplicandoPlan, setAplicandoPlan] = useState(null)
  const [planesExpandidos, setPlanesExpandidos] = useState({})
  const [nivelModalAbierto, setNivelModalAbierto] = useState(false)
  const [nivelEditar, setNivelEditar] = useState(null)
  const [planParaNivel, setPlanParaNivel] = useState(null)
  const [historialPlanAbierto, setHistorialPlanAbierto] = useState(null)
  const [unidadesExpandidas, setUnidadesExpandidas] = useState({})
  const [accionError, setAccionError] = useState('')

  const puedeEscribir = ['administrador', 'supervisor'].includes(usuario?.rol)

  async function cargarPlanes() {
    setPlanesLoading(true)
    const [{ data }, { data: tareasData }] = await Promise.all([
      supabase.from('planes_mantenimiento').select('*, plan_niveles(*)').eq('activo', true).order('descripcion'),
      supabase.from('plan_tareas').select('id_nivel'),
    ])
    const cantidadPorNivel = {}
    for (const t of tareasData || []) cantidadPorNivel[t.id_nivel] = (cantidadPorNivel[t.id_nivel] || 0) + 1
    setPlanes((data || []).map(p => ({
      ...p,
      plan_niveles: (p.plan_niveles || []).map(n => ({ ...n, cantidadTareas: cantidadPorNivel[n.id] || 0 })),
    })))
    setPlanesLoading(false)
  }

  async function aplicarPlan(plan) {
    setAplicandoPlan(plan.id)
    setResultadoAplicarPlan(null)
    setAccionError('')
    const { data, error } = await supabase.rpc('aplicar_plan_a_todas_las_unidades', { p_id_plan: plan.id })
    setAplicandoPlan(null)
    if (error || !data?.ok) { setAccionError(data?.msg || error?.message); return }
    setResultadoAplicarPlan({ plan: plan.descripcion, creadas: data.creadas, unidadesRecorridas: data.unidades_recorridas })
    cargar()
  }

  async function cargar() {
    setLoading(true)
    const [{ data: itemsData }, { data: unidadesData }, { data: programadasData }] = await Promise.all([
      supabase.from('rutinas_calculado').select('*'),
      supabase.from('unidades').select('id, descripcion, patente_serie, centro_costo, tipo').eq('activo', true).order('descripcion'),
      supabase.from('rutina_cumplimientos').select('id_rutina, id_ot, ot_cabecera(numero_ot)').eq('estado', 'Programada'),
    ])
    const itemsOrdenados = (itemsData || []).slice().sort((a, b) => {
      const pa = PRIORIDAD_ESTADO[a.estado_calculado] ?? 9
      const pb = PRIORIDAD_ESTADO[b.estado_calculado] ?? 9
      if (pa !== pb) return pa - pb
      const fa = faltanValor(a)
      const fb = faltanValor(b)
      if (fa == null || fb == null) return 0
      return fa - fb
    })
    setItems(itemsOrdenados)
    setUnidades(unidadesData || [])
    setProgramadas(Object.fromEntries((programadasData || []).map(p => [p.id_rutina, p])))
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    cargarPlanes()
    supabase.from('configuracion').select('clave, valor').eq('seccion', 'centros_costo')
      .then(({ data }) => setEtiquetasCentro(Object.fromEntries((data || []).map(f => [f.clave, f.valor]))))
  }, [])

  function proximoTexto(r) {
    return r.tipo_trigger === 'dias' ? (r.proxima_fecha ?? '—') : (r.proximo_km_hs != null ? `${r.proximo_km_hs} ${LABEL_TRIGGER[r.tipo_trigger]}` : '—')
  }

  async function iniciarCumplir(rutina) {
    const { data } = await supabase.from('ot_cabecera')
      .select('id, numero_ot, estado')
      .eq('id_unidad', rutina.id_unidad)
      .in('estado', ['Abierta', 'En_Curso'])
      .order('fecha_apertura', { ascending: false })
      .limit(1)
    setOtAbiertaParaCumplir(data && data.length > 0 ? data[0] : null)
    setRutinaCumplir(rutina)
  }

  const patentePorUnidad = Object.fromEntries(unidades.map(u => [u.id, u.patente_serie]))
  const centroPorUnidad = Object.fromEntries(unidades.map(u => [u.id, u.centro_costo]))
  const centros = [...new Set(unidades.map(u => u.centro_costo).filter(Boolean))].sort()
  const busquedaNorm = busqueda.trim().toLowerCase()
  const itemsFiltrados = items
    .filter(r => !busquedaNorm ||
      (patentePorUnidad[r.id_unidad] || '').toLowerCase().includes(busquedaNorm) ||
      (r.unidad_descripcion || '').toLowerCase().includes(busquedaNorm) ||
      (r.descripcion || '').toLowerCase().includes(busquedaNorm) ||
      (ESTADO_LABEL[r.estado_calculado] ?? r.estado_calculado ?? '').toLowerCase().includes(busquedaNorm)
    )
    .filter(r => filtroEstado.length === 0 || filtroEstado.includes(r.estado_calculado))
    .filter(r => filtroCentro.length === 0 || filtroCentro.includes(centroPorUnidad[r.id_unidad]))

  // Agrupa por unidad para no listar 1 fila por rutina — a escala de 150+
  // unidades con varias rutinas cada una, eso es una lista interminable.
  // Por defecto cada unidad es 1 sola fila; si tiene vencidas se muestran
  // solas (sin un click extra); "Ver todas" despliega también las demás.
  const gruposPorUnidad = Object.values(
    itemsFiltrados.reduce((acc, r) => {
      (acc[r.id_unidad] ??= { id_unidad: r.id_unidad, unidad_descripcion: r.unidad_descripcion, items: [] }).items.push(r)
      return acc
    }, {})
  ).map(g => ({
    ...g,
    vencidas: g.items.filter(r => r.estado_calculado === 'Vencida'),
    proximas: g.items.filter(r => r.estado_calculado === 'Proxima'),
  })).sort((a, b) => {
    const pa = a.vencidas.length > 0 ? 0 : a.proximas.length > 0 ? 1 : 2
    const pb = b.vencidas.length > 0 ? 0 : b.proximas.length > 0 ? 1 : 2
    if (pa !== pb) return pa - pb
    return (a.unidad_descripcion || '').localeCompare(b.unidad_descripcion || '')
  })

  async function reanudar(rutina) {
    setAccionError('')
    const { data, error } = await supabase.rpc('reanudar_rutina', { p_id_rutina: rutina.id })
    if (error || !data?.ok) { setAccionError(data?.msg || error?.message); return }
    cargar()
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-base font-medium text-gray-900 dark:text-gray-100">Rutinas de Mantenimiento</h1>
          <div className="flex items-center gap-2">
            {tab === 'rutinas' ? (
              <>
                <button
                  onClick={() => exportarXlsx('rutinas_mantenimiento', itemsFiltrados, [
                    { label: 'Patente / N° serie', get: r => patentePorUnidad[r.id_unidad] || '' },
                    { label: 'Unidad', get: r => r.unidad_descripcion },
                    { label: 'Descripción', get: r => r.descripcion },
                    { label: 'Se repite cada', get: r => `${r.intervalo} ${LABEL_TRIGGER[r.tipo_trigger]}` },
                    { label: 'Actual', get: r => actualTexto(r) },
                    { label: 'Última actualización', get: r => ultimaActualizacionTexto(r) },
                    { label: 'Próximo', get: r => proximoTexto(r) },
                    { label: 'Faltan', get: r => faltanTexto(r) },
                    { label: 'Estado', get: r => ESTADO_LABEL[r.estado_calculado] ?? r.estado_calculado },
                  ])}
                  className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg transition-colors"
                >
                  ↓ Excel
                </button>
                {puedeEscribir && (
                  <button onClick={() => { setRutinaEditar(null); setModalAbierto(true) }}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                    + Nueva rutina
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={() => exportarXlsx('planes_mantenimiento', planes.flatMap(p =>
                    (p.plan_niveles || []).filter(n => n.activo).sort((a, b) => a.orden - b.orden).map(n => ({ plan: p, nivel: n }))
                  ), [
                    { label: 'Plan', get: x => x.plan.descripcion },
                    { label: 'Aplica a', get: x => `${x.plan.alcance === 'tipo_unidad' ? 'Tipo de unidad' : x.plan.alcance === 'mision' ? 'Misión' : 'Componente'}: ${x.plan.alcance_valor}` },
                    { label: 'Nivel', get: x => x.nivel.nombre },
                    { label: 'Se repite cada', get: x => `${x.nivel.intervalo} ${LABEL_TRIGGER[x.nivel.tipo_trigger]}` },
                    { label: 'Tareas', get: x => x.nivel.cantidadTareas },
                  ])}
                  className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg transition-colors"
                >
                  ↓ Excel
                </button>
                {puedeEscribir && (
                  <button onClick={() => { setPlanEditar(null); setPlanModalAbierto(true) }}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                    + Nuevo plan
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTab('rutinas')}
            className={`text-sm px-3 py-1.5 rounded-lg ${tab === 'rutinas'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'}`}
          >
            Rutinas
          </button>
          <button
            onClick={() => setTab('planes')}
            className={`text-sm px-3 py-1.5 rounded-lg ${tab === 'planes'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'}`}
          >
            Planes
          </button>
        </div>
      </div>

      {accionError && <p className="text-sm text-red-600 dark:text-red-400 px-6 pt-4" aria-live="polite">{accionError}</p>}

      {tab === 'rutinas' ? (
      <div className="p-6">
        {resultadoAlta && (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl p-4 text-sm mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-blue-800 dark:text-blue-300">Creadas: {resultadoAlta.creadas}.{resultadoAlta.omitidas?.length > 0 && ` Omitidas: ${resultadoAlta.omitidas.length}.`}</p>
              {resultadoAlta.omitidas?.length > 0 && (
                <ul className="mt-1 text-xs text-blue-700 dark:text-blue-400 list-disc list-inside">
                  {resultadoAlta.omitidas.map((o, i) => <li key={i}>{o.motivo}</li>)}
                </ul>
              )}
            </div>
            <button onClick={() => setResultadoAlta(null)} className="text-blue-400 hover:text-blue-600 text-xs">✕</button>
          </div>
        )}
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por patente, unidad, descripción o estado…"
            className="w-full max-w-md border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
          <MultiSelectFiltro
            label="Estado"
            opciones={['Vencida', 'Proxima', 'Vigente', 'Sin_base', 'Pausada']}
            seleccionados={filtroEstado}
            onChange={setFiltroEstado}
            etiquetas={ESTADO_LABEL}
            soloEtiqueta
          />
          <MultiSelectFiltro label="Centro de costo" opciones={centros} seleccionados={filtroCentro} onChange={setFiltroCentro} etiquetas={etiquetasCentro} />
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">Cargando...</div>
          ) : itemsFiltrados.length === 0 ? (
            <div className="px-5 py-8 text-sm text-gray-400 text-center">{items.length === 0 ? 'No hay rutinas cargadas todavía' : 'Sin resultados para esa búsqueda'}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900">
                <tr className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-400 dark:text-gray-500 font-medium">
                  <th className="px-5 py-3 text-left">Unidad</th>
                  <th className="px-5 py-3 text-left">Descripción</th>
                  <th className="px-5 py-3 text-left">Se repite cada</th>
                  <th className="px-5 py-3 text-left">Actual</th>
                  <th className="px-5 py-3 text-left">Última actualización</th>
                  <th className="px-5 py-3 text-left">Próximo</th>
                  <th className="px-5 py-3 text-left">Faltan</th>
                  <th className="px-5 py-3 text-left">Estado</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {gruposPorUnidad.map(g => {
                  const manual = unidadesExpandidas[g.id_unidad]
                  const mostrarTodas = manual === true
                  const tieneVencidas = g.vencidas.length > 0
                  // Si el filtro de Estado ya está acotado a Vencida/Próxima, no
                  // auto-expandimos — el usuario filtró justamente para ver el
                  // panorama por unidad, no el detalle; "Ver todas" sigue disponible.
                  const filtroVencidaProxima = filtroEstado.includes('Vencida') || filtroEstado.includes('Proxima')
                  const colapsado = manual === false || (manual === undefined && (filtroVencidaProxima || !tieneVencidas))
                  const itemsVisibles = mostrarTodas ? g.items : colapsado ? [] : g.vencidas
                  return (
                    <Fragment key={g.id_unidad}>
                      <tr className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40">
                        <td colSpan={9} className="px-5 py-2">
                          <button
                            type="button"
                            onClick={() => setUnidadesExpandidas(e => ({ ...e, [g.id_unidad]: mostrarTodas ? false : true }))}
                            className="flex items-center gap-2 text-left w-full"
                          >
                            <span className="text-gray-400 text-xs shrink-0">{mostrarTodas ? '▼' : itemsVisibles.length > 0 ? '▸' : '▶'}</span>
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {patentePorUnidad[g.id_unidad] && <span>{patentePorUnidad[g.id_unidad]} — </span>}
                              {g.unidad_descripcion}
                            </span>
                            <span className="text-xs text-gray-400">({g.items.length} rutina{g.items.length === 1 ? '' : 's'})</span>
                            {g.vencidas.length > 0 && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                {g.vencidas.length} vencida{g.vencidas.length === 1 ? '' : 's'}
                              </span>
                            )}
                            {g.proximas.length > 0 && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                {g.proximas.length} próxima{g.proximas.length === 1 ? '' : 's'}
                              </span>
                            )}
                            {!mostrarTodas && (
                              <span className="text-xs text-blue-600 ml-auto shrink-0">Ver todas</span>
                            )}
                          </button>
                        </td>
                      </tr>
                      {itemsVisibles.map(r => {
                        const programada = programadas[r.id]
                        return (
                          <tr key={r.id} className={`border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 ${r.estado_calculado === 'Vencida' ? 'bg-red-50 dark:bg-red-950/20' : ''}`}>
                            <td className="px-5 py-3 text-gray-500 dark:text-gray-400 pl-10">
                              {patentePorUnidad[r.id_unidad] && <span className="font-medium text-gray-700 dark:text-gray-300">{patentePorUnidad[r.id_unidad]} — </span>}
                              {r.unidad_descripcion}
                            </td>
                            <td className="px-5 py-3 text-gray-900 dark:text-gray-100">{r.descripcion}</td>
                            <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{r.intervalo} {LABEL_TRIGGER[r.tipo_trigger]}</td>
                            <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{actualTexto(r)}</td>
                            <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{ultimaActualizacionTexto(r)}</td>
                            <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{proximoTexto(r)}</td>
                            <td className={`px-5 py-3 ${r.estado_calculado === 'Vencida' ? 'text-red-600 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                              {faltanTexto(r)}
                            </td>
                            <td className="px-5 py-3">
                              <span className={ESTADO_COLOR[r.estado_calculado] || 'text-gray-500 dark:text-gray-400'}>
                                {ESTADO_LABEL[r.estado_calculado] ?? r.estado_calculado}
                              </span>
                              {r.estado_calculado === 'Pausada' && r.motivo_pausa && (
                                <div className="text-xs text-gray-400" title={r.motivo_pausa}>{r.motivo_pausa}</div>
                              )}
                            </td>
                            <td className="px-5 py-3 text-right whitespace-nowrap">
                              {programada ? (
                                <button onClick={() => abrirOt(programada.id_ot)} className="text-blue-600 hover:underline text-xs">
                                  Ver OT {programada.ot_cabecera?.numero_ot ?? ''}
                                </button>
                              ) : puedeEscribir && (
                                <>
                                  {r.estado_calculado === 'Pausada' ? (
                                    <button onClick={() => reanudar(r)} className="text-green-600 hover:underline text-xs mr-3">Reanudar</button>
                                  ) : (
                                    <>
                                      <button onClick={() => iniciarCumplir(r)} className="text-green-600 hover:underline text-xs mr-3">Cumplir</button>
                                      <button onClick={() => setRutinaPausar(r)} className="text-gray-500 dark:text-gray-400 hover:underline text-xs mr-3">Pausar</button>
                                    </>
                                  )}
                                  <button onClick={() => { setRutinaEditar(r); setModalAbierto(true) }} className="text-blue-600 hover:underline text-xs">Editar</button>
                                </>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      ) : (
      <div className="p-6">
        {resultadoAplicarPlan && (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl p-4 text-sm mb-4 flex items-start justify-between gap-3">
            <p className="text-blue-800 dark:text-blue-300">
              "{resultadoAplicarPlan.plan}" — Rutinas creadas: {resultadoAplicarPlan.creadas} (unidades recorridas: {resultadoAplicarPlan.unidadesRecorridas}).
            </p>
            <button onClick={() => setResultadoAplicarPlan(null)} className="text-blue-400 hover:text-blue-600 text-xs">✕</button>
          </div>
        )}
        <div className="space-y-3">
          {planesLoading ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-5 py-8 text-sm text-gray-400 text-center">Cargando...</div>
          ) : planes.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-5 py-8 text-sm text-gray-400 text-center">No hay planes de mantenimiento cargados todavía</div>
          ) : (
            planes.map(p => {
              const niveles = (p.plan_niveles || []).filter(n => n.activo).sort((a, b) => a.orden - b.orden)
              const expandido = planesExpandidos[p.id]
              return (
                <div key={p.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-5 py-3 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setPlanesExpandidos(e => ({ ...e, [p.id]: !e[p.id] }))}
                      className="flex items-center gap-2 text-left flex-1 min-w-0"
                    >
                      <span className="text-gray-400 text-xs shrink-0">{expandido ? '▼' : '▶'}</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{p.descripcion}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                        — {p.alcance === 'tipo_unidad' ? 'Tipo de unidad' : p.alcance === 'mision' ? 'Misión' : 'Componente'}: {p.alcance_valor} · {niveles.length} nivel(es)
                      </span>
                    </button>
                    <div className="flex items-center gap-3 shrink-0">
                      <button onClick={() => setHistorialPlanAbierto(p)} className="text-gray-500 dark:text-gray-400 hover:underline text-xs">Historial</button>
                      {puedeEscribir && (
                        <>
                          <button
                            onClick={() => aplicarPlan(p)}
                            disabled={aplicandoPlan === p.id || niveles.length === 0}
                            className="text-green-600 hover:underline text-xs disabled:opacity-50"
                          >
                            {aplicandoPlan === p.id ? 'Aplicando…' : 'Aplicar a todas las unidades'}
                          </button>
                          <button onClick={() => { setPlanEditar(p); setPlanModalAbierto(true) }} className="text-blue-600 hover:underline text-xs">Editar</button>
                        </>
                      )}
                    </div>
                  </div>
                  {expandido && (
                    <div className="border-t border-gray-100 dark:border-gray-800">
                      {niveles.length === 0 ? (
                        <p className="px-5 py-4 text-sm text-gray-400">Este plan todavía no tiene niveles cargados.</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-400 dark:text-gray-500 font-medium">
                              <th className="px-5 py-2 text-left">Nivel</th>
                              <th className="px-5 py-2 text-left">Se repite cada</th>
                              <th className="px-5 py-2 text-left">Tareas</th>
                              <th className="px-5 py-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {niveles.map(n => (
                              <tr key={n.id} className="border-t border-gray-100 dark:border-gray-800">
                                <td className="px-5 py-2 text-gray-900 dark:text-gray-100">{n.nombre}</td>
                                <td className="px-5 py-2 text-gray-500 dark:text-gray-400">{n.intervalo} {LABEL_TRIGGER[n.tipo_trigger]}</td>
                                <td className="px-5 py-2 text-gray-500 dark:text-gray-400">{n.cantidadTareas}</td>
                                <td className="px-5 py-2 text-right">
                                  {puedeEscribir && (
                                    <button
                                      onClick={() => { setPlanParaNivel(p.id); setNivelEditar(n); setNivelModalAbierto(true) }}
                                      className="text-blue-600 hover:underline text-xs"
                                    >
                                      Editar
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {puedeEscribir && (
                        <div className="px-5 py-3">
                          <button
                            onClick={() => { setPlanParaNivel(p.id); setNivelEditar(null); setNivelModalAbierto(true) }}
                            className="text-blue-600 hover:underline text-xs"
                          >
                            + Agregar nivel
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
      )}

      {modalAbierto && (
        <RutinaModal
          rutina={rutinaEditar}
          unidades={unidades}
          onClose={() => setModalAbierto(false)}
          onSaved={(resultado) => { setModalAbierto(false); setResultadoAlta(resultado); cargar() }}
        />
      )}

      {rutinaCumplir && (
        <ElegirDestinoModal
          rutina={rutinaCumplir}
          otAbierta={otAbiertaParaCumplir}
          onClose={() => { setRutinaCumplir(null); setOtAbiertaParaCumplir(null) }}
          onListo={() => { setRutinaCumplir(null); setOtAbiertaParaCumplir(null); cargar() }}
        />
      )}

      {rutinaPausar && (
        <MotivoModal
          titulo={`Pausar rutina — ${rutinaPausar.descripcion}`}
          label="Motivo de la pausa *"
          textoBoton="Pausar"
          onConfirm={async (motivo) => {
            setAccionError('')
            const { data, error } = await supabase.rpc('pausar_rutina', { p_id_rutina: rutinaPausar.id, p_motivo: motivo })
            if (error || !data?.ok) { setAccionError(data?.msg || error?.message); return }
            setRutinaPausar(null)
            cargar()
          }}
          onClose={() => setRutinaPausar(null)}
        />
      )}

      {planModalAbierto && (
        <PlanModal
          plan={planEditar}
          onClose={() => setPlanModalAbierto(false)}
          onSaved={() => { setPlanModalAbierto(false); cargarPlanes() }}
        />
      )}

      {nivelModalAbierto && (
        <NivelModal
          idPlan={planParaNivel}
          nivel={nivelEditar}
          onClose={() => setNivelModalAbierto(false)}
          onSaved={() => { setNivelModalAbierto(false); cargarPlanes() }}
        />
      )}

      {historialPlanAbierto && (
        <HistorialPlanModal
          plan={historialPlanAbierto}
          onClose={() => setHistorialPlanAbierto(null)}
        />
      )}
    </div>
  )
}
