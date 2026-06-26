import { useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
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
  Users,
} from 'lucide-react'
import { Button, Field, Input, Sheet } from '../ui'
import { store } from '../../data/store'

const SECTIONS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/eventos', label: 'Eventos', icon: CalendarDays },
  { to: '/admin/postulaciones', label: 'Postulaciones', icon: Inbox },
  { to: '/admin/personas', label: 'Personas', icon: Users },
  { to: '/admin/galerias', label: 'Galerías y sponsors', icon: Images },
  { to: '/admin/catalogo', label: 'Expositores', icon: Store },
  { to: '/admin/contenido', label: 'Contenido', icon: Film },
  { to: '/admin/novedades', label: 'Novedades', icon: Newspaper },
  { to: '/admin/beneficios', label: 'Beneficios', icon: Gift },
  { to: '/admin/banners', label: 'Banners', icon: Megaphone },
  { to: '/admin/ordenes', label: 'Entradas y órdenes', icon: Ticket },
  { to: '/admin/configuracion', label: 'Configuración', icon: Settings },
]

/* Bottom nav app-style (mobile): 2 tabs laterales + "Panel" central sobresaliente
   (FAB) + 1 tab + "Más" (sheet). */
const NAV_LEFT = [
  { to: '/admin/eventos', label: 'Eventos', icon: CalendarDays },
  { to: '/admin/personas', label: 'Personas', icon: Users },
]
const NAV_CENTER = { to: '/admin', label: 'Panel', icon: LayoutDashboard, end: true }
const NAV_RIGHT = [{ to: '/admin/galerias', label: 'Sponsors', icon: Images }]
const MORE = [
  { to: '/admin/postulaciones', label: 'Postulaciones', icon: Inbox },
  { to: '/admin/catalogo', label: 'Expositores', icon: Store },
  { to: '/admin/contenido', label: 'Contenido', icon: Film },
  { to: '/admin/novedades', label: 'Novedades', icon: Newspaper },
  { to: '/admin/beneficios', label: 'Beneficios', icon: Gift },
  { to: '/admin/banners', label: 'Banners', icon: Megaphone },
  { to: '/admin/ordenes', label: 'Entradas y órdenes', icon: Ticket },
  { to: '/admin/configuracion', label: 'Configuración', icon: Settings },
]

function AdminGate({ onUnlock }: { onUnlock: () => void }) {
  const [key, setKey] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    // Demo (sin backend): cualquier clave habilita el panel. Con backend (Fase G), la
    // clave ES el ADMIN_TOKEN: se guarda y viaja como Bearer en las escrituras /admin/*.
    sessionStorage.setItem('ccm:admin', '1')
    sessionStorage.setItem('ccm:admin-token', key)
    // Ahora que hay token, re-traer notas/banners/beneficios con vista admin (borradores/ocultos/códigos).
    store.refetchAdminScoped()
    onUnlock()
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-night px-6">
      <div className="w-full max-w-sm animate-rise">
        <div className="text-center">
          <div className="type-display text-5xl text-night-ink">CCM</div>
          <p className="eyebrow mt-3 text-[9px] text-night-ink/50">Panel de administración</p>
        </div>
        <form
          onSubmit={submit}
          className="mt-8 space-y-4 rounded-lg border border-night-soft bg-night-soft/40 p-6"
        >
          <Field label="Clave de acceso">
            <Input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Cualquier clave entra (demo)"
              autoFocus
              className="border-night-soft bg-night text-night-ink placeholder:text-night-ink/30"
            />
          </Field>
          <Button type="submit" className="w-full">
            Ingresar
          </Button>
          <p className="text-center text-[11px] leading-relaxed text-night-ink/40">
            Demo: cualquier clave habilita el panel. En Fase 1 se reemplaza por usuarios con email,
            contraseña y roles por sección.
          </p>
        </form>
        <Link
          to="/"
          className="eyebrow mt-6 flex items-center justify-center gap-2 text-[9px] text-night-ink/40 transition-colors hover:text-night-ink"
        >
          <ArrowLeft size={12} /> Volver a la app
        </Link>
      </div>
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
function AdminBottomNav({ moreActive, onMore }: { moreActive: boolean; onMore: () => void }) {
  const CenterIcon = NAV_CENTER.icon
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 md:hidden">
      <div className="border-t border-night-soft bg-night/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        <div className="grid grid-cols-5 items-end">
          {NAV_LEFT.map((item) => (
            <FlatTab key={item.to} item={item} />
          ))}

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

          {NAV_RIGHT.map((item) => (
            <FlatTab key={item.to} item={item} />
          ))}

          <button
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
        </div>
      </div>
    </nav>
  )
}

export default function AdminLayout() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('ccm:admin') === '1')
  const [moreOpen, setMoreOpen] = useState(false)
  const { pathname } = useLocation()

  const active =
    SECTIONS.find((s) => s.to === pathname) ??
    SECTIONS.find((s) => !s.end && pathname.startsWith(`${s.to}/`)) ??
    SECTIONS[0]
  const moreActive = MORE.some((m) => pathname === m.to || pathname.startsWith(`${m.to}/`))

  if (!unlocked) return <AdminGate onUnlock={() => setUnlocked(true)} />

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Sidebar desktop */}
      <aside className="hidden w-60 shrink-0 flex-col bg-night text-night-ink md:flex">
        <div className="sticky top-0 flex h-dvh flex-col p-5">
          <Link to="/admin" className="flex items-baseline gap-2">
            <span className="type-display text-2xl">CCM</span>
            <span className="eyebrow text-[8px] text-accent">Admin</span>
          </Link>
          <nav className="mt-8 flex-1 space-y-0.5">
            {SECTIONS.map((s) => {
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
            <Link
              to="/"
              className="eyebrow flex items-center gap-2 text-[9px] text-night-ink/45 transition-colors hover:text-night-ink"
            >
              <ArrowLeft size={11} /> Ver la app
            </Link>
            <p className="text-[10px] leading-relaxed text-night-ink/35">
              Demo local · la sincronización en la nube llega en Fase 1
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

      <AdminBottomNav moreActive={moreActive} onMore={() => setMoreOpen(true)} />

      {/* Sheet "Más": secciones secundarias + volver a la app */}
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Más secciones">
        <div className="space-y-1">
          {MORE.map((m) => {
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
  )
}
