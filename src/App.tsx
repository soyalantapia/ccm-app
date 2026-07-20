import { Suspense, useEffect, type ReactNode } from 'react'
import {
  Navigate,
  Outlet,
  RouterProvider,
  createBrowserRouter,
  useLocation,
} from 'react-router-dom'
import SiteLayout from './components/layout/SiteLayout'
import AdminLayout from './components/layout/AdminLayout'
import AdminLogin from './pages/admin/AdminLogin'
import { ScrollManager } from './components/layout/ScrollManager'
import { UpdatePrompt } from './components/layout/UpdatePrompt'
import { RouteError } from './components/layout/RouteError'
import { ProfileSheetProvider } from './components/profile/ProfileSheetProvider'
import { InstallBanner } from './components/layout/InstallBanner'
import { AdminPending, PagePending, ToastHost } from './components/ui'
import { lazyWithReload } from './lib/lazyWithReload'
import { store } from './data/store'
import NotFound from './pages/NotFound'

// Landing is the entry route: imported eagerly so the first paint skips a
// lazy-chunk round trip (mobile LCP). Everything else stays code-split.
import Landing from './pages/Landing'
const Entradas = lazyWithReload(() => import('./pages/Entradas'))
const Eventos = lazyWithReload(() => import('./pages/Eventos'))
const EventoFicha = lazyWithReload(() => import('./pages/EventoFicha'))
const Catalogo = lazyWithReload(() => import('./pages/Catalogo'))
const CatalogoPerfil = lazyWithReload(() => import('./pages/CatalogoPerfil'))
const Fotos = lazyWithReload(() => import('./pages/Fotos'))
const FotosGaleria = lazyWithReload(() => import('./pages/FotosGaleria'))
const Contenido = lazyWithReload(() => import('./pages/Contenido'))
const Convocatoria = lazyWithReload(() => import('./pages/Convocatoria'))
const Sponsors = lazyWithReload(() => import('./pages/Sponsors'))
const Publicidad = lazyWithReload(() => import('./pages/Publicidad'))
const Membresia = lazyWithReload(() => import('./pages/Membresia'))
const Beneficios = lazyWithReload(() => import('./pages/Beneficios'))
const Notas = lazyWithReload(() => import('./pages/Notas'))
const NotaDetalle = lazyWithReload(() => import('./pages/NotaDetalle'))
const Stand = lazyWithReload(() => import('./pages/Stand'))
const Legales = lazyWithReload(() => import('./pages/Legales'))
const Inicio = lazyWithReload(() => import('./pages/app/Inicio'))
const MiQR = lazyWithReload(() => import('./pages/app/MiQR'))
const Dashboard = lazyWithReload(() => import('./pages/admin/Dashboard'))
const AdminEventos = lazyWithReload(() => import('./pages/admin/AdminEventos'))
const AdminEventoDetalle = lazyWithReload(() => import('./pages/admin/AdminEventoDetalle'))
const AdminPostulaciones = lazyWithReload(() => import('./pages/admin/AdminPostulaciones'))
const AdminConvocatorias = lazyWithReload(() => import('./pages/admin/AdminConvocatorias'))
const AdminPersonas = lazyWithReload(() => import('./pages/admin/AdminPersonas'))
const AdminGalerias = lazyWithReload(() => import('./pages/admin/AdminGalerias'))
const AdminCatalogo = lazyWithReload(() => import('./pages/admin/AdminCatalogo'))
const AdminContenido = lazyWithReload(() => import('./pages/admin/AdminContenido'))
const AdminBeneficios = lazyWithReload(() => import('./pages/admin/AdminBeneficios'))
const AdminBanners = lazyWithReload(() => import('./pages/admin/AdminBanners'))
const AdminNotas = lazyWithReload(() => import('./pages/admin/AdminNotas'))
const AdminOrdenes = lazyWithReload(() => import('./pages/admin/AdminOrdenes'))
const AdminConfiguracion = lazyWithReload(() => import('./pages/admin/AdminConfiguracion'))
const AdminEquipo = lazyWithReload(() => import('./pages/admin/AdminEquipo'))

/** Suspense de página pública/app: skeleton con forma de página. */
function S({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PagePending />}>{children}</Suspense>
}

/** Suspense del panel admin: skeleton con KPIs + filas. */
function SA({ children }: { children: ReactNode }) {
  return <Suspense fallback={<AdminPending />}>{children}</Suspense>
}

function Root() {
  const location = useLocation()
  useEffect(() => {
    store.track('page_view', { path: location.pathname })
  }, [location.pathname])

  return (
    <ProfileSheetProvider>
      <ScrollManager />
      <Outlet />
      <ToastHost />
      <InstallBanner />
      <UpdatePrompt />
    </ProfileSheetProvider>
  )
}

const router = createBrowserRouter(
  [
    {
      element: <Root />,
      // Atrapa fallos de carga de chunk tras un deploy y errores de render,
      // mostrando una recuperación de un toque en vez del overlay crudo.
      errorElement: <RouteError />,
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
            { path: '/publicidad', element: <S><Publicidad /></S> },
            { path: '/membresia', element: <S><Membresia /></S> },
            { path: '/beneficios', element: <S><Beneficios /></S> },
            { path: '/novedades', element: <S><Notas /></S> },
            { path: '/novedades/:slug', element: <S><NotaDetalle /></S> },
            { path: '/stand', element: <S><Stand /></S> },
            { path: '/stand/:slug', element: <S><Stand /></S> },
            { path: '/terminos', element: <S><Legales kind="terminos" /></S> },
            { path: '/privacidad', element: <S><Legales kind="privacidad" /></S> },
            { path: '/app', element: <S><Inicio /></S> },
            { path: '/mi-qr', element: <S><MiQR /></S> },
            // El viejo Perfil vive dentro del hub Mi QR — los links existentes siguen andando
            { path: '/perfil', element: <Navigate to="/mi-qr" replace /> },
            { path: '*', element: <NotFound /> },
          ],
        },
        {
          // Fuera del layout a propósito: adentro, el gate taparía el propio login.
          path: '/admin/login',
          element: <AdminLogin />,
        },
        {
          path: '/admin',
          element: <AdminLayout />,
          children: [
            { index: true, element: <SA><Dashboard /></SA> },
            { path: 'eventos', element: <SA><AdminEventos /></SA> },
            { path: 'eventos/:id', element: <SA><AdminEventoDetalle /></SA> },
            { path: 'postulaciones', element: <SA><AdminPostulaciones /></SA> },
            { path: 'convocatorias', element: <SA><AdminConvocatorias /></SA> },
            { path: 'personas', element: <SA><AdminPersonas /></SA> },
            { path: 'galerias', element: <SA><AdminGalerias /></SA> },
            { path: 'catalogo', element: <SA><AdminCatalogo /></SA> },
            { path: 'contenido', element: <SA><AdminContenido /></SA> },
            { path: 'beneficios', element: <SA><AdminBeneficios /></SA> },
            { path: 'banners', element: <SA><AdminBanners /></SA> },
            { path: 'novedades', element: <SA><AdminNotas /></SA> },
            { path: 'ordenes', element: <SA><AdminOrdenes /></SA> },
            { path: 'equipo', element: <SA><AdminEquipo /></SA> },
            { path: 'configuracion', element: <SA><AdminConfiguracion /></SA> },
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
