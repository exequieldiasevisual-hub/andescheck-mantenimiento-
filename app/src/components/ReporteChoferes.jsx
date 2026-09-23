import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from './Modal'
import ConfirmModal from './ConfirmModal'

const INPUT = 'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm'
const hoyISO = () => new Date().toLocaleDateString('sv-SE') // yyyy-mm-dd en huso horario local
const DIAS_SEMANA = [['1', 'L'], ['2', 'M'], ['3', 'X'], ['4', 'J'], ['5', 'V'], ['6', 'S'], ['7', 'D']]
const DIAS_LABORALES_DEFECTO = '1,2,3,4,5'

function DiasLaboralesSelector({ empresaId }) {
  const [dias, setDias] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('configuracion').select('valor').eq('seccion', 'parametros').eq('clave', 'checklist_dias_laborales').maybeSingle()
      .then(({ data }) => setDias((data?.valor || DIAS_LABORALES_DEFECTO).split(',').filter(Boolean)))
  }, [])

  async function alternar(dia) {
    const nuevos = dias.includes(dia) ? dias.filter(d => d !== dia) : [...dias, dia]
    setDias(nuevos)
    setSaving(true)
    await supabase.from('configuracion').upsert({ empresa_id: empresaId, seccion: 'parametros', clave: 'checklist_dias_laborales', valor: nuevos.join(',') })
    setSaving(false)
  }

  if (!dias) return null
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-gray-500 dark:text-gray-400">Días laborales de los choferes:</span>
      {DIAS_SEMANA.map(([valor, letra]) => (
        <button key={valor} type="button" disabled={saving} onClick={() => alternar(valor)}
          className={`w-7 h-7 text-xs rounded-full transition-colors ${
            dias.includes(valor) ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
          }`}>
          {letra}
        </button>
      ))}
    </div>
  )
}

function FrancoModal({ choferes, onClose, onSaved }) {
  const [idChofer, setIdChofer] = useState('')
  const [desde, setDesde] = useState(hoyISO())
  const [hasta, setHasta] = useState(hoyISO())
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!idChofer) { setError('Elegí el chofer'); return }
    if (hasta < desde) { setError('La fecha "hasta" no puede ser anterior a "desde"'); return }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('choferes_franco').insert({
      id_chofer: idChofer, desde, hasta, motivo: motivo.trim() || null,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal titulo="Marcar franco" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Chofer *</label>
          <select value={idChofer} onChange={e => setIdChofer(e.target.value)} className={INPUT} required>
            <option value="">Seleccionar...</option>
            {choferes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Desde *</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className={INPUT} required />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Hasta *</label>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className={INPUT} required />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Motivo (opcional)</label>
          <input value={motivo} onChange={e => setMotivo(e.target.value)} className={INPUT} />
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancelar</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function HistorialModal({ chofer, onClose }) {
  const [dias, setDias] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const hasta = new Date()
    const desde = new Date()
    desde.setDate(desde.getDate() - 29) // últimos 30 días
    supabase.rpc('get_historial_checklist_diario_chofer', {
      p_id_chofer: chofer.id,
      p_desde: desde.toLocaleDateString('sv-SE'),
      p_hasta: hasta.toLocaleDateString('sv-SE'),
    }).then(({ data, error: err }) => {
      if (err) { setError(err.message); return }
      if (!data?.ok) { setError(data?.msg ?? 'No se pudo cargar el historial'); return }
      setDias([...data.dias].reverse())
    })
  }, [chofer.id])

  return (
    <Modal titulo={`Historial — ${chofer.nombre}`} onClose={onClose}>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Últimos 30 días</p>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!dias && !error ? (
        <p className="text-sm text-gray-400 text-center py-6">Cargando…</p>
      ) : (
        <ul className="space-y-1 max-h-96 overflow-y-auto">
          {dias?.map(d => (
            <li key={d.fecha} className="flex items-center justify-between text-sm border-t border-gray-100 dark:border-gray-800 pt-1.5 first:border-t-0 first:pt-0">
              <span className="text-gray-600 dark:text-gray-400">{new Date(d.fecha + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              {d.no_laborable ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">Fin de semana</span>
              ) : d.en_franco ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">Franco</span>
              ) : d.cumplio ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  Cumplió {new Date(d.hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">No cumplió</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

export default function ReporteChoferes({ empresaId }) {
  const [fecha, setFecha] = useState(hoyISO())
  const [choferes, setChoferes] = useState(null)
  const [diaLaborable, setDiaLaborable] = useState(true)
  const [francos, setFrancos] = useState([])
  const [error, setError] = useState('')
  const [francoAbierto, setFrancoAbierto] = useState(false)
  const [francoEliminar, setFrancoEliminar] = useState(null)
  const [historialChofer, setHistorialChofer] = useState(null)

  async function cargar() {
    setError('')
    const [{ data, error: err }, { data: francosData }] = await Promise.all([
      supabase.rpc('get_cumplimiento_checklist_diario', { p_fecha: fecha }),
      supabase.from('choferes_franco').select('*, usuarios!choferes_franco_id_chofer_fkey(nombre)').gte('hasta', hoyISO()).order('desde'),
    ])
    if (err) { setError(err.message); return }
    if (!data?.ok) { setError(data?.msg ?? 'No se pudo cargar el reporte'); return }
    setChoferes(data.choferes)
    setDiaLaborable(data.dia_laborable)
    setFrancos(francosData || [])
  }

  useEffect(() => { cargar() }, [fecha])

  async function eliminarFranco() {
    const { error: err } = await supabase.from('choferes_franco').delete().eq('id', francoEliminar.id)
    if (err) throw err
    setFrancoEliminar(null)
    cargar()
  }

  const activos = (choferes || []).filter(c => !c.en_franco)
  const enFranco = (choferes || []).filter(c => c.en_franco)
  const cumplieron = activos.filter(c => c.cumplio).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 dark:text-gray-400">Día</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <button onClick={() => setFrancoAbierto(true)}
          className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
          + Marcar franco
        </button>
      </div>

      <DiasLaboralesSelector empresaId={empresaId} />

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!choferes ? (
        <p className="text-sm text-gray-400 text-center py-8">Cargando…</p>
      ) : !diaLaborable ? (
        <p className="text-sm text-gray-400 text-center py-8">Los choferes no trabajan este día — no se pide checklist</p>
      ) : activos.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No hay choferes activos cargados</p>
      ) : (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400">{cumplieron} de {activos.length} cumplieron el checklist diario</p>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
            {activos.map(c => (
              <button key={c.id} onClick={() => setHistorialChofer(c)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <span className="text-sm text-gray-900 dark:text-gray-100">{c.nombre}</span>
                {c.cumplio ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    ✓ Cumplió {new Date(c.hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">No cumplió</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {enFranco.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 mb-1.5">De franco este día ({enFranco.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {enFranco.map(c => (
              <span key={c.id} className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">{c.nombre}</span>
            ))}
          </div>
        </div>
      )}

      {francos.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 mb-1.5">Francos cargados (desde hoy en adelante)</p>
          <div className="space-y-1.5">
            {francos.map(f => (
              <div key={f.id} className="flex items-center justify-between text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
                <span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{f.usuarios?.nombre}</span>
                  <span className="text-gray-500 dark:text-gray-400"> — {new Date(f.desde + 'T00:00:00').toLocaleDateString('es-AR')} al {new Date(f.hasta + 'T00:00:00').toLocaleDateString('es-AR')}</span>
                  {f.motivo && <span className="text-gray-400"> ({f.motivo})</span>}
                </span>
                <button onClick={() => setFrancoEliminar(f)} className="text-xs text-red-600 hover:underline shrink-0 ml-2">Quitar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {francoAbierto && (
        <FrancoModal choferes={activos.concat(enFranco)} onClose={() => setFrancoAbierto(false)} onSaved={() => { setFrancoAbierto(false); cargar() }} />
      )}
      {historialChofer && <HistorialModal chofer={historialChofer} onClose={() => setHistorialChofer(null)} />}
      {francoEliminar && (
        <ConfirmModal
          titulo="Quitar franco"
          mensaje={`¿Quitar el franco de "${francoEliminar.usuarios?.nombre}"?`}
          textoBoton="Quitar"
          onConfirm={eliminarFranco}
          onClose={() => setFrancoEliminar(null)}
        />
      )}
    </div>
  )
}
