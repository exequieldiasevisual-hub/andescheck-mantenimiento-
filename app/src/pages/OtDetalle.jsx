import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOnline, encolar } from '../lib/offline'
import FirmaModal from '../components/FirmaModal'
import ReservaHerramientaModal from '../components/ReservaHerramientaModal'
import Modal from '../components/Modal'
import MotivoModal from '../components/MotivoModal'
import BuscadorCatalogo from '../components/BuscadorCatalogo'
import BuscadorTecnico from '../components/BuscadorTecnico'
import ConfirmModal from '../components/ConfirmModal'
import logoAndesCheck from '../assets/andescheck-logo.svg'

const ESTADO_TAREA_LABEL = { Pendiente: 'Pendiente', En_Curso: 'En curso', Pausada: 'Pausada', Completada: 'Completada' }

function EnviarMailModal({ valorInicial, onClose, onConfirm }) {
  const [destinatario, setDestinatario] = useState(valorInicial || '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!destinatario.trim()) { setError('El email es obligatorio'); return }
    setSaving(true)
    setError('')
    try {
      await onConfirm(destinatario.trim())
    } catch (err) {
      setSaving(false)
      setError(err.message)
    }
  }

  return (
    <Modal titulo="Enviar OT por mail" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="mail-ot-destinatario" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Email destinatario *</label>
          <input
            id="mail-ot-destinatario"
            type="email"
            autoComplete="email"
            spellCheck={false}
            value={destinatario}
            onChange={e => setDestinatario(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400" aria-live="polite">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function EnviarWhatsappModal({ valorInicial, onClose, onConfirm }) {
  const [telefono, setTelefono] = useState(valorInicial || '')
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    const soloDigitos = telefono.replace(/\D/g, '')
    if (!soloDigitos) { setError('Ingresá un número válido'); return }
    onConfirm(soloDigitos)
  }

  return (
    <Modal titulo="Enviar OT por WhatsApp" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="whatsapp-ot-telefono" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
            Número (con código de país, solo dígitos) *
          </label>
          <input
            id="whatsapp-ot-telefono"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            spellCheck={false}
            value={telefono}
            onChange={e => setTelefono(e.target.value)}
            placeholder="Ej: 5493511234567"
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400" aria-live="polite">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="submit" className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
            Enviar
          </button>
        </div>
      </form>
    </Modal>
  )
}

function PausaTareaModal({ motivos, onClose, onConfirm }) {
  const [motivo, setMotivo] = useState(motivos[0] || '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function confirmar() {
    if (!motivo) { setError('Elegí un motivo'); return }
    setSaving(true)
    setError('')
    await onConfirm(motivo)
    setSaving(false)
  }

  if (motivos.length === 0) {
    return (
      <Modal titulo="Pausar tarea" onClose={onClose}>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No hay motivos de pausa configurados. Cargalos en Configuración → General → Motivos de Pausa.
        </p>
        <div className="flex justify-end pt-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg">Cerrar</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal titulo="Pausar tarea" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Motivo de la pausa *</label>
          <select value={motivo} onChange={e => setMotivo(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm">
            {motivos.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="button" onClick={confirmar} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : 'Pausar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function TecnicosTareaModal({ tecnicos, seleccionados, cantidadTareas, onClose, onSave }) {
  const [elegidos, setElegidos] = useState(seleccionados)

  function toggle(id) {
    setElegidos(s => s.includes(id) ? s.filter(t => t !== id) : [...s, id])
  }

  return (
    <Modal titulo={cantidadTareas > 1 ? `Asignar técnicos a ${cantidadTareas} tareas` : 'Técnicos asignados a la tarea'} onClose={onClose}>
      <div className="space-y-3">
        <BuscadorTecnico tecnicos={tecnicos} seleccionados={elegidos} onToggle={toggle} />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="button" onClick={() => onSave(elegidos)} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
            Guardar
          </button>
        </div>
      </div>
    </Modal>
  )
}

function TecnicosOtModal({ tecnicos, seleccionados, onClose, onSave }) {
  const [elegidos, setElegidos] = useState(seleccionados)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function toggle(id) {
    setElegidos(s => s.includes(id) ? s.filter(t => t !== id) : [...s, id])
  }

  async function guardar() {
    setSaving(true)
    setError('')
    const { error } = await supabase.from('ot_cabecera').update({ tecnicos_asignados: elegidos }).eq('id', onSave.idOt)
    setSaving(false)
    if (error) { setError(error.message); return }
    onSave.onSaved()
  }

  return (
    <Modal titulo="Técnicos asignados a la OT" onClose={onClose}>
      <div className="space-y-3">
        <BuscadorTecnico tecnicos={tecnicos} seleccionados={elegidos} onToggle={toggle} />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function AgregarTareaModal({ idOt, tareasActuales, onClose, onAdded }) {
  const [catalogo, setCatalogo] = useState([])
  const [idCatalogo, setIdCatalogo] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('catalogo_trabajos').select('id, categoria, descripcion').eq('activo', true).order('categoria').order('descripcion')
      .then(({ data }) => setCatalogo(data || []))
  }, [])

  const yaCargado = idCatalogo && tareasActuales?.some(t => t.id_catalogo === idCatalogo)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!idCatalogo) { setError('Elegí un trabajo del catálogo'); return }
    setSaving(true)
    setError('')
    const { data, error } = await supabase.rpc('agregar_tarea_ot', {
      p_id_ot: idOt,
      p_id_catalogo: idCatalogo,
      p_descripcion: null,
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data.msg); return }
    onAdded()
  }

  return (
    <Modal titulo="Agregar tarea" onClose={onClose} ancho="max-w-2xl" alto="min-h-[700px]">
      <form onSubmit={handleSubmit} className="space-y-3 flex-1 flex flex-col">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Trabajo del catálogo *</label>
          <BuscadorCatalogo catalogo={catalogo} value={idCatalogo} onChange={setIdCatalogo} placeholder="Buscar trabajo del catálogo…" />
        </div>

        {yaCargado && (
          <p className="text-sm text-amber-600 dark:text-amber-400" aria-live="polite">
            ⚠ Este trabajo ya está cargado en esta OT — podés agregarlo igual si corresponde.
          </p>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2 mt-auto">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : 'Agregar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ElegirEliminarTareaModal({ tarea, cantidadEnBundle, onClose, onAnularRutina, onConvertirNovedad }) {
  return (
    <Modal titulo="Esta tarea pertenece a una rutina" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          "{tarea.descripcion}" pertenece a la rutina <span className="font-medium text-gray-900 dark:text-gray-100">{tarea.rutinas_mantenimiento?.descripcion}</span>, que generó {cantidadEnBundle} tarea(s) en esta OT. Borrar solo esta tarea rompe la trazabilidad del ciclo — elegí una opción:
        </p>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={onAnularRutina}
            className="px-4 py-2 text-sm text-left border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
            Anular toda la rutina en esta OT ({cantidadEnBundle} tarea{cantidadEnBundle === 1 ? '' : 's'})
          </button>
          <button type="button" onClick={onConvertirNovedad}
            className="px-4 py-2 text-sm text-left border border-amber-300 dark:border-amber-800 text-amber-600 dark:text-amber-400 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
            Solo esta tarea — convertir en novedad (el resto de la rutina sigue igual)
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:underline text-left">
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  )
}

function ResolverNovedadModal({ idOt, novedad, onClose, onResuelta }) {
  const [catalogo, setCatalogo] = useState([])
  const [idCatalogo, setIdCatalogo] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('catalogo_trabajos').select('id, categoria, descripcion').eq('activo', true).order('categoria').order('descripcion')
      .then(({ data }) => setCatalogo(data || []))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!idCatalogo) { setError('Elegí un trabajo del catálogo'); return }
    setSaving(true)
    setError('')
    const { data, error } = await supabase.rpc('resolver_novedad_en_ot', {
      p_id_novedad: novedad.id,
      p_id_ot: idOt,
      p_id_catalogo: idCatalogo,
      p_descripcion: null,
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data.msg); return }
    onResuelta()
  }

  return (
    <Modal titulo="Resolver novedad en esta OT" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-400">{novedad.descripcion}</p>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Trabajo del catálogo que la resuelve *</label>
          <BuscadorCatalogo catalogo={catalogo} value={idCatalogo} onChange={setIdCatalogo} />
        </div>
        <p className="text-xs text-gray-400">
          Se agrega como tarea de esta OT y la novedad queda marcada como resuelta, con trazabilidad de qué tarea la resolvió.
        </p>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : 'Resolver'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function CostoModal({ idOt, usuario, onClose, onAdded }) {
  const [form, setForm] = useState({ descripcion: '', monto: '', tipo: 'Otro' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.descripcion.trim()) { setError('La descripción es obligatoria'); return }
    const monto = Number(form.monto)
    if (!monto || monto <= 0) { setError('Monto inválido'); return }
    setSaving(true)
    setError('')
    const { error } = await supabase.from('costos').insert({
      id_ot: idOt, descripcion: form.descripcion.trim(), monto, tipo: form.tipo || null, usuario: usuario.id,
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    onAdded()
  }

  return (
    <Modal titulo="Agregar costo" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Descripción *</label>
          <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Monto ($) *</label>
            <input type="number" step="0.01" min="0" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm" required />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tipo</label>
            <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm">
              <option value="Mano de obra">Mano de obra</option>
              <option value="Repuestos">Repuestos</option>
              <option value="Servicio externo">Servicio externo</option>
              <option value="Otro">Otro</option>
            </select>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : 'Agregar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function OtDetalle({ idOt, usuario, volver }) {
  const online = useOnline()
  const [ot, setOt] = useState(null)
  const [tareas, setTareas] = useState([])
  const [firmas, setFirmas] = useState([])
  const [seguimiento, setSeguimiento] = useState([])
  const [herramientas, setHerramientas] = useState([])
  const [costos, setCostos] = useState([])
  const [notaNueva, setNotaNueva] = useState('')
  const [fotoNueva, setFotoNueva] = useState(null)
  const [pdfNuevo, setPdfNuevo] = useState(null)
  const [error, setError] = useState('')
  const [firmaAbierta, setFirmaAbierta] = useState(null)
  const [reservaAbierta, setReservaAbierta] = useState(false)
  const [tareaModalAbierta, setTareaModalAbierta] = useState(false)
  const [actualizando, setActualizando] = useState(false)
  const [novedadesUnidad, setNovedadesUnidad] = useState([])
  const [rutinasUnidad, setRutinasUnidad] = useState([])
  const [agregandoRutina, setAgregandoRutina] = useState(null)
  const [costoModalAbierto, setCostoModalAbierto] = useState(false)
  const [tareaEliminar, setTareaEliminar] = useState(null)
  const [tareaConvertir, setTareaConvertir] = useState(null)
  const [tareaElegirAccion, setTareaElegirAccion] = useState(null)
  const [rutinaAnular, setRutinaAnular] = useState(null)
  const [novedadResolver, setNovedadResolver] = useState(null)
  const [novedadPorTarea, setNovedadPorTarea] = useState({})
  const [mensajeExito, setMensajeExito] = useState('')
  const [tecnicos, setTecnicos] = useState([])
  const [tecnicosModalAbierto, setTecnicosModalAbierto] = useState(false)
  const [tareasSeleccionadas, setTareasSeleccionadas] = useState([])
  const [tecnicosTareaModal, setTecnicosTareaModal] = useState(null)
  const [motivosPausa, setMotivosPausa] = useState([])
  const [tareaAPausar, setTareaAPausar] = useState(null)
  const [mailModalAbierto, setMailModalAbierto] = useState(false)
  const [whatsappModalAbierto, setWhatsappModalAbierto] = useState(false)
  const [cerrarOtConfirm, setCerrarOtConfirm] = useState(false)

  async function agregarRutinaComoTareas(rutina) {
    setAgregandoRutina(rutina.id)
    setError('')
    setMensajeExito('')
    const { data, error } = await supabase.rpc('cumplir_rutina_en_ot', { p_id_ot: idOt, p_id_rutina: rutina.id })
    setAgregandoRutina(null)
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data.msg); return }
    setMensajeExito(`✓ Rutina "${rutina.descripcion}" agregada a esta OT.`)
    cargar()
  }

  const otActiva = ot && !['Cerrada', 'Cerrada_Vencida', 'Anulada'].includes(ot.estado)
  const totalCostos = costos.reduce((s, c) => s + Number(c.monto || 0), 0)

  const puedeGestionar = ['administrador', 'supervisor'].includes(usuario?.rol)
  // El técnico trabaja las tareas de una OT en la que esté asignado, ya sea
  // a nivel de OT completa (ot.tecnicos_asignados) o a esa tarea puntual
  // (tarea.tecnicos_asignados).
  const esTecnicoDeLaOt = usuario?.rol === 'tecnico' && ot?.tecnicos_asignados?.includes(usuario.id)
  function puedeMarcarTarea(t) {
    if (puedeGestionar) return true
    return esTecnicoDeLaOt || (usuario?.rol === 'tecnico' && t.tecnicos_asignados?.includes(usuario.id))
  }
  const checklist = ot?.checklist_completado ?? []
  const checklistPendiente = checklist.some(i => i.requerido && !i.checked)
  const tareasPendientes = tareas.some(t => t.estado !== 'Completada')
  const puedeCerrar = puedeGestionar && !checklistPendiente && !tareasPendientes && ot?.estado !== 'Cerrada' && ot?.estado !== 'Cerrada_Vencida' && ot?.estado !== 'Anulada'

  async function cargar() {
    setActualizando(true)
    const [{ data: otData }, { data: tareasData }, { data: firmasData }, { data: seguimientoData }, { data: herramientasData }, { data: costosData }, { data: novResueltasData }, { data: tecnicosData }, { data: motivosData }] = await Promise.all([
      supabase.from('ot_cabecera').select('*, unidades(descripcion, patente_serie), proveedores:proveedor (razon_social, mail, telefono)').eq('id', idOt).single(),
      supabase.from('ot_tareas').select('*, rutinas_mantenimiento:id_rutina_origen (descripcion)').eq('id_ot', idOt).order('orden'),
      supabase.from('ot_firmas').select('*').eq('id_ot', idOt),
      supabase.from('ot_seguimiento').select('*, usuarios (nombre, rol)').eq('id_ot', idOt).order('fecha', { ascending: false }),
      supabase.from('ot_herramientas').select('*, herramientas (codigo, descripcion)').eq('id_ot', idOt).order('fecha_reserva'),
      supabase.from('costos').select('*').eq('id_ot', idOt).order('fecha'),
      supabase.from('novedades').select('id, descripcion, id_tarea_resolucion').eq('id_ot_vinculada', idOt).eq('estado', 'Resuelta_en_OT'),
      supabase.rpc('get_tecnicos_con_carga'),
      supabase.from('configuracion').select('clave').eq('seccion', 'motivos_pausa').order('clave'),
    ])
    setOt(otData)
    setTareas(tareasData || [])
    setFirmas(firmasData || [])
    setSeguimiento(seguimientoData || [])
    setHerramientas(herramientasData || [])
    setCostos(costosData || [])
    setNovedadPorTarea(Object.fromEntries((novResueltasData || []).filter(n => n.id_tarea_resolucion).map(n => [n.id_tarea_resolucion, n.descripcion])))
    setTecnicos(tecnicosData || [])
    setMotivosPausa((motivosData || []).map(m => m.clave))

    if (otData?.id_unidad) {
      const [{ data: novData }, { data: rutData }] = await Promise.all([
        supabase.from('novedades').select('id, descripcion, estado').eq('id_unidad', otData.id_unidad).in('estado', ['Pendiente', 'Aprobada']).order('fecha', { ascending: false }),
        supabase.from('rutinas_calculado').select('id, descripcion, tipo_trigger, estado_calculado, proxima_fecha').eq('id_unidad', otData.id_unidad).eq('activo', true),
      ])
      setNovedadesUnidad(novData || [])
      setRutinasUnidad((rutData || [])
        .filter(r => r.estado_calculado === 'Vencida' || r.estado_calculado === 'Proxima')
        .sort((a, b) => (a.estado_calculado === 'Vencida' ? 0 : 1) - (b.estado_calculado === 'Vencida' ? 0 : 1)))
    } else {
      setNovedadesUnidad([])
      setRutinasUnidad([])
    }

    setActualizando(false)
  }

  useEffect(() => { cargar() }, [idOt])

  async function marcarTarea(tarea, estado) {
    setError('')
    const { error } = await supabase.from('ot_tareas').update({
      estado,
      motivo_pausa: null,
      fecha_inicio: estado === 'En_Curso' && !tarea.fecha_inicio ? new Date().toISOString() : tarea.fecha_inicio,
      fecha_fin: estado === 'Completada' ? new Date().toISOString() : null,
    }).eq('id', tarea.id)
    if (error) { setError(error.message); return }
    cargar()
  }

  async function pausarTarea(motivo) {
    setError('')
    const { error } = await supabase.from('ot_tareas').update({ estado: 'Pausada', motivo_pausa: motivo }).eq('id', tareaAPausar.id)
    if (error) { setError(error.message); return }
    setTareaAPausar(null)
    cargar()
  }

  function toggleSeleccionTarea(id) {
    setTareasSeleccionadas(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  async function guardarTecnicosTarea(taskIds, tecnicoIds) {
    setError('')
    const { error } = await supabase.from('ot_tareas').update({ tecnicos_asignados: tecnicoIds }).in('id', taskIds)
    if (error) { setError(error.message); return }
    setTecnicosTareaModal(null)
    setTareasSeleccionadas([])
    cargar()
  }

  async function eliminarTarea(motivo) {
    setError('')
    const { data, error } = await supabase.rpc('eliminar_tarea_ot', { p_id_tarea: tareaEliminar.id, p_motivo: motivo })
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data.msg); return }
    setTareaEliminar(null)
    cargar()
  }

  async function convertirANovedad(descripcion) {
    setError('')
    const { data, error } = await supabase.rpc('convertir_tarea_a_novedad', { p_id_tarea: tareaConvertir.id, p_descripcion: descripcion })
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data.msg); return }
    setTareaConvertir(null)
    cargar()
  }

  async function anularRutinaEnOt(motivo) {
    setError('')
    const { data, error } = await supabase.rpc('anular_rutina_en_ot', {
      p_id_ot: idOt, p_id_rutina: rutinaAnular.id_rutina_origen, p_motivo: motivo,
    })
    if (error) { setError(error.message); return }
    if (!data?.ok) { setError(data.msg); return }
    setRutinaAnular(null)
    cargar()
  }

  async function imprimir() {
    const { data, error } = await supabase.rpc('get_ot_para_imprimir', { p_id_ot: idOt })
    if (error || !data?.ok) { setError(error?.message ?? data?.msg ?? 'No se pudo imprimir'); return }
    const { ot: o, unidad, tareas: ts, costos: cs, total, empresa } = data
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>OT ${o.numero_ot}</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:13px;color:#222;padding:24px}
        .logo{text-align:center;margin-bottom:12px}
        .logo img{height:48px}
        .header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #E8821A;padding-bottom:12px;margin-bottom:16px}
        .info{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;margin-bottom:16px}
        th{background:#2D3748;color:#fff;padding:7px 10px;text-align:left;font-size:11px}
        td{padding:7px 10px;border-bottom:1px solid #eee}
        .total{text-align:right;font-weight:700;font-size:16px}
        .footer{margin-top:8px;text-align:center;font-size:10px;color:#a0aec0}
        @media print{button{display:none}}
      </style></head><body>
      <div class="logo"><img src="${new URL(logoAndesCheck, window.location.origin).href}" alt="AndesCheck" /></div>
      <div class="header">
        <div><h2 style="margin:0;color:#2D3748">${empresa?.razon_social ?? ''}</h2></div>
        <div style="text-align:right"><strong>ORDEN DE TRABAJO</strong><br><span style="font-size:20px;font-weight:800;color:#E8821A">${o.numero_ot}</span></div>
      </div>
      <div class="info">
        <div><strong>Unidad:</strong> ${unidad?.descripcion ?? ''} — ${unidad?.patente_serie ?? ''}</div>
        <div><strong>Estado:</strong> ${o.estado}</div>
        <div><strong>Tipo:</strong> ${o.tipo}</div>
        <div><strong>Prioridad:</strong> ${o.prioridad ?? '—'}</div>
        <div><strong>Apertura:</strong> ${new Date(o.fecha_apertura).toLocaleDateString()}</div>
        <div><strong>Cierre:</strong> ${o.fecha_cierre ? new Date(o.fecha_cierre).toLocaleDateString() : '—'}</div>
        <div style="grid-column:1/-1"><strong>Descripción:</strong> ${o.descripcion ?? ''}</div>
        ${o.observaciones ? `<div style="grid-column:1/-1"><strong>Observaciones:</strong> ${o.observaciones}</div>` : ''}
      </div>
      <strong>TAREAS</strong>
      <table><thead><tr><th>#</th><th>Descripción</th><th>Estado</th></tr></thead><tbody>
        ${(ts || []).map(t => `<tr><td>${t.orden}</td><td>${t.descripcion}</td><td>${t.estado}</td></tr>`).join('')}
      </tbody></table>
      ${(cs || []).length ? `<strong>COSTOS</strong><table><thead><tr><th>Descripción</th><th>Monto</th></tr></thead><tbody>
        ${cs.map(c => `<tr><td>${c.descripcion ?? ''}</td><td>$${Number(c.monto).toLocaleString('es-AR')}</td></tr>`).join('')}
      </tbody></table><div class="total">Total: $${Number(total || 0).toLocaleString('es-AR')}</div>` : ''}
      <div style="margin-top:40px;border-top:1px solid #ccc;padding-top:16px;font-size:11px;color:#718096;display:flex;justify-content:space-between">
        <span>Firma técnico: ______________________</span>
        <span>Firma supervisor: ______________________</span>
      </div>
      <div class="footer">Powered by AndesCheck</div>
      <script>window.print()<\/script>
      </body></html>`)
    w.document.close()
  }

  async function enviarMail(destinatario) {
    const { data, error } = await supabase.rpc('enviar_ot_mail', { p_id_ot: idOt, p_destinatario: destinatario })
    if (error) throw error
    if (!data?.ok) throw new Error(data.msg)
    setMailModalAbierto(false)
    setMensajeExito('Mail enviado')
    setTimeout(() => setMensajeExito(''), 4000)
  }

  function enviarWhatsapp(soloDigitos) {
    const texto = `Orden de trabajo ${ot.numero_ot}\nUnidad: ${ot.unidades?.descripcion ?? ''} (${ot.unidades?.patente_serie ?? ''})\nEstado: ${ot.estado}\nDescripción: ${ot.descripcion ?? ''}`
    window.open(`https://wa.me/${soloDigitos}?text=${encodeURIComponent(texto)}`, '_blank')
    setWhatsappModalAbierto(false)
  }

  async function toggleChecklistItem(idx) {
    const nuevo = checklist.map((item, i) => i === idx ? { ...item, checked: !item.checked } : item)
    setOt(o => ({ ...o, checklist_completado: nuevo }))
    const { error } = await supabase.rpc('actualizar_checklist_ot', { p_id_ot: idOt, p_checklist: nuevo })
    if (error) setError(error.message)
  }

  async function agregarSeguimiento(e) {
    e.preventDefault()
    if (!notaNueva.trim()) return
    setError('')

    // Sin conexión no se puede subir foto/PDF a Storage — se encola solo
    // la nota de texto y se sincroniza sola al reconectar.
    if (!online) {
      encolar('ot_seguimiento', { id_ot: idOt, descripcion: notaNueva.trim(), usuario: usuario.id }, `Seguimiento OT ${ot?.numero_ot ?? idOt}`)
      setNotaNueva('')
      setFotoNueva(null)
      setPdfNuevo(null)
      if (fotoNueva || pdfNuevo) setError('La foto/PDF no se guardaron — necesitan conexión. La nota de texto sí quedó guardada y se sincronizará sola.')
      return
    }

    let foto_url = null
    if (fotoNueva) {
      const path = `${usuario.empresa_id}/${idOt}/${Date.now()}-${fotoNueva.name}`
      const { error: upErr } = await supabase.storage.from('ot-fotos').upload(path, fotoNueva)
      if (upErr) { setError(upErr.message); return }
      foto_url = supabase.storage.from('ot-fotos').getPublicUrl(path).data.publicUrl
    }

    let documento_url = null
    if (pdfNuevo) {
      const path = `${usuario.empresa_id}/${idOt}/${Date.now()}-${pdfNuevo.name}`
      const { error: upErr } = await supabase.storage.from('ot-fotos').upload(path, pdfNuevo)
      if (upErr) { setError(upErr.message); return }
      documento_url = supabase.storage.from('ot-fotos').getPublicUrl(path).data.publicUrl
    }

    const { error } = await supabase.from('ot_seguimiento').insert({
      id_ot: idOt, descripcion: notaNueva.trim(), usuario: usuario.id, foto_url, documento_url,
    })
    if (error) { setError(error.message); return }
    setNotaNueva('')
    setFotoNueva(null)
    setPdfNuevo(null)
    cargar()
  }

  async function cerrarOt() {
    const { data, error } = await supabase.rpc('cerrar_ot', { p_id_ot: idOt })
    if (error) throw error
    if (!data?.ok) throw new Error(data.msg)
    setCerrarOtConfirm(false)
    cargar()
  }

  if (!ot) return <p className="p-6 text-sm text-gray-400">Cargando...</p>

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <div>
          <button onClick={volver} className="text-xs text-blue-600 hover:underline mb-1">← Volver a OT</button>
          <h1 className="text-base font-medium text-gray-900 dark:text-gray-100">{ot.numero_ot} — {ot.unidades?.descripcion}</h1>
          <p className="text-xs text-gray-400">{ot.estado} · {ot.tipo}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={cargar} disabled={actualizando} className="text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg transition-colors disabled:opacity-50">
            {actualizando ? 'Actualizando…' : 'Actualizar'}
          </button>
          {puedeGestionar && (
            <button onClick={imprimir} className="text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg transition-colors">
              🖨 Imprimir
            </button>
          )}
          {puedeGestionar && (
            <button onClick={() => setMailModalAbierto(true)} className="text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg transition-colors">
              ✉ Enviar
            </button>
          )}
          {puedeGestionar && (
            <button onClick={() => setWhatsappModalAbierto(true)} className="text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg transition-colors">
              📱 WhatsApp
            </button>
          )}
          {puedeGestionar && puedeCerrar && (
            <button onClick={() => setCerrarOtConfirm(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg">
              Cerrar OT
            </button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {mensajeExito && (
          <div className="flex items-center justify-between gap-2 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-xl px-4 py-2 text-sm text-green-700 dark:text-green-400">
            <p>{mensajeExito}</p>
            <button type="button" onClick={() => setMensajeExito('')} className="text-green-500 hover:text-green-700 text-xs shrink-0">✕</button>
          </div>
        )}

        {(novedadesUnidad.length > 0 || rutinasUnidad.length > 0) && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl p-4 text-sm space-y-1.5">
            <p className="font-medium text-amber-800 dark:text-amber-300">⚠ Esta unidad tiene pendientes:</p>
            {novedadesUnidad.map(n => (
              <div key={n.id} className="flex items-center justify-between gap-2 text-amber-700 dark:text-amber-400">
                <p>
                  • Novedad {n.estado === 'Aprobada' ? 'aprobada' : 'pendiente'}: {n.descripcion}
                  {n.estado !== 'Aprobada' && <span className="text-xs italic"> (pendiente de aprobación)</span>}
                </p>
                {puedeGestionar && n.estado === 'Aprobada' && otActiva && (
                  <button
                    type="button"
                    onClick={() => setNovedadResolver(n)}
                    className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                  >
                    Resolver aquí
                  </button>
                )}
              </div>
            ))}
            {rutinasUnidad.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-2 text-amber-700 dark:text-amber-400">
                <p>• Rutina {r.estado_calculado === 'Vencida' ? 'vencida' : 'por vencer'}: {r.descripcion}</p>
                {puedeGestionar && (
                  <button
                    type="button"
                    onClick={() => agregarRutinaComoTareas(r)}
                    disabled={agregandoRutina === r.id}
                    className="text-xs text-blue-600 hover:underline whitespace-nowrap disabled:opacity-50"
                  >
                    {agregandoRutina === r.id ? 'Agregando…' : 'Agregar a esta OT'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-2">
          <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">Descripción</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">{ot.descripcion}</p>
          {ot.observaciones && (
            <p className="text-sm text-gray-500 dark:text-gray-400"><span className="font-medium">Observaciones:</span> {ot.observaciones}</p>
          )}
          {ot.proveedores?.razon_social && (
            <p className="text-sm text-gray-500 dark:text-gray-400"><span className="font-medium">Proveedor:</span> {ot.proveedores.razon_social}</p>
          )}
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              <span className="font-medium">Técnicos asignados:</span>{' '}
              {ot.tecnicos_asignados?.length > 0
                ? tecnicos.filter(t => ot.tecnicos_asignados.includes(t.id)).map(t => t.nombre).join(', ') || 'Cargando…'
                : 'Sin técnicos asignados'}
            </p>
            {puedeGestionar && (
              <button type="button" onClick={() => setTecnicosModalAbierto(true)} className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                Editar
              </button>
            )}
          </div>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">Tareas</h2>
            {puedeGestionar && otActiva && (
              <button onClick={() => setTareaModalAbierta(true)} className="text-xs text-blue-600 hover:underline">+ Tarea</button>
            )}
          </div>

          {puedeGestionar && otActiva && tareas.length > 0 && (
            <div className="flex items-center justify-between gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg px-3 py-2 mb-3 text-sm">
              <label className="flex items-center gap-2 text-blue-700 dark:text-blue-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tareasSeleccionadas.length === tareas.length}
                  onChange={e => setTareasSeleccionadas(e.target.checked ? tareas.map(t => t.id) : [])}
                />
                {tareasSeleccionadas.length > 0 ? `${tareasSeleccionadas.length} tarea(s) seleccionada(s)` : 'Seleccionar todas'}
              </label>
              {tareasSeleccionadas.length > 0 && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setTecnicosTareaModal({ taskIds: tareasSeleccionadas, seleccionados: [] })}
                    className="text-xs text-blue-600 hover:underline font-medium"
                  >
                    Asignar técnico(s)
                  </button>
                  <button type="button" onClick={() => setTareasSeleccionadas([])} className="text-xs text-gray-500 hover:underline">
                    Cancelar selección
                  </button>
                </div>
              )}
            </div>
          )}

          {tareas.length === 0 ? (
            <p className="text-sm text-gray-400">Sin tareas cargadas.</p>
          ) : (
            <ul className="space-y-2">
              {tareas.map(t => (
                <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-gray-700 dark:text-gray-300 flex-1 flex items-start gap-2">
                    {puedeGestionar && otActiva && (
                      <input
                        type="checkbox"
                        checked={tareasSeleccionadas.includes(t.id)}
                        onChange={() => toggleSeleccionTarea(t.id)}
                        className="mt-1 shrink-0"
                      />
                    )}
                    <span>
                      {t.descripcion}
                      <span className="block text-xs text-gray-400">
                        {t.tecnicos_asignados?.length > 0
                          ? tecnicos.filter(tec => t.tecnicos_asignados.includes(tec.id)).map(tec => tec.nombre).join(', ')
                          : 'Sin técnico'}
                        {puedeGestionar && otActiva && (
                          <button
                            type="button"
                            onClick={() => setTecnicosTareaModal({ taskIds: [t.id], seleccionados: t.tecnicos_asignados || [] })}
                            className="ml-1 text-blue-600 hover:underline"
                          >
                            Editar
                          </button>
                        )}
                      </span>
                      {t.rutinas_mantenimiento?.descripcion && (
                        <span className="block text-xs text-blue-600 dark:text-blue-400" title={t.rutinas_mantenimiento.descripcion}>
                          ↻ Pertenece a la rutina: {t.rutinas_mantenimiento.descripcion}
                        </span>
                      )}
                      {novedadPorTarea[t.id] && (
                        <span className="block text-xs text-amber-600 dark:text-amber-400" title={novedadPorTarea[t.id]}>
                          ✓ Resuelve novedad: {novedadPorTarea[t.id]}
                        </span>
                      )}
                      {t.estado === 'Pausada' && t.motivo_pausa && (
                        <span className="block text-xs text-orange-500 dark:text-orange-400">
                          ⏸ Pausada: {t.motivo_pausa}
                        </span>
                      )}
                    </span>
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {puedeMarcarTarea(t) ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{ESTADO_TAREA_LABEL[t.estado]}</span>
                        {(t.estado === 'Pendiente' || t.estado === 'Pausada') && (
                          <button
                            onClick={() => marcarTarea(t, 'En_Curso')}
                            title={t.estado === 'Pausada' ? 'Reanudar' : 'Iniciar'}
                            className="text-xs text-green-600 hover:underline whitespace-nowrap"
                          >
                            ▶ {t.estado === 'Pausada' ? 'Reanudar' : 'Iniciar'}
                          </button>
                        )}
                        {t.estado === 'En_Curso' && (
                          <>
                            <button onClick={() => marcarTarea(t, 'Completada')} title="Finalizar" className="text-xs text-green-600 hover:underline whitespace-nowrap">
                              ✓ Finalizar
                            </button>
                            <button onClick={() => setTareaAPausar(t)} title="Pausar" className="text-xs text-orange-500 hover:underline whitespace-nowrap">
                              ⏸ Pausar
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">{ESTADO_TAREA_LABEL[t.estado]}</span>
                    )}
                    {puedeGestionar && otActiva && t.estado !== 'Completada' && (
                      <button onClick={() => setTareaConvertir(t)} title="Convertir en novedad" className="text-xs text-amber-600 hover:underline">→ Nov</button>
                    )}
                    {puedeGestionar && otActiva && (
                      <button
                        onClick={() => t.id_rutina_origen ? setTareaElegirAccion(t) : setTareaEliminar(t)}
                        title="Eliminar tarea"
                        className="text-xs text-red-500"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">Costos</h2>
            {puedeGestionar && otActiva && (
              <button onClick={() => setCostoModalAbierto(true)} className="text-xs text-blue-600 hover:underline">+ Costo</button>
            )}
          </div>
          {costos.length === 0 ? (
            <p className="text-sm text-gray-400">Sin costos cargados.</p>
          ) : (
            <>
              <ul className="space-y-1">
                {costos.map(c => (
                  <li key={c.id} className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                    <span>{c.descripcion}</span>
                    <span>${Number(c.monto).toLocaleString('es-AR')}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between text-sm font-semibold text-gray-900 dark:text-gray-100 border-t border-gray-100 dark:border-gray-800 mt-2 pt-2">
                <span>Total</span>
                <span>${totalCostos.toLocaleString('es-AR')}</span>
              </div>
            </>
          )}
        </section>

        {checklist.length > 0 && (
          <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Checklist de cierre</h2>
            <ul className="space-y-2">
              {checklist.map((item, idx) => (
                <li key={item.id ?? idx} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!item.checked}
                    onChange={() => toggleChecklistItem(idx)}
                    disabled={!puedeGestionar && !esTecnicoDeLaOt}
                  />
                  <span className="text-gray-700 dark:text-gray-300">{item.texto}</span>
                  {item.requerido && <span className="text-xs text-red-500">*</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Firmas</h2>
          <div className="flex gap-4 mb-3">
            {['tecnico', 'supervisor'].map(proceso => {
              const firma = firmas.find(f => f.proceso === proceso)
              return (
                <div key={proceso} className="flex-1">
                  <p className="text-xs text-gray-400 mb-1 capitalize">{proceso}</p>
                  {firma ? (
                    <img src={firma.firma_url} alt={`Firma ${proceso}`} className="border border-gray-200 dark:border-gray-700 rounded-lg h-20 bg-white" />
                  ) : (
                    <button
                      onClick={() => setFirmaAbierta(proceso)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      + Firmar
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">Herramientas reservadas</h2>
            {puedeGestionar && (
              <button onClick={() => setReservaAbierta(true)} className="text-xs text-blue-600 hover:underline">+ Reservar herramienta</button>
            )}
          </div>
          {herramientas.length === 0 ? (
            <p className="text-sm text-gray-400">Sin herramientas reservadas.</p>
          ) : (
            <ul className="space-y-1">
              {herramientas.map(h => (
                <li key={h.id} className="text-sm text-gray-600 dark:text-gray-400">
                  {h.herramientas?.codigo} — {h.herramientas?.descripcion}
                  <span className="text-xs text-gray-400"> ({new Date(h.fecha_reserva).toLocaleString()} → {new Date(h.fecha_devolucion).toLocaleString()})</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Seguimiento</h2>
          <form onSubmit={agregarSeguimiento} className="space-y-2 mb-4">
            <div className="flex gap-2">
              <input
                value={notaNueva}
                onChange={e => setNotaNueva(e.target.value)}
                placeholder="Agregar nota…"
                className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm"
              />
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg whitespace-nowrap">Agregar</button>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">
                📷 {fotoNueva ? fotoNueva.name : 'Adjuntar foto'}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={e => setFotoNueva(e.target.files[0] ?? null)}
                  className="hidden"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">
                📄 {pdfNuevo ? pdfNuevo.name : 'Adjuntar PDF'}
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={e => setPdfNuevo(e.target.files[0] ?? null)}
                  className="hidden"
                />
              </label>
            </div>
          </form>
          <ul className="space-y-3">
            {seguimiento.map(s => (
              <li key={s.id} className="text-sm text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-800 pt-3">
                <span className="text-xs text-gray-400">{new Date(s.fecha).toLocaleString()}</span> — {s.descripcion}
                {s.usuarios && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {s.usuarios.nombre} <span className="capitalize">({s.usuarios.rol})</span>
                  </p>
                )}
                {s.foto_url && (
                  <a href={s.foto_url} target="_blank" rel="noreferrer" className="block mt-2">
                    <img src={s.foto_url} alt={`Foto subida por ${s.usuarios?.nombre ?? 'usuario'}`} className="rounded-lg border border-gray-200 dark:border-gray-700 max-h-40" />
                  </a>
                )}
                {s.documento_url && (
                  <a href={s.documento_url} target="_blank" rel="noreferrer" className="inline-block mt-2 text-xs text-blue-600 hover:underline">
                    📄 Ver PDF adjunto
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {firmaAbierta && (
        <FirmaModal
          idOt={idOt}
          empresaId={usuario.empresa_id}
          proceso={firmaAbierta}
          onClose={() => setFirmaAbierta(null)}
          onGuardada={() => { setFirmaAbierta(null); cargar() }}
        />
      )}

      {reservaAbierta && (
        <ReservaHerramientaModal
          idOt={idOt}
          onClose={() => setReservaAbierta(false)}
          onReservada={() => { setReservaAbierta(false); cargar() }}
        />
      )}

      {tareaModalAbierta && (
        <AgregarTareaModal
          idOt={idOt}
          tareasActuales={tareas}
          onClose={() => setTareaModalAbierta(false)}
          onAdded={() => { setTareaModalAbierta(false); cargar() }}
        />
      )}

      {tecnicosModalAbierto && (
        <TecnicosOtModal
          tecnicos={tecnicos}
          seleccionados={ot.tecnicos_asignados || []}
          onClose={() => setTecnicosModalAbierto(false)}
          onSave={{ idOt, onSaved: () => { setTecnicosModalAbierto(false); cargar() } }}
        />
      )}

      {tecnicosTareaModal && (
        <TecnicosTareaModal
          tecnicos={tecnicos}
          seleccionados={tecnicosTareaModal.seleccionados}
          cantidadTareas={tecnicosTareaModal.taskIds.length}
          onClose={() => setTecnicosTareaModal(null)}
          onSave={tecnicoIds => guardarTecnicosTarea(tecnicosTareaModal.taskIds, tecnicoIds)}
        />
      )}

      {tareaAPausar && (
        <PausaTareaModal
          motivos={motivosPausa}
          onClose={() => setTareaAPausar(null)}
          onConfirm={pausarTarea}
        />
      )}

      {mailModalAbierto && (
        <EnviarMailModal
          valorInicial={ot?.proveedores?.mail}
          onClose={() => setMailModalAbierto(false)}
          onConfirm={enviarMail}
        />
      )}

      {whatsappModalAbierto && (
        <EnviarWhatsappModal
          valorInicial={ot?.proveedores?.telefono}
          onClose={() => setWhatsappModalAbierto(false)}
          onConfirm={enviarWhatsapp}
        />
      )}

      {cerrarOtConfirm && (
        <ConfirmModal
          titulo="Cerrar orden de trabajo"
          mensaje="¿Cerrar esta OT?"
          textoBoton="Cerrar OT"
          peligro={false}
          onConfirm={cerrarOt}
          onClose={() => setCerrarOtConfirm(false)}
        />
      )}

      {novedadResolver && (
        <ResolverNovedadModal
          idOt={idOt}
          novedad={novedadResolver}
          onClose={() => setNovedadResolver(null)}
          onResuelta={() => { setNovedadResolver(null); cargar() }}
        />
      )}

      {costoModalAbierto && (
        <CostoModal idOt={idOt} usuario={usuario}
          onClose={() => setCostoModalAbierto(false)}
          onAdded={() => { setCostoModalAbierto(false); cargar() }}
        />
      )}

      {tareaEliminar && (
        <MotivoModal
          titulo={`Eliminar tarea — ${tareaEliminar.descripcion}`}
          label="Motivo de la eliminación *"
          textoBoton="Eliminar"
          onConfirm={eliminarTarea}
          onClose={() => setTareaEliminar(null)}
        />
      )}

      {tareaConvertir && (
        <MotivoModal
          titulo="Convertir tarea a novedad"
          label="Descripción de la novedad *"
          valorInicial={tareaConvertir.descripcion}
          textoBoton="Convertir"
          onConfirm={convertirANovedad}
          onClose={() => setTareaConvertir(null)}
        />
      )}

      {tareaElegirAccion && (
        <ElegirEliminarTareaModal
          tarea={tareaElegirAccion}
          cantidadEnBundle={tareas.filter(x => x.id_rutina_origen === tareaElegirAccion.id_rutina_origen).length}
          onClose={() => setTareaElegirAccion(null)}
          onAnularRutina={() => { setRutinaAnular(tareaElegirAccion); setTareaElegirAccion(null) }}
          onConvertirNovedad={() => { setTareaConvertir(tareaElegirAccion); setTareaElegirAccion(null) }}
        />
      )}

      {rutinaAnular && (
        <MotivoModal
          titulo={`Anular rutina en esta OT — ${rutinaAnular.rutinas_mantenimiento?.descripcion ?? ''}`}
          label="Motivo de la anulación *"
          textoBoton="Anular rutina"
          onConfirm={anularRutinaEnOt}
          onClose={() => setRutinaAnular(null)}
        />
      )}
    </div>
  )
}
