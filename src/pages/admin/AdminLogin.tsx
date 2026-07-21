import { useEffect, useRef, useState, type FormEvent, type ClipboardEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, KeyRound, Loader2, MailCheck, RefreshCw, ShieldCheck } from 'lucide-react'
import { setAdminToken, setMe } from '../../data/adminSession'
import { apiBase, IS_REMOTE } from '../../data/store'

/**
 * Entrada al panel: se pide un código al email y se entra con él. No hay contraseñas.
 *
 * Dos pasos, como el login de Speed: primero el email, después los seis dígitos. Los detalles
 * que hacen que se sienta bien son los que no se ven — `autoComplete="one-time-code"` para que
 * el teléfono ofrezca el código solo, pegar los seis de una, avanzar y retroceder con el teclado,
 * y enviar apenas se completa sin tener que apretar nada.
 */

const TTL_S = 600 // 10 minutos, igual que el backend
const REENVIO_S = 30

export default function AdminLogin() {
  const navigate = useNavigate()
  const [paso, setPaso] = useState<'email' | 'codigo'>('email')
  const [email, setEmail] = useState('')
  const [enviadoA, setEnviadoA] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [venceEn, setVenceEn] = useState(0)
  const [reenvioEn, setReenvioEn] = useState(0)
  const [ahora, setAhora] = useState(0)
  const [nonce, setNonce] = useState(0) // remonta los inputs al pedir un código nuevo

  // Reloj del contador y del cooldown.
  useEffect(() => {
    if (paso !== 'codigo') return
    setAhora(Date.now())
    const id = window.setInterval(() => setAhora(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [paso])

  const restan = Math.max(0, Math.ceil((venceEn - ahora) / 1000))
  const faltaReenvio = Math.max(0, Math.ceil((reenvioEn - ahora) / 1000))
  const vencido = paso === 'codigo' && restan === 0

  async function pedirCodigo(): Promise<boolean> {
    setError(null)
    const e = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      setError('Escribí un email válido.')
      return false
    }
    setOcupado(true)
    try {
      const res = await fetch(`${apiBase}/api/v1/auth/admin/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e }),
      })
      if (!res.ok) throw new Error(String(res.status))
      return true
    } catch {
      setError('No pudimos pedir el código. Probá de nuevo en un momento.')
      return false
    } finally {
      setOcupado(false)
    }
  }

  function arrancarCuenta() {
    const t = Date.now()
    setVenceEn(t + TTL_S * 1000)
    setReenvioEn(t + REENVIO_S * 1000)
    setAhora(t)
  }

  async function onEnviarEmail(ev: FormEvent) {
    ev.preventDefault()
    if (await pedirCodigo()) {
      setEnviadoA(email.trim().toLowerCase())
      arrancarCuenta()
      setPaso('codigo')
    }
  }

  async function onReenviar() {
    if (faltaReenvio > 0 || ocupado) return
    if (await pedirCodigo()) {
      arrancarCuenta()
      setNonce((n) => n + 1)
      setAviso('Te mandamos un código nuevo.')
      window.setTimeout(() => setAviso(null), 2600)
    }
  }

  async function onVerificar(codigo: string) {
    if (ocupado || vencido) return
    setOcupado(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase}/api/v1/auth/admin/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: enviadoA, code: codigo }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // El backend responde lo MISMO para todos los motivos (equivocado, vencido, usado,
        // agotado, cuenta inexistente): distinguirlos acá delataría qué emails son del equipo.
        setError('El código no es válido, ya venció o ya se usó. Pedí uno nuevo.')
        return
      }
      setAdminToken(data.token)
      setMe(data.user)
      navigate(data.home ?? '/admin', { replace: true })
    } catch {
      setError('No pudimos verificar el código. Probá de nuevo.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="grid min-h-dvh bg-night text-night-ink lg:grid-cols-[1fr_1fr]">
      <div className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          {paso === 'email' ? (
            <PasoEmail
              email={email}
              setEmail={setEmail}
              ocupado={ocupado}
              error={error}
              onSubmit={onEnviarEmail}
            />
          ) : (
            <PasoCodigo
              key={nonce}
              email={enviadoA}
              ocupado={ocupado}
              error={error}
              aviso={aviso}
              vencido={vencido}
              restan={restan}
              faltaReenvio={faltaReenvio}
              onVerificar={onVerificar}
              onReenviar={onReenviar}
              onVolver={() => {
                setPaso('email')
                setError(null)
              }}
            />
          )}
        </div>
      </div>
      <PanelMarca />
    </div>
  )
}

function PasoEmail({
  email, setEmail, ocupado, error, onSubmit,
}: {
  email: string
  setEmail: (v: string) => void
  ocupado: boolean
  error: string | null
  onSubmit: (e: FormEvent) => void
}) {
  return (
    <form onSubmit={onSubmit}>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-accent">
        <ShieldCheck size={13} aria-hidden /> Panel CCM
      </span>
      <h1 className="type-serif mt-4 text-3xl leading-none text-night-ink sm:text-4xl">Entrar al panel</h1>
      <p className="mt-2 text-sm text-night-ink/60">
        Te mandamos un código de un solo uso al email. No hay contraseña que recordar.
      </p>

      <label className="mt-7 block">
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-night-ink/50">
          Tu email
        </span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
          autoComplete="email"
          placeholder="nombre@ejemplo.com"
          className="w-full rounded-xl border border-night-soft bg-night px-4 py-3 text-base text-night-ink outline-none transition-colors placeholder:text-night-ink/30 focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </label>

      {error && (
        <p className="mt-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={ocupado}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-accent-ink transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-night"
      >
        {ocupado ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden /> Enviando…
          </>
        ) : (
          'Enviarme el código'
        )}
      </button>

      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-night-ink/40">
        <KeyRound size={12} aria-hidden /> Sin contraseñas: entrás con un código que vence a los 10 minutos.
      </p>
    </form>
  )
}

function PasoCodigo({
  email, ocupado, error, aviso, vencido, restan, faltaReenvio, onVerificar, onReenviar, onVolver,
}: {
  email: string
  ocupado: boolean
  error: string | null
  aviso: string | null
  vencido: boolean
  restan: number
  faltaReenvio: number
  onVerificar: (codigo: string) => void
  onReenviar: () => void
  onVolver: () => void
}) {
  const [digitos, setDigitos] = useState(['', '', '', '', '', ''])
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const completo = digitos.every((d) => d !== '')
  const mmss = `${Math.floor(restan / 60)}:${String(restan % 60).padStart(2, '0')}`

  function confirmar(siguiente: string[]) {
    setDigitos(siguiente)
    // Enviar solo, apenas se completan los seis: nadie quiere buscar el botón.
    if (siguiente.every((d) => d !== '')) {
      window.setTimeout(() => onVerificar(siguiente.join('')), 150)
    }
  }

  function escribir(i: number, v: string) {
    const c = v.replace(/\D/g, '').slice(-1)
    const siguiente = [...digitos]
    siguiente[i] = c
    if (c && i < 5) refs.current[i + 1]?.focus()
    confirmar(siguiente)
  }

  function teclas(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digitos[i] && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus()
    if (e.key === 'Enter' && completo) onVerificar(digitos.join(''))
  }

  /** Pegar los seis dígitos de una: se reparten solos. */
  function pegar(e: ClipboardEvent<HTMLInputElement>) {
    const p = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!p) return
    e.preventDefault()
    const siguiente = ['', '', '', '', '', '']
    for (let k = 0; k < p.length; k++) siguiente[k] = p[k]
    refs.current[Math.min(p.length, 5)]?.focus()
    confirmar(siguiente)
  }

  return (
    <div>
      <button
        onClick={onVolver}
        className="mb-6 inline-flex items-center gap-1 text-xs text-night-ink/50 transition-colors hover:text-night-ink"
      >
        <ArrowLeft size={13} aria-hidden /> Usar otro email
      </button>

      <span className="grid size-12 place-items-center rounded-full bg-accent/15 text-accent ring-1 ring-accent/25">
        <MailCheck size={22} aria-hidden />
      </span>
      <h1 className="type-serif mt-4 text-3xl text-night-ink">Revisá tu correo</h1>
      <p className="mt-2 text-sm text-night-ink/60">
        Mandamos un código de 6 dígitos a <span className="font-semibold text-night-ink">{email}</span>.
      </p>

      <div className="mt-6 flex gap-2" onPaste={pegar}>
        {digitos.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el
            }}
            value={d}
            onChange={(e) => escribir(i, e.target.value)}
            onKeyDown={(e) => teclas(i, e)}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label={`Dígito ${i + 1} de 6`}
            autoFocus={i === 0}
            disabled={ocupado || vencido}
            className="h-14 w-full rounded-xl border border-night-soft bg-night text-center font-mono text-2xl font-bold text-night-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-40"
          />
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs">
        {/* El último minuto se marca con el acento, no con rojo: todavía no pasó nada malo. */}
        <span className={vencido ? 'text-danger' : restan <= 60 ? 'text-accent' : 'text-night-ink/50'}>
          {vencido ? 'El código venció' : <>Vence en <span className="font-bold tabular-nums">{mmss}</span></>}
        </span>
        <button
          onClick={onReenviar}
          disabled={faltaReenvio > 0 || ocupado}
          className="inline-flex items-center gap-1.5 font-medium text-accent transition-colors hover:text-accent-strong disabled:cursor-not-allowed disabled:text-night-ink/30"
        >
          <RefreshCw size={12} className={ocupado ? 'animate-spin' : ''} aria-hidden />
          {faltaReenvio > 0 ? `Reenviar en ${faltaReenvio}s` : 'Reenviar código'}
        </button>
      </div>

      {/* El verde del tema (#2e7d4f) está calibrado para fondo claro: sobre esta pantalla
          oscura da 2.9:1 y no llega a AA. La señal de "salió bien" la da el fondo teñido;
          el texto va en el color legible de la superficie oscura (12.9:1). */}
      {aviso && (
        <p className="mt-3 rounded-lg bg-success/15 px-3 py-2 text-xs text-night-ink" role="status">
          {aviso}
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <button
        onClick={() => onVerificar(digitos.join(''))}
        disabled={!completo || ocupado || vencido}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-accent-ink transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {ocupado ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden /> Verificando…
          </>
        ) : (
          'Entrar'
        )}
      </button>

      {!IS_REMOTE && (
        <p className="mt-4 text-center text-[11px] text-night-ink/40">
          Modo demo: no hay backend, cualquier código entra.
        </p>
      )}
    </div>
  )
}

function PanelMarca() {
  return (
    <div
      className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between"
      style={{ background: 'radial-gradient(120% 120% at 80% 0%, #4c392b 0%, #3b2c21 42%, #33261d 100%)' }}
    >
      <div className="relative p-12">
        <div className="type-display text-5xl text-night-ink">CCM</div>
      </div>

      <div className="relative px-12 pb-4">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent">Córdoba Corazón de Moda</p>
        <h2 className="type-serif mt-3 text-5xl leading-[1.05] text-night-ink">
          El panel
          <br />
          de la 14ª
          <br />
          edición.
        </h2>
        <p className="mt-5 max-w-md text-sm leading-relaxed text-night-ink/60">
          Inscripciones, entradas, postulaciones y sponsors, medidos en tiempo real.
        </p>
      </div>

      <div className="relative flex items-center gap-6 border-t border-night-soft/60 p-12 text-xs text-night-ink/40">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck size={14} className="text-accent" aria-hidden /> Ingreso seguro por código
        </span>
        <span>19 y 20 de septiembre</span>
      </div>
    </div>
  )
}
