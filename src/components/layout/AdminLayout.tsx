import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronRight,
  Film,
  Gift,
  Images,
  LayoutDashboard,
  CalendarDays,
  Inbox,
  Megaphone,
  Newspaper,
  MoreHorizontal,
  Settings,
  Store,
  Ticket,
  ClipboardList,
  Users,
  ShieldCheck,
  LogOut,
} from 'lucide-react'
import { Sheet } from '../ui'
import { IS_REMOTE, apiBase, store } from '../../data/store'
import { hasAdminToken, adminAuthHeaders, setMe, clearSession, getMe, onSessionChange } from '../../data/adminSession'
import { ROLE_LABEL, type Permission } from '../../data/adminRoles'

// Cada sección declara qué permiso la habilita. `needs: undefined` = la ve cualquiera que
// haya entrado. Esconder acá es SOLO cosmética: quien decide es el backend, que responde 403
// aunque alguien escriba la URL a mano.
interface NavItem {
  to: string
  label: string
  icon: typeof Users
  end?: boolean
  /** Permiso que habilita la sección. Sin esto, la ve cualquiera que haya entrado. */
  needs?: Permission
}

const SECTIONS: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true, needs: 'analytics:read' },
  { to: '/admin/eventos', label: 'Eventos', icon: CalendarDays, needs: 'events:write' },
  { to: '/admin/convocatorias', label: 'Convocatorias', icon: ClipboardList, needs: 'convocatorias:write' },
  { to: '/admin/postulaciones', label: 'Postulaciones', icon: Inbox, needs: 'applications:read' },
  { to: '/admin/personas', label: 'Usuarios', icon: Users, needs: 'people:read' },
  { to: '/admin/galerias', label: 'Galerías y sponsors', icon: Images, needs: 'content:write' },
  { to: '/admin/catalogo', label: 'Expositores', icon: Store, needs: 'catalog:write' },
  { to: '/admin/contenido', label: 'Contenido', icon: Film, needs: 'content:write' },
  { to: '/admin/novedades', label: 'Novedades', icon: Newspaper, needs: 'content:write' },
  { to: '/admin/beneficios', label: 'Beneficios', icon: Gift, needs: 'content:write' },
  { to: '/admin/banners', label: 'Banners', icon: Megaphone, needs: 'content:write' },
  { to: '/admin/ordenes', label: 'Entradas y órdenes', icon: Ticket, needs: 'orders:read' },
  { to: '/admin/equipo', label: 'Equipo y permisos', icon: ShieldCheck, needs: 'team:manage' },
  { to: '/admin/configuracion', label: 'Configuración', icon: Settings },
]

/* Bottom nav app-style (mobile): 2 tabs laterales + "Panel" central sobresaliente
   (FAB) + 1 tab + "Más" (sheet).

   Llevan `needs` igual que SECTIONS y MORE, y se filtran con el mismo criterio: estas pestañas
   son atajos a secciones que YA están en SECTIONS, así que si el rol no llega a la sección
   tampoco tiene que ver el atajo. Sin el filtro, en celular un CONTENT (prensa/marketing) veía
   "Usuarios" —el CRM con datos personales— y al tocarlo se comía el 403 del backend. */
const NAV_LEFT: NavItem[] = [
  { to: '/admin/eventos', label: 'Eventos', icon: CalendarDays, needs: 'events:write' },
  { to: '/admin/personas', label: 'Usuarios', icon: Users, needs: 'people:read' },
]
const NAV_CENTER = { to: '/admin', label: 'Panel', icon: LayoutDashboard, end: true }
const NAV_RIGHT: NavItem[] = [
  { to: '/admin/galerias', label: 'Sponsors', icon: Images, needs: 'content:write' },
]
const MORE: NavItem[] = [
  { to: '/admin/postulaciones', label: 'Postulaciones', icon: Inbox, needs: 'applications:read' },
  { to: '/admin/catalogo', label: 'Expositores', icon: Store, needs: 'catalog:write' },
  { to: '/admin/contenido', label: 'Contenido', icon: Film, needs: 'content:write' },
  { to: '/admin/novedades', label: 'Novedades', icon: Newspaper, needs: 'content:write' },
  { to: '/admin/beneficios', label: 'Beneficios', icon: Gift, needs: 'content:write' },
  { to: '/admin/banners', label: 'Banners', icon: Megaphone, needs: 'content:write' },
  { to: '/admin/ordenes', label: 'Entradas y órdenes', icon: Ticket, needs: 'orders:read' },
  { to: '/admin/equipo', label: 'Equipo y permisos', icon: ShieldCheck, needs: 'team:manage' },
  { to: '/admin/configuracion', label: 'Configuración', icon: Settings },
]

/**
 * Puerta del panel. Valida la sesión contra el SERVIDOR, no contra una marca en el navegador.
 *
 * Antes alcanzaba con `sessionStorage.getItem('ccm:admin') === '1'` para ver el panel entero:
 * cualquiera podía escribir esa marca desde la consola. Los datos igual venían vacíos porque el
 * backend rechazaba sin token, pero la estructura del panel quedaba expuesta. Ahora se le
 * pregunta a /auth/admin/me, que es la única fuente de verdad.
 */
function GateSesion({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<'cargando' | 'adentro' | 'afuera'>('cargando')

  useEffect(() => {
    // Sin backend (demo de GitHub Pages) no hay sesión que validar: el panel se muestra con
    // los datos del seed, como siempre.
    if (!IS_REMOTE) {
      setEstado('adentro')
      return
    }
    if (!hasAdminToken()) {
      setEstado('afuera')
      return
    }
    let vigente = true
    fetch(`${apiBase}/api/v1/auth/admin/me`, { headers: adminAuthHeaders() })
      .then(async (r) => {
        if (!vigente) return
        if (r.ok) {
          const d = await r.json()
          setMe(d.user)
          setEstado('adentro')
          // Con la sesión confirmada, traer las vistas admin (borradores, ocultos, códigos).
          store.refetchAdminScoped()
          return
        }
        // 401/403 = la sesión NO sirve (venció o fue revocada): al login.
        // Cualquier otro código o un fallo de red NO son motivo para echar a nadie — el token
        // puede estar perfecto y ser el backend el que está caído. En ese caso dejamos entrar
        // con lo que haya en caché en vez de mandar a un login que tampoco va a andar.
        if (r.status === 401 || r.status === 403) {
          clearSession()
          setEstado('afuera')
        } else {
          setEstado('adentro')
        }
      })
      .catch(() => {
        // Error de RED (backend caído, sin conexión). No es una sesión inválida: no echamos.
        if (vigente) setEstado('adentro')
      })
    // Si la sesión se pierde mientras se usa el panel (un 401 en cualquier acción llama a
    // clearSession), reaccionar: sin token → al login en el próximo render.
    const off = onSessionChange(() => {
      if (vigente && IS_REMOTE && !hasAdminToken()) setEstado('afuera')
    })
    return () => {
      vigente = false
      off()
    }
  }, [])

  if (estado === 'cargando') {
    return (
      <div className="grid min-h-dvh place-items-center bg-night text-night-ink/50">
        <p className="text-sm">Verificando tu sesión…</p>
      </div>
    )
  }
  if (estado === 'afuera') return <Navigate to="/admin/login" replace />
  return <>{children}</>
}

/**
 * Quién está usando el panel, y cómo salir.
 *
 * Cerrar sesión avisa al servidor para que borre la fila —eso es lo que revoca el token de
 * verdad— y recién después limpia lo local. Si el aviso falla (sin red), se limpia igual:
 * peor sería dejar a la persona adentro creyendo que salió.
 */
function QuienSoy() {
  const navigate = useNavigate()
  const [yo, setYo] = useState(getMe)
  const [saliendo, setSaliendo] = useState(false)

  // El estado vive en memoria del módulo: hay que re-leerlo cuando el gate lo puebla.
  useEffect(() => onSessionChange(() => setYo(getMe())), [])

  if (!IS_REMOTE || !yo) return null

  async function salir() {
    setSaliendo(true)
    try {
      await fetch(`${apiBase}/api/v1/auth/admin/logout`, { method: 'POST', headers: adminAuthHeaders() })
    } catch {
      /* sin red: se limpia igual, la sesión vence sola en el server */
    }
    clearSession()
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="space-y-2">
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium text-night-ink/80">{yo.name || yo.email}</p>
        <p className="truncate text-[10px] text-night-ink/40">{ROLE_LABEL[yo.role]}</p>
      </div>
      <button
        onClick={salir}
        disabled={saliendo}
        className="eyebrow flex items-center gap-2 text-[9px] text-night-ink/45 transition-colors hover:text-night-ink disabled:opacity-50"
      >
        <LogOut size={11} /> {saliendo ? 'Saliendo…' : 'Cerrar sesión'}
      </button>
    </div>
  )
}

/** Pestaña plana (lateral) de la bottom nav. */
function FlatTab({ item }: { item: { to: string; label: string; icon: typeof Users; end?: boolean } }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className="flex flex-col items-center gap-1 pb-1.5 pt-3 transition-transform active:scale-90"
    >
      {({ isActive }) => (
        <>
          <Icon size={19} strokeWidth={1.75} className={isActive ? 'text-accent' : 'text-night-ink/55'} />
          <span
            className={`text-[9px] font-semibold uppercase tracking-[0.1em] ${
              isActive ? 'text-accent' : 'text-night-ink/55'
            }`}
          >
            {item.label}
          </span>
        </>
      )}
    </NavLink>
  )
}

/**
 * Barra de navegación inferior (app-style) — solo mobile, identidad night.
 * "Panel" va al centro como pestaña circular elevada que sobresale por encima
 * de la barra (FAB), para un look moderno (no una barra plana).
 */
function AdminBottomNav({
  moreActive,
  onMore,
  visible,
}: {
  moreActive: boolean
  onMore: () => void
  visible: (i: NavItem) => boolean
}) {
  const CenterIcon = NAV_CENTER.icon

  // Las pestañas laterales visibles, en orden, contando "Más" como una más: el FAB se mete
  // JUSTO AL MEDIO de esta lista, en vez de tener dos grupos fijos a los costados.
  //
  // Con los grupos fijos y `grid-cols-5` hardcodeado, filtrar por permisos rompía el centrado:
  // a un CONTENT (que no ve ni Eventos ni Usuarios) le quedaban 3 columnas y el FAB caía en la
  // primera, pegado al borde izquierdo. Repartiendo alrededor del medio, el FAB queda centrado
  // para cualquier combinación de permisos, y para OWNER/EDITOR da exactamente el mismo layout
  // de siempre: Eventos · Usuarios | FAB | Sponsors · Más.
  const laterales: Array<NavItem | 'mas'> = [...NAV_LEFT.filter(visible), ...NAV_RIGHT.filter(visible), 'mas']
  const corte = Math.ceil(laterales.length / 2)

  const pintarLateral = (item: NavItem | 'mas') =>
    item === 'mas' ? (
      <button
        key="mas"
        onClick={onMore}
        aria-label="Más secciones"
        className="flex flex-col items-center gap-1 pb-1.5 pt-3 transition-transform active:scale-90"
      >
        <MoreHorizontal size={19} strokeWidth={1.75} className={moreActive ? 'text-accent' : 'text-night-ink/55'} />
        <span
          className={`text-[9px] font-semibold uppercase tracking-[0.1em] ${
            moreActive ? 'text-accent' : 'text-night-ink/55'
          }`}
        >
          Más
        </span>
      </button>
    ) : (
      <FlatTab key={item.to} item={item} />
    )

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 md:hidden">
      <div className="border-t border-night-soft bg-night/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        <div
          className="grid items-end"
          style={{ gridTemplateColumns: `repeat(${laterales.length + 1}, minmax(0, 1fr))` }}
        >
          {laterales.slice(0, corte).map(pintarLateral)}

          {/* Pestaña central circular sobresaliente (FAB) */}
          <NavLink to={NAV_CENTER.to} end={NAV_CENTER.end} className="relative flex flex-col items-center pb-1.5">
            {({ isActive }) => (
              <>
                <span
                  className={`-mt-7 flex h-14 w-14 items-center justify-center rounded-full shadow-lg ring-4 ring-night transition-all duration-200 active:scale-95 ${
                    isActive ? 'bg-accent text-accent-ink' : 'bg-night-soft text-night-ink'
                  }`}
                >
                  <CenterIcon size={23} strokeWidth={1.75} />
                </span>
                <span
                  className={`mt-1 text-[9px] font-semibold uppercase tracking-[0.1em] ${
                    isActive ? 'text-accent' : 'text-night-ink/55'
                  }`}
                >
                  {NAV_CENTER.label}
                </span>
              </>
            )}
          </NavLink>

          {laterales.slice(corte).map(pintarLateral)}
        </div>
      </div>
    </nav>
  )
}

export default function AdminLayout() {
  const [moreOpen, setMoreOpen] = useState(false)
  const { pathname } = useLocation()

  // Suscribirse a la sesión con useSyncExternalStore: el GateSesion puebla `me` DESPUÉS de que
  // este componente ya renderizó, así que leerlo una sola vez dejaba el menú con todas las
  // secciones hasta navegar. Así se recomputa apenas la sesión se resuelve.
  const me = useSyncExternalStore(onSessionChange, getMe)
  // Sin sesión cargada (modo demo sin backend) se muestran todas: ahí no hay roles.
  const permisos = me?.permissions
  const visible = (i: NavItem) => !permisos || !i.needs || permisos.includes(i.needs)
  const secciones = SECTIONS.filter(visible)
  const masOpciones = MORE.filter(visible)

  const active =
    SECTIONS.find((s) => s.to === pathname) ??
    SECTIONS.find((s) => !s.end && pathname.startsWith(`${s.to}/`)) ??
    SECTIONS[0]
  const moreActive = masOpciones.some((m) => pathname === m.to || pathname.startsWith(`${m.to}/`))

  return (
    <GateSesion>
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Sidebar desktop */}
      <aside className="hidden w-60 shrink-0 flex-col bg-night text-night-ink md:flex">
        <div className="sticky top-0 flex h-dvh flex-col p-5">
          <Link to="/admin" className="flex items-baseline gap-2">
            <span className="type-display text-2xl">CCM</span>
            <span className="eyebrow text-[8px] text-accent">Admin</span>
          </Link>
          <nav className="mt-8 flex-1 space-y-0.5">
            {secciones.map((s) => {
              const Icon = s.icon
              return (
                <NavLink
                  key={s.to}
                  to={s.to}
                  end={s.end}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-sm px-3 py-2.5 text-[13px] transition-colors ${
                      isActive
                        ? 'bg-night-soft text-night-ink'
                        : 'text-night-ink/55 hover:bg-night-soft/50 hover:text-night-ink'
                    }`
                  }
                >
                  <Icon size={15} strokeWidth={1.75} />
                  {s.label}
                </NavLink>
              )
            })}
          </nav>
          <div className="space-y-3 border-t border-night-soft pt-4">
            <QuienSoy />
            <Link
              to="/"
              className="eyebrow flex items-center gap-2 text-[9px] text-night-ink/45 transition-colors hover:text-night-ink"
            >
              <ArrowLeft size={11} /> Ver la app
            </Link>
            <p className="text-[10px] leading-relaxed text-night-ink/35">
              {IS_REMOTE
                ? 'Conectado al sistema · lo que cargás se guarda en la nube'
                : 'Demo local · sin backend, los datos viven en este dispositivo'}
            </p>
          </div>
        </div>
      </aside>

      {/* Header compacto mobile (app): logo + sección actual */}
      <header className="sticky top-0 z-40 border-b border-night-soft bg-night/95 text-night-ink backdrop-blur-md md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link to="/admin" className="flex items-baseline gap-2">
            <span className="type-display text-xl">CCM</span>
            <span className="eyebrow text-[8px] text-accent">Admin</span>
          </Link>
          <span className="eyebrow text-[10px] text-night-ink/70">{active.label}</span>
        </div>
      </header>

      <main className="min-w-0 flex-1 bg-bg pb-24 md:pb-0">
        {/* Transición de página (app-feel): remonta con un fade+rise corto */}
        <div key={pathname} className="animate-page">
          <Outlet />
        </div>
      </main>

      <AdminBottomNav moreActive={moreActive} onMore={() => setMoreOpen(true)} visible={visible} />

      {/* Sheet "Más": secciones secundarias + volver a la app */}
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Más secciones">
        <div className="space-y-1">
          {masOpciones.map((m) => {
            const Icon = m.icon
            return (
              <Link
                key={m.to}
                to={m.to}
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 rounded-md px-2 py-3 transition-colors hover:bg-ink/5 active:scale-[0.99]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-bg text-accent">
                  <Icon size={17} strokeWidth={1.75} />
                </span>
                <span className="flex-1 text-[15px] text-ink">{m.label}</span>
                <ChevronRight size={16} className="shrink-0 text-ink-soft/60" />
              </Link>
            )
          })}
        </div>
        <Link
          to="/"
          onClick={() => setMoreOpen(false)}
          className="mt-4 flex items-center justify-center gap-2 border-t border-line pt-4 text-[13px] text-ink-soft transition-colors hover:text-ink"
        >
          <ArrowUpRight size={14} /> Ver la app pública
        </Link>
      </Sheet>
    </div>
    </GateSesion>
  )
}
