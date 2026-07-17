import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { getUsuarioActual } from './lib/auth'
import Login from './pages/Login'
import Sidebar, { PAGINAS_TECNICO } from './components/Sidebar'
import PanelEmpresas from './pages/PanelEmpresas'
import Dashboard from './pages/Dashboard'
import Unidades from './pages/Unidades'
import ActivoDetalle from './pages/ActivoDetalle'
import Componentes from './pages/Componentes'
import Ot from './pages/Ot'
import OtDetalle from './pages/OtDetalle'
import Stock from './pages/Stock'
import Herramientas from './pages/Herramientas'
import Novedades from './pages/Novedades'
import RutinasMantenimiento from './pages/RutinasMantenimiento'
import Proveedores from './pages/Proveedores'
import Secuencias from './pages/Secuencias'
import Documentos from './pages/Documentos'
import Reportes from './pages/Reportes'
import Configuracion from './pages/Configuracion'
import Usuarios from './pages/Usuarios'
import Placeholder from './pages/Placeholder'
import OfflineBanner from './components/OfflineBanner'

const TITULOS = {
  unidades: 'Activos',
  componentes: 'Componentes',
  ot: 'Órdenes de Trabajo',
  novedades: 'Novedades',
  rutinas: 'Rutinas de Mantenimiento',
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
  const paginaEfectiva = usuario.rol === 'tecnico' && !PAGINAS_TECNICO.includes(pagina) ? 'ot' : pagina

  function renderPagina() {
    if (paginaEfectiva === 'empresas') return <PanelEmpresas />
    if (paginaEfectiva === 'dashboard') return <Dashboard abrirOt={abrirOtDesdeNovedad} navegarA={navegarA} />
    if (paginaEfectiva === 'unidades') {
      return activoSeleccionado
        ? <ActivoDetalle idUnidad={activoSeleccionado} usuario={usuario} volver={() => setActivoSeleccionado(null)} abrirOt={abrirOtDesdeNovedad} />
        : <Unidades usuario={usuario} abrirFicha={setActivoSeleccionado} filtroSaludInicial={filtroSaludInicial} />
    }
    if (paginaEfectiva === 'componentes') return <Componentes usuario={usuario} />
    if (paginaEfectiva === 'stock') return <Stock usuario={usuario} />
    if (paginaEfectiva === 'herramientas') return <Herramientas usuario={usuario} />
  if (paginaEfectiva === 'novedades') return <Novedades usuario={usuario} abrirOt={abrirOtDesdeNovedad} />
    if (paginaEfectiva === 'rutinas') return <RutinasMantenimiento usuario={usuario} abrirOt={abrirOtDesdeNovedad} />
    if (paginaEfectiva === 'proveedores') return <Proveedores usuario={usuario} />
    if (paginaEfectiva === 'secuencias') return <Secuencias usuario={usuario} />
    if (paginaEfectiva === 'documentos') return <Documentos usuario={usuario} />
    if (paginaEfectiva === 'reportes') return <Reportes />
    if (paginaEfectiva === 'configuracion') return <Configuracion usuario={usuario} />
    if (paginaEfectiva === 'usuarios') return <Usuarios usuario={usuario} />
    if (paginaEfectiva === 'ot') {
      return otSeleccionada
        ? <OtDetalle idOt={otSeleccionada} usuario={usuario} volver={() => setOtSeleccionada(null)} />
        : <Ot usuario={usuario} abrirDetalle={setOtSeleccionada} />
    }
    return <Placeholder titulo={TITULOS[paginaEfectiva] ?? paginaEfectiva} />
  }

  function navegarA(p, opciones) {
    setOtSeleccionada(null)
    setActivoSeleccionado(null)
    setFiltroSaludInicial(opciones?.salud ?? null)
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
          {renderPagina()}
        </div>
      </div>
    </div>
  )
}
