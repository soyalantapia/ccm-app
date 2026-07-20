import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Loader2, Mail, ShieldCheck, UserPlus, UserX, UserCheck } from 'lucide-react'
import { Badge, Button, Field, Input, Modal, Select, Stat, toast } from '../../components/ui'
import type { BadgeTone } from '../../components/ui/Badge'
import { CorePageHeader } from '../../features/admin/CorePageHeader'
import { apiBase } from '../../data/store'
import { adminAuthHeaders, getMe, clearSession } from '../../data/adminSession'
import { ROLE_LABEL, ROLE_BLURB, type AdminRole } from '../../data/adminRoles'

/**
 * Equipo y permisos: quién tiene acceso al panel y con qué alcance.
 *
 * Sólo la ve quien puede gestionar el equipo. Igual que en todo el panel, esconder la sección
 * es cosmética — el backend rechaza con 403 a cualquiera sin el permiso, aunque llegue por URL.
 */

type Estado = 'invited' | 'active' | 'disabled'

interface Persona {
  id: string
  email: string
  name: string | null
  role: AdminRole
  status: Estado
  invitedBy: string | null
  invitedAt: string
  lastLogin: string | null
}

interface RolOfrecido {
  id: AdminRole
  label: string
  blurb: string
}

const TONO_ESTADO: Record<Estado, BadgeTone> = {
  active: 'success',
  invited: 'accent',
  disabled: 'danger',
}
const LABEL_ESTADO: Record<Estado, string> = {
  active: 'Activo',
  invited: 'Invitado',
  disabled: 'Sin acceso',
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}/api/v1${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...adminAuthHeaders(), ...(init?.headers ?? {}) },
  })
  // Sesión vencida o revocada a mitad de uso: limpiar el estado local. El GateSesion del layout,
  // suscripto a este cambio, redirige al login — mismo criterio que el cliente HTTP central.
  if (res.status === 401) clearSession()
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message ?? 'No pudimos completar la acción.')
  return data as T
}

export default function AdminEquipo() {
  const yo = getMe()
  const [gente, setGente] = useState<Persona[] | null>(null)
  const [roles, setRoles] = useState<RolOfrecido[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [invitando, setInvitando] = useState(false)

  const traer = useCallback(async () => {
    try {
      const [equipo, cat] = await Promise.all([
        api<Persona[]>('/admin/team'),
        api<{ roles: RolOfrecido[] }>('/admin/team/roles'),
      ])
      setGente(equipo)
      setRoles(cat.roles)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos traer el equipo.')
    }
  }, [])

  useEffect(() => {
    void traer()
  }, [traer])

  async function cambiarRol(p: Persona, role: AdminRole) {
    if (role === p.role || ocupado) return
    setOcupado(p.id)
    try {
      await api(`/admin/team/${p.id}`, { method: 'PATCH', body: JSON.stringify({ role }) })
      toast(`✓ ${p.email} ahora es ${ROLE_LABEL[role]}`)
      await traer()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo cambiar el rol')
    } finally {
      setOcupado(null)
    }
  }

  async function cambiarEstado(p: Persona, status: Estado) {
    setOcupado(p.id)
    try {
      await api(`/admin/team/${p.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      toast(status === 'disabled' ? `✓ Le quitaste el acceso a ${p.email}` : `✓ ${p.email} vuelve a tener acceso`)
      await traer()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo cambiar el estado')
    } finally {
      setOcupado(null)
    }
  }

  async function reenviar(p: Persona) {
    setOcupado(p.id)
    try {
      const r = await api<{ email: { sent: boolean } }>(`/admin/team/${p.id}/resend`, { method: 'POST' })
      toast(r.email.sent ? `✓ Le reenviamos el acceso a ${p.email}` : '⚠ Se generó pero el mail no salió')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo reenviar')
    } finally {
      setOcupado(null)
    }
  }

  const activos = gente?.filter((p) => p.status !== 'disabled').length ?? 0
  const duenos = gente?.filter((p) => p.role === 'OWNER' && p.status !== 'disabled').length ?? 0

  return (
    <div className="px-5 py-8 md:px-10">
      <CorePageHeader
        title="Equipo y permisos"
        lead="Quién entra al panel y qué puede hacer. Se entra siempre con un código al email — no hay contraseñas."
        actions={
          <Button size="sm" onClick={() => setInvitando(true)}>
            <UserPlus size={14} strokeWidth={2} /> Dar acceso
          </Button>
        }
      />

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Con acceso" value={String(activos)} />
        <Stat label="Dueños" value={String(duenos)} />
        <Stat label="En el equipo" value={String(gente?.length ?? 0)} />
      </div>

      {error && (
        <p className="mt-6 rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {gente === null && !error && <p className="mt-8 text-sm text-ink-soft">Cargando el equipo…</p>}

      {gente && gente.length > 0 && (
        <div className="mt-8 space-y-3">
          {gente.map((p) => {
            const soyYo = yo?.id === p.id
            const trabajando = ocupado === p.id
            return (
              <div
                key={p.id}
                className="rounded-md border border-line bg-surface p-4 sm:flex sm:items-center sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[15px] text-ink">
                    <span className="truncate font-medium">{p.name || p.email}</span>
                    {soyYo && <span className="shrink-0 text-[11px] text-ink-soft">(vos)</span>}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-ink-soft">{p.email}</p>
                  <p className="mt-1.5 text-[11px] text-ink-soft/70">
                    {p.lastLogin
                      ? `Última vez: ${new Date(p.lastLogin).toLocaleDateString('es-AR')}`
                      : 'Todavía no entró'}
                    {p.invitedBy && ` · invitó ${p.invitedBy}`}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-0">
                  <Badge tone={TONO_ESTADO[p.status]}>{LABEL_ESTADO[p.status]}</Badge>

                  <Select
                    aria-label={`Rol de ${p.email}`}
                    options={roles.map((r) => ({ value: r.id, label: r.label }))}
                    value={p.role}
                    disabled={trabajando || soyYo}
                    onChange={(e) => cambiarRol(p, e.target.value as AdminRole)}
                    className="w-36"
                  />

                  {p.status === 'invited' && (
                    <Button variant="ghost" size="sm" disabled={trabajando} onClick={() => reenviar(p)}>
                      <Mail size={13} /> Reenviar
                    </Button>
                  )}

                  {p.status === 'disabled' ? (
                    <Button variant="ghost" size="sm" disabled={trabajando} onClick={() => cambiarEstado(p, 'active')}>
                      <UserCheck size={13} /> Devolver acceso
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={trabajando || soyYo}
                      onClick={() => cambiarEstado(p, 'disabled')}
                    >
                      <UserX size={13} /> Quitar acceso
                    </Button>
                  )}

                  {trabajando && <Loader2 size={14} className="animate-spin text-ink-soft" aria-label="Guardando" />}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-10 space-y-3 border-t border-line pt-6">
        <p className="eyebrow text-[10px] text-ink-soft">Qué habilita cada rol</p>
        {roles.map((r) => (
          <p key={r.id} className="text-[13px] leading-relaxed text-ink-soft">
            <span className="font-medium text-ink">{r.label}</span> — {ROLE_BLURB[r.id] ?? r.blurb}
          </p>
        ))}
        <p className="flex items-start gap-2 pt-2 text-[11px] leading-relaxed text-ink-soft/70">
          <ShieldCheck size={13} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          Los permisos se aplican en el servidor: aunque alguien llegue a una pantalla por la URL,
          no va a poder leer ni cambiar lo que su rol no habilita. Quitarle el acceso a alguien
          tiene efecto al instante, aunque tenga la sesión abierta.
        </p>
      </div>

      <ModalInvitar
        abierto={invitando}
        roles={roles}
        onCerrar={() => setInvitando(false)}
        onListo={async () => {
          setInvitando(false)
          await traer()
        }}
      />
    </div>
  )
}

function ModalInvitar({
  abierto, roles, onCerrar, onListo,
}: {
  abierto: boolean
  roles: RolOfrecido[]
  onCerrar: () => void
  onListo: () => void
}) {
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState<AdminRole>('CONTENT')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (abierto) {
      setEmail('')
      setNombre('')
      setRol('CONTENT')
      setError(null)
    }
  }, [abierto])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      const r = await api<{ email: { sent: boolean; to: string } }>('/admin/team/invite', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), name: nombre.trim(), role: rol }),
      })
      toast(
        r.email.sent
          ? `✓ Le avisamos a ${r.email.to} que ya tiene acceso`
          : `✓ Acceso creado, pero el mail a ${r.email.to} no salió`,
      )
      onListo()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos dar el acceso.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal open={abierto} onClose={onCerrar}>
      <h2 className="type-serif mb-5 text-xl text-ink">Dar acceso al panel</h2>
      <form onSubmit={enviar} className="space-y-4">
        <Field label="Email" required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nombre@ejemplo.com"
            required
            autoFocus
          />
        </Field>
        <Field label="Nombre" required>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Laura Gómez" required />
        </Field>
        <Field label="Rol" hint={roles.find((r) => r.id === rol)?.blurb}>
          <Select
            options={roles.map((r) => ({ value: r.id, label: r.label }))}
            value={rol}
            onChange={(e) => setRol(e.target.value as AdminRole)}
          />
        </Field>

        <p className="rounded-md bg-bg px-3 py-2.5 text-[12px] leading-relaxed text-ink-soft">
          Le va a llegar un mail contándole que ya tiene acceso y qué puede hacer. No lleva ninguna
          contraseña: entra al panel y pide un código de un solo uso, como todo el mundo.
        </p>

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2.5 pt-1 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" size="lg" onClick={onCerrar} className="sm:order-1">
            Cancelar
          </Button>
          <Button type="submit" size="lg" disabled={enviando} className="sm:order-2">
            {enviando ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Enviando…
              </>
            ) : (
              'Dar acceso'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
