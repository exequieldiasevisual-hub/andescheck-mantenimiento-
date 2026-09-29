import { useEffect, useState, lazy, Suspense } from 'react'
import { supabase } from './lib/supabase'
import { getUsuarioActual } from './lib/auth'
import Login from './pages/Login'
import Sidebar, { PAGINAS_TECNICO, PAGINAS_CHOFER } from './components/Sidebar'
import Placeholder from './pages/Placeholder'
import OfflineBanner from './components/OfflineBanner'

// Carga diferida: cada página se descarga recién cuando se entra a ella,
// en vez de bajar las 20 juntas al abrir la app (que es lo que pasaba
// antes — de ahí el aviso de Vite de "chunks larger than 500 kB").
const PanelEmpresas = lazy(() => import('./pages/PanelEmpresas'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Unidades = lazy(() => import('./pages/Unidades'))
const ActivoDetalle = lazy(() => import('./pages/ActivoDetalle'))
const Componentes = lazy(() => import('./pages/Componentes'))
const Ot = lazy(() => import('./pages/Ot'))
const OtDetalle = lazy(() => import('./pages/OtDetalle'))
const Stock = lazy(() => import('./pages/Stock'))
const Herramientas = lazy(() => import('./pages/Herramientas'))
const Novedades = lazy(() => import('./pages/Novedades'))
const Combustible = lazy(() => import('./pages/Combustible'))
const Checklists = lazy(() => import('./pages/Checklists'))
const RutinasMantenimiento = lazy(() => import('./pages/RutinasMantenimiento'))
const Bitacora = lazy(() => import('./pages/Bitacora'))
const NotasPedido = lazy(() => import('./pages/NotasPedido'))
const Proveedores = lazy(() => import('./pages/Proveedores'))
const Secuencias = lazy(() => import('./pages/Secuencias'))
const Documentos = lazy(() => import('./pages/Documentos'))
const Reportes = lazy(() => import('./pages/Reportes'))
const Configuracion = lazy(() => import('./pages/Configuracion'))
const Usuarios = lazy(() => import('./pages/Usuarios'))

const TITULOS = {
  unidades: 'Activos',
  componentes: 'Componentes',
  ot: 'Órdenes de Trabajo',
  novedades: 'Novedades',
  combustible: 'Combustible',
  checklists: 'Checklists',
  rutinas: 'Rutinas de Mantenimiento',
  bitacora: 'Bitácora',
  notas_pedido: 'Notas de pedido',
  stock: 'Stock',
  herramientas: 'Herramientas',
  documentos: 'Documentos',
  reportes: 'Reportes',
  proveedores: 'Proveedores',
  secuencias: 'Secuencias',
  configuracion: 'Configuración',
  usuarios: 'Usuarios',
  empresas: 'Panel de Empresas',
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [usuario, setUsuario] = useState(null)
  const [pagina, setPagina] = useState('dashboard')
  const [otSeleccionada, setOtSeleccionada] = useState(null)
  const [activoSeleccionado, setActivoSeleccionado] = useState(null)
  const [filtroSaludInicial, setFiltroSaludInicial] = useState(null)
  const [filtroUnidadInicial, setFiltroUnidadInicial] = useState(null)
  const [filtroUnidadTextoInicial, setFiltroUnidadTextoInicial] = useState(null)
  const [escaneoNonce, setEscaneoNonce] = useState(0)
  const [filtroEstadoInicial, setFiltroEstadoInicial] = useState(null)
  const [tabReportesInicial, setTabReportesInicial] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) getUsuarioActual().then(setUsuario)
    else setUsuario(null)
  }, [session])

  if (session === undefined) return null

  if (!session) return <Login onLogin={() => supabase.auth.getSession().then(({ data: { session } }) => setSession(session))} />

  if (!usuario) return null

  // El técnico no tiene acceso a los demás módulos — si por algún motivo
  // pagina apunta a uno (ej. el estado inicial es 'dashboard'), se corrige
  // acá mismo, sin esperar un efecto, para no llegar a renderizar la página
  // restringida ni por un instante. El super_admin no tiene esta
  // restricción: además del Panel de Empresas, opera normalmente su
  // propia empresa interna (AndesCheck Admin) como cualquier administrador.
  const paginaEfectiva = usuario.rol === 'tecnico' && !PAGINAS_TECNICO.includes(pagina) ? 'ot'
    : usuario.rol === 'chofer' && !PAGINAS_CHOFER.includes(pagina) ? 'bitacora'
    : pagina

  function renderPagina() {
    if (paginaEfectiva === 'empresas') return <PanelEmpresas />
    if (paginaEfectiva === 'dashboard') return <Dashboard abrirOt={abrirOtDesdeNovedad} navegarA={navegarA} />
    if (paginaEfectiva === 'unidades') {
      return activoSeleccionado
        ? <ActivoDetalle idUnidad={activoSeleccionado} usuario={usuario} volver={() => setActivoSeleccionado(null)} abrirOt={abrirOtDesdeNovedad} navegarA={navegarA} />
        : <Unidades usuario={usuario} abrirFicha={setActivoSeleccionado} filtroSaludInicial={filtroSaludInicial} />
    }
    if (paginaEfectiva === 'componentes') return <Componentes usuario={usuario} />
    if (paginaEfectiva === 'stock') return <Stock usuario={usuario} />
    if (paginaEfectiva === 'herramientas') return <Herramientas usuario={usuario} />
  if (paginaEfectiva === 'novedades') return <Novedades usuario={usuario} abrirOt={abrirOtDesdeNovedad} filtroUnidadInicial={filtroUnidadInicial} filtroEstadoInicial={filtroEstadoInicial} />
    if (paginaEfectiva === 'combustible') return <Combustible usuario={usuario} />
    if (paginaEfectiva === 'checklists') return <Checklists key={escaneoNonce} usuario={usuario} unidadInicial={filtroUnidadInicial} />
    if (paginaEfectiva === 'rutinas') return <RutinasMantenimiento usuario={usuario} abrirOt={abrirOtDesdeNovedad} filtroUnidadTextoInicial={filtroUnidadTextoInicial} />
    if (paginaEfectiva === 'bitacora') return <Bitacora usuario={usuario} />
    if (paginaEfectiva === 'notas_pedido') return <NotasPedido usuario={usuario} filtroEstadoInicial={filtroEstadoInicial} />
    if (paginaEfectiva === 'proveedores') return <Proveedores usuario={usuario} />
    if (paginaEfectiva === 'secuencias') return <Secuencias usuario={usuario} />
    if (paginaEfectiva === 'documentos') return <Documentos usuario={usuario} filtroUnidadInicial={filtroUnidadInicial} filtroEstadoInicial={filtroEstadoInicial} />
    if (paginaEfectiva === 'reportes') return <Reportes usuario={usuario} tabInicial={tabReportesInicial} />
    if (paginaEfectiva === 'configuracion') return <Configuracion usuario={usuario} />
    if (paginaEfectiva === 'usuarios') return <Usuarios usuario={usuario} />
    if (paginaEfectiva === 'ot') {
      return otSeleccionada
        ? <OtDetalle idOt={otSeleccionada} usuario={usuario} volver={() => setOtSeleccionada(null)} />
        : <Ot usuario={usuario} abrirDetalle={setOtSeleccionada} filtroUnidadInicial={filtroUnidadInicial} />
    }
    return <Placeholder titulo={TITULOS[paginaEfectiva] ?? paginaEfectiva} />
  }

  function navegarA(p, opciones) {
    setOtSeleccionada(null)
    setActivoSeleccionado(null)
    setFiltroSaludInicial(opciones?.salud ?? null)
    setFiltroUnidadInicial(opciones?.unidad ?? null)
    setFiltroUnidadTextoInicial(opciones?.unidadTexto ?? null)
    setFiltroEstadoInicial(opciones?.estado ?? null)
    setTabReportesInicial(opciones?.tab ?? null)
    // Cada escaneo remonta Checklists aunque ya se esté en esa página.
    if (opciones?.abrirChecklist) setEscaneoNonce(n => n + 1)
    setPagina(p)
  }

  function abrirOtDesdeNovedad(idOt) {
    setOtSeleccionada(idOt)
    setPagina('ot')
  }

  function abrirFichaGlobal(idUnidad) {
    setOtSeleccionada(null)
    setActivoSeleccionado(idUnidad)
    setPagina('unidades')
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      <OfflineBanner />
      <div className="flex flex-1 min-h-0">
        <Sidebar pagina={paginaEfectiva} setPagina={navegarA} usuario={usuario} abrirActivo={abrirFichaGlobal} />
        <div className="flex-1 min-w-0 overflow-y-auto">
          <Suspense fallback={<p className="p-6 text-sm text-gray-400">Cargando…</p>}>
            {renderPagina()}
          </Suspense>
        </div>
      </div>
    </div>
  )
}
