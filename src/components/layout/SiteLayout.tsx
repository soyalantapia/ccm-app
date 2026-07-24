import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays, Heart, Home, Play, QrCode, Store } from 'lucide-react'
import { Button } from '../ui'
import { registerFree } from '../../lib/actions'
import { useStore } from '../../data/store'
import { IDS } from '../../data/ids'
import { config } from '../../config'

// Foco (tesis Gastón: simple, de nicho): la app SON las 5 pestañas. PRIMARY =
// las que compiten por atención (top-nav en desktop; bottom-nav en mobile). El
// resto no infla el nav: las secundarias viven en el footer y en el hub Mi QR,
// y el B2B (sponsors/publicidad/stand) en el footer.
const PRIMARY = [
  { to: '/app', label: 'Noticias' },
  { to: '/eventos', label: 'Eventos' },
  { to: '/catalogo', label: 'Participantes' },
  { to: '/speakers', label: 'Speakers' },
  { to: '/contenido', label: 'Elukamo' },
]

// Nav superior de desktop: las 4 pestañas core + Fotos y Entradas. En pantalla
// grande hay lugar de sobra y una barra más completa se lee más "web" y menos
// vacía (en mobile sigue mandando el bottom-nav).
const TOPNAV = [
  { to: '/', label: 'Inicio' },
  ...PRIMARY,
  { to: '/fotos', label: 'Fotos' },
  { to: '/entradas', label: 'Entradas' },
]

// Bottom-nav mobile de 5 slots (mockups): Noticias · Eventos · Mi QR (centro
// elevado) · Participantes · Elukamo. Perfil y demás secundarias → hub Mi QR.
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
  const registered = useStore((s) => s.isRegistered(IDS.events.principal))

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 lg:h-[72px] lg:px-8">
          <div className="lg:flex-1">
            <Wordmark />
          </div>
          {/* Nav centrado (3 zonas) — más completo en desktop para no verse vacío */}
          <nav className="hidden items-center gap-8 lg:flex">
            {TOPNAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `eyebrow relative text-[11px] transition-colors after:absolute after:-bottom-1.5 after:left-0 after:h-px after:bg-accent after:transition-all after:duration-200 ${
                    isActive
                      ? 'text-ink after:w-full'
                      : 'text-ink-soft after:w-0 hover:text-ink hover:after:w-full'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2.5 lg:flex-1 lg:justify-end">
            {/* CTA solo en desktop: en el celular Mi QR ya está en el bottom-nav
                (botón central) y el registro se alcanza desde ahí y desde el feed. */}
            <span className="hidden lg:inline-flex">
              <Button size="sm" onClick={() => void registerFree(navigate)}>
                {registered ? 'Mi QR' : 'Registrate'}
              </Button>
            </span>
          </div>
        </div>
      </header>
  )
}

function BottomNav() {
  // Barra oscura #181410 (mockups): 72px, borde superior tenue, ítem activo con
  // subrayado dorado 2px arriba; QR central elevado (-18px) siempre dorado con glow.
  return (
    // lg y no md: el nav del header recién aparece en lg (1024). Con el corte en md (768)
    // quedaba una franja de 768-1023px SIN ningún control de navegación — ni la barra
    // inferior ni el menú de arriba. El corte del layout público es UNO solo: lg.
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-ink pb-[env(safe-area-inset-bottom)] lg:hidden">
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
                        isActive ? 'text-night-ink' : 'text-night-ink/55'
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
                    className={isActive ? 'text-night-ink' : 'text-night-ink/55'}
                  />
                  <span
                    className={`text-[9px] font-semibold uppercase tracking-[0.06em] ${
                      isActive ? 'text-night-ink' : 'text-night-ink/55'
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
      <main className="flex-1 pb-24 lg:pb-0">
        {/* Transición de página (app-feel): remonta con un fade+rise corto */}
        <div key={pathname} className="animate-page">
          <Outlet />
        </div>
      </main>
      {/* En mobile el footer web solo vive en la landing; adentro manda el bottom nav.
          El corte es lg (NO md) porque el bottom-nav y el top-nav del header conmutan en lg:
          con md acá quedaba una franja 768–1023px con footer y bottom-nav a la vez. */}
      <div className={pathname === '/' ? '' : 'hidden lg:block'}>
        <Footer />
      </div>
      <BottomNav />
    </div>
  )
}
