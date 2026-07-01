import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays, Heart, Home, Menu, Play, QrCode, Store, Ticket, X } from 'lucide-react'
import { Button } from '../ui'
import { registerFree } from '../../lib/actions'
import { useStore } from '../../data/store'
import { IDS } from '../../data/ids'
import { config } from '../../config'

// Foco (tesis Gastón: simple, de nicho): la app SON las 5 pestañas. PRIMARY =
// las que compiten por atención (top-nav en desktop; bottom-nav en mobile). El
// resto no infla el nav: las secundarias viven en el drawer, y el B2B (sponsors/
// publicidad/stand) en el footer.
const PRIMARY = [
  { to: '/app', label: 'Noticias' },
  { to: '/eventos', label: 'Eventos' },
  { to: '/catalogo', label: 'Participantes' },
  { to: '/contenido', label: 'Elukamo' },
]

const SECONDARY = [
  { to: '/entradas', label: 'Entradas' },
  { to: '/membresia', label: 'Membresías' },
  { to: '/beneficios', label: 'Beneficios' },
  { to: '/fotos', label: 'Fotos' },
  { to: '/perfil', label: 'Mi perfil' },
]

// Menú completo del drawer: 5 pestañas + secundarias (sin duplicar B2B/legal).
const DRAWER = [
  { to: '/app', label: 'Noticias' },
  { to: '/eventos', label: 'Eventos' },
  { to: '/mi-qr', label: 'Mi QR' },
  { to: '/catalogo', label: 'Participantes' },
  { to: '/contenido', label: 'Elukamo' },
  ...SECONDARY,
]

// Bottom-nav mobile de 5 slots (mockups): Noticias · Eventos · Mi QR (centro
// elevado) · Participantes · Elukamo. Perfil y demás secundarias → drawer (SECONDARY).
const BOTTOM_NAV = [
  { to: '/app', label: 'Noticias', icon: Home },
  { to: '/eventos', label: 'Eventos', icon: CalendarDays },
  { to: '/mi-qr', label: 'Mi QR', icon: QrCode, center: true },
  { to: '/catalogo', label: 'Participantes', icon: Store },
  { to: '/contenido', label: 'Elukamo', icon: Play },
]

function Wordmark({ tone = 'ink' }: { tone?: 'ink' | 'night' }) {
  return (
    <Link to="/" className="group flex items-center gap-2">
      <span className={`type-display text-[26px] leading-none ${tone === 'night' ? 'text-night-ink' : 'text-ink'}`}>
        CCM
      </span>
      {/* El corazón de "Corazón de Moda" — monograma de marca */}
      <Heart
        aria-hidden
        size={11}
        strokeWidth={0}
        className="shrink-0 fill-accent transition-transform duration-200 group-hover:scale-125"
      />
      <span
        className={`eyebrow hidden text-[9px] sm:block ${
          tone === 'night' ? 'text-night-ink/60' : 'text-ink-soft'
        }`}
      >
        Córdoba Corazón de Moda
      </span>
    </Link>
  )
}

function Header() {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const registered = useStore((s) => s.isRegistered(IDS.events.principal))
  const location = useLocation()

  useEffect(() => setMenuOpen(false), [location.pathname])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Wordmark />
          <nav className="hidden items-center gap-7 lg:flex">
            {PRIMARY.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `eyebrow text-[10px] transition-colors ${
                    isActive ? 'text-ink' : 'text-ink-soft hover:text-ink'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2.5">
            <Button size="sm" onClick={() => void registerFree(navigate)}>
              {registered ? 'Mi QR' : 'Registrate'}
            </Button>
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Abrir menú"
              className="rounded-sm p-2 text-ink transition-colors hover:bg-ink/5"
            >
              <Menu size={20} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-night text-night-ink animate-fade">
          <div className="flex h-16 items-center justify-between px-5">
            <Wordmark tone="night" />
            <button
              onClick={() => setMenuOpen(false)}
              aria-label="Cerrar menú"
              className="rounded-sm p-2 text-night-ink transition-colors hover:bg-night-ink/10"
            >
              <X size={22} strokeWidth={1.5} />
            </button>
          </div>
          <nav className="flex flex-1 flex-col justify-center gap-1 px-8">
            {DRAWER.map((item, i) => (
              <NavLink
                key={item.to}
                to={item.to}
                className="group flex items-baseline gap-4 py-2.5"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <span className="eyebrow w-7 text-[10px] text-accent">{String(i + 1).padStart(2, '0')}</span>
                <span className="type-display text-4xl text-night-ink transition-colors group-hover:text-accent">
                  {item.label}
                </span>
              </NavLink>
            ))}
          </nav>
          <div className="px-8 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
            <Button size="lg" className="w-full" onClick={() => { setMenuOpen(false); void registerFree(navigate) }}>
              <Ticket size={15} /> {registered ? 'Ver mi QR' : 'Registrate gratis'}
            </Button>
            <p className="eyebrow mt-6 text-center text-[9px] text-night-ink/40">
              {config.mainDatesLabel} · {config.venue.name}
            </p>
          </div>
        </div>
      )}
    </>
  )
}

function BottomNav() {
  // Barra oscura #181410 (mockups): 72px, borde superior tenue, ítem activo con
  // subrayado dorado 2px arriba; QR central elevado (-18px) siempre dorado con glow.
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-ink pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="grid h-[64px] grid-cols-5">
        {BOTTOM_NAV.map((item) => {
          const Icon = item.icon
          if (item.center) {
            return (
              <NavLink key={item.to} to={item.to} className="relative flex flex-col items-center justify-center">
                {({ isActive }) => (
                  <>
                    <span className="-mt-[18px] flex h-[52px] w-[52px] items-center justify-center rounded-full bg-accent text-accent-ink shadow-[0_4px_16px_rgba(184,134,11,0.5)] transition-transform duration-200 active:scale-95">
                      <Icon size={22} strokeWidth={1.75} />
                    </span>
                    <span
                      className={`mt-1 text-[9px] font-semibold uppercase tracking-[0.06em] ${
                        isActive ? 'text-night-ink' : 'text-[#6b6b6b]'
                      }`}
                    >
                      {item.label}
                    </span>
                  </>
                )}
              </NavLink>
            )
          }
          return (
            <NavLink key={item.to} to={item.to} className="relative flex flex-col items-center justify-center gap-1">
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span aria-hidden className="absolute inset-x-[20%] top-0 h-0.5 rounded-b-[2px] bg-accent" />
                  )}
                  <Icon
                    size={19}
                    strokeWidth={1.75}
                    className={isActive ? 'text-night-ink' : 'text-[#6b6b6b]'}
                  />
                  <span
                    className={`text-[9px] font-semibold uppercase tracking-[0.06em] ${
                      isActive ? 'text-night-ink' : 'text-[#6b6b6b]'
                    }`}
                  >
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}

function Footer() {
  return (
    <footer className="bg-night text-night-ink">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="type-display text-5xl">CCM</span>
              <Heart aria-hidden size={18} strokeWidth={0} className="fill-accent" />
            </div>
            <p className="eyebrow mt-3 text-[9px] text-night-ink/50">
              Córdoba Corazón de Moda · {config.edition}
            </p>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-night-ink/60">
              {config.mainDatesLabel}
              <br />
              {config.venue.name} · {config.venue.address}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10 text-sm">
            <div className="space-y-2.5">
              <div className="eyebrow text-[9px] text-accent">Explorar</div>
              {PRIMARY.map((item) => (
                <Link key={item.to} to={item.to} className="block text-night-ink/70 transition-colors hover:text-night-ink">
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="space-y-2.5">
              <div className="eyebrow text-[9px] text-accent">CCM</div>
              <Link to="/membresia" className="block text-night-ink/70 transition-colors hover:text-night-ink">
                Hacete Socio
              </Link>
              <Link to="/sponsors" className="block text-night-ink/70 transition-colors hover:text-night-ink">
                Quiero ser sponsor
              </Link>
              <Link to="/publicidad" className="block text-night-ink/70 transition-colors hover:text-night-ink">
                Publicitá en CCM
              </Link>
              <Link to="/c/camino-a-ccm" className="block text-night-ink/70 transition-colors hover:text-night-ink">
                Postulate
              </Link>
              <Link to="/stand" className="block text-night-ink/70 transition-colors hover:text-night-ink">
                Experiencia de stand
              </Link>
              <Link to="/admin" className="block text-night-ink/70 transition-colors hover:text-night-ink">
                Panel del organizador
              </Link>
              <Link to="/terminos" className="block text-night-ink/70 transition-colors hover:text-night-ink">
                Términos
              </Link>
              <Link to="/privacidad" className="block text-night-ink/70 transition-colors hover:text-night-ink">
                Privacidad
              </Link>
            </div>
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-night-soft pt-6 text-xs text-night-ink/45 md:flex-row md:items-center md:justify-between">
          <span>
            © {config.year} Córdoba Corazón de Moda ·{' '}
            <a
              href={config.instagramUrl}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-night-ink"
            >
              {config.instagramHandle}
            </a>
          </span>
          <span className="eyebrow text-[9px]">Produce · {config.produceCredit}</span>
        </div>
      </div>
    </footer>
  )
}

export default function SiteLayout() {
  const { pathname } = useLocation()
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="flex-1 pb-24 md:pb-0">
        {/* Transición de página (app-feel): remonta con un fade+rise corto */}
        <div key={pathname} className="animate-page">
          <Outlet />
        </div>
      </main>
      {/* En mobile el footer web solo vive en la landing; adentro manda el bottom nav */}
      <div className={pathname === '/' ? '' : 'hidden md:block'}>
        <Footer />
      </div>
      <BottomNav />
    </div>
  )
}
