import { useEffect, useState } from 'react'
import { obtenerOpciones } from '../lib/configuracion'

// Select que lee sus opciones de Configuración en vez de texto libre —
// estandariza los valores para evitar "Cordoba" vs "Córdoba" vs "cba".
// dosColumnas=true (tipos_unidad, ciudades, centros_costo): la fila trae
// código (clave) + descripción (valor) — se guarda el código, se muestra
// "código — descripción". dosColumnas=false (tipos_mision, unidades_medida):
// clave=valor=texto, se guarda y muestra tal cual.
export default function SelectConfig({ label, seccion, value, onChange, dosColumnas = true, required = false }) {
  const [opciones, setOpciones] = useState(null)

  useEffect(() => { obtenerOpciones(seccion).then(setOpciones) }, [seccion])

  if (opciones === null) return null

  return (
    <div>
      {label && <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</label>}
      {opciones.length === 0 ? (
        <p className="text-xs text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
          Sin opciones cargadas — agregalas en Configuración
        </p>
      ) : (
        <select value={value || ''} onChange={e => onChange(e.target.value)} required={required}
          className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Seleccionar...</option>
          {opciones.map(o => (
            <option key={o.clave} value={o.clave}>{dosColumnas ? `${o.clave} — ${o.valor}` : o.clave}</option>
          ))}
        </select>
      )}
    </div>
  )
}
