import { Suspense, lazy, useEffect, type ReactNode } from 'react'
import {
  Outlet,
  RouterProvider,
  createBrowserRouter,
  useLocation,
} from 'react-router-dom'
import SiteLayout from './components/layout/SiteLayout'
import AdminLayout from './components/layout/AdminLayout'
import { ScrollManager } from './components/layout/ScrollManager'
import { UpdatePrompt } from './components/layout/UpdatePrompt'
import { ProfileSheetProvider } from './components/profile/ProfileSheetProvider'
import { ToastHost } from './components/ui'
import { track } from './lib/track'
import NotFound from './pages/NotFound'

// Landing is the entry route: imported eagerly so the first paint skips a
// lazy-chunk round trip (mobile LCP). Everything else stays code-split.
import Landing from './pages/Landing'
const Entradas = lazy(() => import('./pages/Entradas'))
const Eventos = lazy(() => import('./pages/Eventos'))
const EventoFicha = lazy(() => import('./pages/EventoFicha'))
const Catalogo = lazy(() => import('./pages/Catalogo'))
const CatalogoPerfil = lazy(() => import('./pages/CatalogoPerfil'))
const Fotos = lazy(() => import('./pages/Fotos'))
const FotosGaleria = lazy(() => import('./pages/FotosGaleria'))
const Contenido = lazy(() => import('./pages/Contenido'))
const Convocatoria = lazy(() => import('./pages/Convocatoria'))
const Sponsors = lazy(() => import('./pages/Sponsors'))
const Legales = lazy(() => import('./pages/Legales'))
const Inicio = lazy(() => import('./pages/app/Inicio'))
const MiQR = lazy(() => import('./pages/app/MiQR'))
const Perfil = lazy(() => import('./pages/app/Perfil'))
const Dashboard = lazy(() => import('./pages/admin/Dashboard'))
const AdminEventos = lazy(() => import('./pages/admin/AdminEventos'))
const AdminEventoDetalle = lazy(() => import('./pages/admin/AdminEventoDetalle'))
const AdminPostulaciones = lazy(() => import('./pages/admin/AdminPostulaciones'))
const AdminPersonas = lazy(() => import('./pages/admin/AdminPersonas'))
const AdminGalerias = lazy(() => import('./pages/admin/AdminGalerias'))
const AdminOrdenes = lazy(() => import('./pages/admin/AdminOrdenes'))
const AdminConfiguracion = lazy(() => import('./pages/admin/AdminConfiguracion'))

function PageLoader() {
  return (
    <div className="flex min-h-[55vh] items-center justify-center">
      <span className="type-display animate-pulse text-3xl text-ink-soft/30">CCM</span>
    </div>
  )
}

function S({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

function Root() {
  const location = useLocation()
  useEffect(() => {
    track('page_view', { path: location.pathname })
  }, [location.pathname])

  return (
    <ProfileSheetProvider>
      <ScrollManager />
      <Outlet />
      <ToastHost />
      <UpdatePrompt />
    </ProfileSheetProvider>
  )
}

const router = createBrowserRouter(
  [
    {
      element: <Root />,
      children: [
        {
          element: <SiteLayout />,
          children: [
            { path: '/', element: <Landing /> },
            { path: '/entradas', element: <S><Entradas /></S> },
            { path: '/eventos', element: <S><Eventos /></S> },
            { path: '/eventos/:slug', element: <S><EventoFicha /></S> },
            { path: '/catalogo', element: <S><Catalogo /></S> },
            { path: '/p/:slug', element: <S><CatalogoPerfil /></S> },
            { path: '/fotos', element: <S><Fotos /></S> },
            { path: '/fotos/:slug', element: <S><FotosGaleria /></S> },
            { path: '/contenido', element: <S><Contenido /></S> },
            { path: '/c/:slug', element: <S><Convocatoria /></S> },
            { path: '/sponsors', element: <S><Sponsors /></S> },
            { path: '/terminos', element: <S><Legales kind="terminos" /></S> },
            { path: '/privacidad', element: <S><Legales kind="privacidad" /></S> },
            { path: '/app', element: <S><Inicio /></S> },
            { path: '/mi-qr', element: <S><MiQR /></S> },
            { path: '/perfil', element: <S><Perfil /></S> },
            { path: '*', element: <NotFound /> },
          ],
        },
        {
          path: '/admin',
          element: <AdminLayout />,
          children: [
            { index: true, element: <S><Dashboard /></S> },
            { path: 'eventos', element: <S><AdminEventos /></S> },
            { path: 'eventos/:id', element: <S><AdminEventoDetalle /></S> },
            { path: 'postulaciones', element: <S><AdminPostulaciones /></S> },
            { path: 'personas', element: <S><AdminPersonas /></S> },
            { path: 'galerias', element: <S><AdminGalerias /></S> },
            { path: 'ordenes', element: <S><AdminOrdenes /></S> },
            { path: 'configuracion', element: <S><AdminConfiguracion /></S> },
          ],
        },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') },
)

export default function App() {
  return <RouterProvider router={router} />
}
