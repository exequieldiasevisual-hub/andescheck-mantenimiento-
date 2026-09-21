import { useEffect, useState } from 'react'
import { enviarChecklistMail } from './enviarChecklistMail'

const QUEUE_KEY = 'andescheck_offline_queue'
const EVENTO_CAMBIO = 'andescheck-offline-queue-changed'

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

export function obtenerCola() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || [] } catch { return [] }
}

function guardarCola(cola) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(cola))
  window.dispatchEvent(new Event(EVENTO_CAMBIO))
}

// Nota de pedido offline: las fotos (obligatorias) viajan en la cola como
// dataURL y se suben a Storage al sincronizar. Lanza si localStorage no tiene
// espacio, para que la pantalla avise en vez de perder la nota en silencio.
export function encolarNotaPedido(args, fotosDataUrl, descripcion, empresaId) {
  const cola = obtenerCola()
  cola.push({ id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, modo: 'nota_pedido', args, fotosDataUrl, empresaId, descripcion, fecha: new Date().toISOString() })
  guardarCola(cola)
}

async function subirFotoDataUrl(supabase, dataUrl, empresaId, carpeta = 'notas-pedido') {
  const blob = await (await fetch(dataUrl)).blob()
  const path = `${empresaId}/${carpeta}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from('ot-fotos').upload(path, blob, { contentType: 'image/jpeg' })
  if (error) throw error
  return supabase.storage.from('ot-fotos').getPublicUrl(path).data.publicUrl
}

// tabla: nombre de la tabla destino. payload: lo que se insertaría con
// supabase.from(tabla).insert(payload). descripcion: texto para mostrar
// en la cola pendiente ("Novedad: unidad X").
export function encolar(tabla, payload, descripcion) {
  const cola = obtenerCola()
  cola.push({ id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, modo: 'insert', tabla, payload, descripcion, fecha: new Date().toISOString() })
  guardarCola(cola)
}

// Igual que encolar, pero para acciones que no son un insert directo sino
// una función RPC con lógica propia (ej. ejecutar_checklist genera
// novedades automáticas, crear_carga_combustible actualiza la unidad).
// extra: datos propios de la operación que no van al RPC (ej. empresaId para
// subir las fotos guardadas como dataURL en args.p_respuestas[].foto_dataurl).
export function encolarRpc(funcion, args, descripcion, extra = {}) {
  const cola = obtenerCola()
  cola.push({ id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, modo: 'rpc', funcion, args, descripcion, fecha: new Date().toISOString(), ...extra })
  guardarCola(cola)
}

export function useColaPendiente() {
  const [cola, setCola] = useState(obtenerCola())
  useEffect(() => {
    const actualizar = () => setCola(obtenerCola())
    window.addEventListener(EVENTO_CAMBIO, actualizar)
    return () => window.removeEventListener(EVENTO_CAMBIO, actualizar)
  }, [])
  return cola
}

// Reintenta cada operación encolada; las que fallan quedan en la cola
// para el próximo intento (ej. si se corta la conexión a mitad de la sync).
export async function sincronizarCola(supabase) {
  const cola = obtenerCola()
  if (!cola.length) return { sincronizados: 0, fallidos: 0 }
  const restantes = []
  let sincronizados = 0
  for (const op of cola) {
    let error = null
    if (op.modo === 'nota_pedido') {
      try {
        const items = []
        for (let i = 0; i < op.args.p_items.length; i++) {
          const fotos = [].concat(op.fotosDataUrl[i]) // fotosDataUrl[i]: array de dataURL (1 a 3) del ítem i
          const fotos_urls = []
          for (const f of fotos) fotos_urls.push(await subirFotoDataUrl(supabase, f, op.empresaId))
          items.push({ ...op.args.p_items[i], fotos_urls })
        }
        const { data, error: errRpc } = await supabase.rpc('crear_nota_pedido', { ...op.args, p_items: items })
        error = errRpc || (data && data.ok === false ? new Error(data.msg || 'No se pudo sincronizar') : null)
      } catch (err) { error = err }
    } else if (op.modo === 'rpc') {
      let args = op.args
      try {
        // Fotos de respuestas de checklist guardadas offline: se suben ahora y se reemplazan por su URL.
        if (op.funcion === 'ejecutar_checklist' && args.p_respuestas?.some(r => r.foto_dataurl)) {
          const respuestas = []
          for (const { foto_dataurl, ...r } of args.p_respuestas) {
            respuestas.push(foto_dataurl ? { ...r, foto_url: await subirFotoDataUrl(supabase, foto_dataurl, op.empresaId, 'checklists') } : r)
          }
          args = { ...args, p_respuestas: respuestas }
        }
      } catch { restantes.push(op); continue }
      const { data, error: errRpc } = await supabase.rpc(op.funcion, args)
      error = errRpc || (data && data.ok === false ? new Error(data.msg || 'No se pudo sincronizar') : null)
      if (!error && op.funcion === 'ejecutar_checklist' && data?.id_ejecucion) {
        enviarChecklistMail(supabase, data.id_ejecucion)
      }
    } else {
      const { error: errInsert } = await supabase.from(op.tabla).insert(op.payload)
      error = errInsert
    }
    if (error) restantes.push(op)
    else sincronizados++
  }
  guardarCola(restantes)
  return { sincronizados, fallidos: restantes.length }
}
