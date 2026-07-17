import { useEffect, useState } from 'react'

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

// tabla: nombre de la tabla destino. payload: lo que se insertaría con
// supabase.from(tabla).insert(payload). descripcion: texto para mostrar
// en la cola pendiente ("Novedad: unidad X").
export function encolar(tabla, payload, descripcion) {
  const cola = obtenerCola()
  cola.push({ id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, tabla, payload, descripcion, fecha: new Date().toISOString() })
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
    const { error } = await supabase.from(op.tabla).insert(op.payload)
    if (error) restantes.push(op)
    else sincronizados++
  }
  guardarCola(restantes)
  return { sincronizados, fallidos: restantes.length }
}
