import { useEffect, useState } from 'react'
import { Sun, Moon, Menu, X } from 'lucide-react'
import { logout } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useTema } from '../lib/useTema'
import logoAndesCheck from '../assets/andescheck-logo.svg'
import BuscadorUnidad from './BuscadorUnidad'

const SECCIONES = [
  {
    titulo: 'Plataforma',
    items: [
      { key: 'empresas', label: 'Panel de Empresas' },
    ],
  },
  {
    titulo: 'Principal',
    items: [
      { key: 'dashboard', label: 'Dashboard' },
      { key: 'reportes', label: 'Reportes' },
    ],
  },
  {
    titulo: 'Operaciones',
    items: [
      { key: 'unidades', label: 'Activos' },
      { key: 'componentes', label: 'Componentes' },
      { key: 'ot', label: 'Órdenes de Trabajo' },
      { key: 'novedades', label: 'Novedades' },
      { key: 'rutinas', label: 'Rutinas de Mantenimiento' },
    ],
  },
  {
    titulo: 'Recursos',
    colapsable: true,
    items: [
      { key: 'stock', label: 'Stock' },
      { key: 'herramientas', label: 'Herramientas' },
      { key: 'documentos', label: 'Documentos' },
      { key: 'proveedores', label: 'Proveedores' },
    ],
  },
  {
    titulo: 'Sistema',
    colapsable: true,
    items: [
      { key: 'secuencias', label: 'Secuencias' },
      { key: 'configuracion', label: 'Configuración' },
      { key: 'usuarios', label: 'Usuarios' },
    ],
  },
]

// El técnico solo trabaja sus OT, carga novedades y consulta herramientas —
// nada de maestros ni métricas generales de la empresa.
export const PAGINAS_TECNICO = ['ot', 'novedades', 'herramientas']

export default function Sidebar({ pagina, setPagina, usuario, abrirActivo }) {
  const { tema, alternar } = useTema()
  const [unidades, setUnidades] = useState([])
  const [seccionesManual, setSeccionesManual] = useState({})
  const [usarSecuencias, setUsarSecuencias] = useState(false)
  const [abiertoMobile, setAbiertoMobile] = useState(false)
  const esTecnico = usuario?.rol === 'tecnico'
  const esSuperAdmin = usuario?.rol === 'super_admin'
  // "Plataforma" (Panel de Empresas) solo la ve el super_admin — el resto
  // de las secciones se comportan igual que para un administrador normal,
  // aplicadas a SU PROPIA empresa interna (no a las empresas clientes).
  const secciones = SECCIONES
    .map(s => ({
      ...s,
      items: s.items
        .filter(i => !esTecnico || PAGINAS_TECNICO.includes(i.key))
        .filter(i => esSuperAdmin || i.key !== 'empresas')
        .filter(i => i.key !== 'secuencias' || usarSecuencias),
    }))
    .filter(s => s.items.length > 0)

  useEffect(() => {
    if (esTecnico) return
    supabase.from('unidades').select('id, descripcion, patente_serie').eq('activo', true).order('patente_serie')
      .then(({ data }) => setUnidades(data || []))
    supabase.from('configuracion').select('valor').eq('seccion', 'parametros').eq('clave', 'usar_secuencias').maybeSingle()
      .then(({ data }) => setUsarSecuencias(data?.valor === 'true'))
  }, [esTecnico])

  function irA(key) {
    setPagina(key)
    setAbiertoMobile(false)
  }

  function irAActivo(id) {
    abrirActivo(id)
    setAbiertoMobile(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbiertoMobile(true)}
        className="md:hidden fixed top-3 left-3 z-30 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2 shadow-sm"
        aria-label="Abrir menú"
      >
        <Menu size={18} />
      </button>

      {abiertoMobile && (
        <div className="md:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setAbiertoMobile(false)} />
      )}

      <div className={`flex flex-col w-56 shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700
        fixed md:static inset-y-0 left-0 z-50 transition-transform duration-200
        ${abiertoMobile ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <div>
            <img src={logoAndesCheck} alt="AndesCheck" className="w-28 mb-2" />
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{usuario?.empresas?.razon_social}</p>
            <p className="text-xs text-gray-400 mt-0.5">{usuario?.nombre} · {usuario?.rol}</p>
          </div>
          <button type="button" onClick={() => setAbiertoMobile(false)} className="md:hidden text-gray-400 hover:text-gray-600" aria-label="Cerrar menú">
            <X size={18} />
          </button>
        </div>
        {!esTecnico && (
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <BuscadorUnidad
              unidades={unidades}
              value={''}
              onChange={irAActivo}
              placeholder="🔍 Buscar patente…"
            />
          </div>
        )}
        <nav className="flex-1 overflow-y-auto py-2">
          {secciones.map(seccion => {
            const contienePaginaActiva = seccion.items.some(i => i.key === pagina)
            const manual = seccionesManual[seccion.titulo]
            const abierta = manual !== undefined ? manual : !seccion.colapsable || contienePaginaActiva
            return (
              <div key={seccion.titulo} className="mb-1">
                {seccion.colapsable ? (
                  <button
                    type="button"
                    onClick={() => setSeccionesManual(m => ({ ...m, [seccion.titulo]: !abierta }))}
                    className="w-full flex items-center justify-between px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {seccion.titulo}
                    <span>{abierta ? '▾' : '▸'}</span>
                  </button>
                ) : (
                  <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    {seccion.titulo}
                  </p>
                )}
                {abierta && seccion.items.map(item => (
                  <button
                    key={item.key}
                    onClick={() => irA(item.key)}
                    className={`w-full text-left px-4 py-2 text-sm ${
                      pagina === item.key
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )
          })}
        </nav>
        <div className="border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={alternar}
            aria-pressed={tema === 'oscuro'}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50"
          >
            {tema === 'oscuro' ? <Moon size={14} aria-hidden="true" /> : <Sun size={14} aria-hidden="true" />}
            {tema === 'oscuro' ? 'Modo oscuro' : 'Modo claro'}
          </button>
          <button
            onClick={logout}
            className="w-full px-4 py-3 text-sm text-left text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </>
  )
}
