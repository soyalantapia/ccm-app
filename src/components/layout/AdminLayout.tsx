import { useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import {
  ArrowLeft,
  Images,
  LayoutDashboard,
  CalendarDays,
  Inbox,
  Settings,
  Ticket,
  Users,
} from 'lucide-react'
import { config } from '../../config'
import { Button, Field, Input } from '../ui'

const SECTIONS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/eventos', label: 'Eventos', icon: CalendarDays },
  { to: '/admin/postulaciones', label: 'Postulaciones', icon: Inbox },
  { to: '/admin/personas', label: 'Personas', icon: Users },
  { to: '/admin/galerias', label: 'Galerías y sponsors', icon: Images },
  { to: '/admin/ordenes', label: 'Entradas y órdenes', icon: Ticket },
  { to: '/admin/configuracion', label: 'Configuración', icon: Settings },
]

function AdminGate({ onUnlock }: { onUnlock: () => void }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (key === config.adminKey) {
      sessionStorage.setItem('ccm:admin', '1')
      onUnlock()
    } else {
      setError(true)
    }
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
          <Field label="Clave de acceso" error={error ? 'Clave incorrecta' : undefined}>
            <Input
              type="password"
              value={key}
              onChange={(e) => {
                setKey(e.target.value)
                setError(false)
              }}
              placeholder="••••••••"
              autoFocus
              className="border-night-soft bg-night text-night-ink placeholder:text-night-ink/30"
            />
          </Field>
          <Button type="submit" className="w-full">
            Ingresar
          </Button>
          <p className="text-center text-[11px] leading-relaxed text-night-ink/40">
            Acceso provisorio de demo · en Fase 1 se reemplaza por usuarios con email y contraseña
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

export default function AdminLayout() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('ccm:admin') === '1')

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

      {/* Top bar mobile */}
      <div className="sticky top-0 z-40 border-b border-night-soft bg-night text-night-ink md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link to="/admin" className="flex items-baseline gap-2">
            <span className="type-display text-xl">CCM</span>
            <span className="eyebrow text-[8px] text-accent">Admin</span>
          </Link>
          <Link to="/" className="eyebrow flex items-center gap-1.5 text-[9px] text-night-ink/50">
            <ArrowLeft size={11} /> App
          </Link>
        </div>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2.5">
          {SECTIONS.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              end={s.end}
              className={({ isActive }) =>
                `eyebrow shrink-0 rounded-sm px-3 py-1.5 text-[9px] transition-colors ${
                  isActive ? 'bg-accent text-accent-ink' : 'text-night-ink/55'
                }`
              }
            >
              {s.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <main className="min-w-0 flex-1 bg-bg">
        <Outlet />
      </main>
    </div>
  )
}
