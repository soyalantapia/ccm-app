import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AlertCircle, ArrowRight, CalendarDays, Check, Gift, Smartphone, Ticket } from 'lucide-react'
import { Button, ButtonLink, Card, PagePending } from '../components/ui'
import { store } from '../data/store'
import type { GrantClaim, GrantPreview } from '../data/store'

/**
 * /i/:token — la pantalla que ve el invitado al abrir el link del mail "te regalaron entradas".
 *
 * El link es /i/<grantId>.<token>: el grantId es un cuid y el token un base64url, ninguno lleva
 * puntos, así que partir en el PRIMER punto los separa sin ambigüedad. Flujo:
 *   1. preview (solo lectura) → "Córdoba Corazón de Moda te regaló N entradas para X".
 *   2. el invitado toca "Activar" → claim: enlaza su dispositivo y materializa la inscripción.
 *   3. listo → lo empujamos a la app (Mi QR), que es donde vive su entrada.
 *
 * Todo el trabajo pesado (validar token, reservar/soltar cupo, idempotencia) vive en el backend;
 * acá solo se orquestan los dos llamados y se elige el copy según el resultado.
 */

type Estado =
  | { fase: 'cargando' }
  | { fase: 'listo-para-activar'; preview: Extract<GrantPreview, { ok: true }> }
  | { fase: 'activando'; preview: Extract<GrantPreview, { ok: true }> }
  | { fase: 'activada'; claim: Extract<GrantClaim, { ok: true }> }
  | { fase: 'error'; motivo: GrantPreviewMotivo | ClaimMotivo }

type GrantPreviewMotivo = Extract<GrantPreview, { ok: false }>['motivo']
type ClaimMotivo = Extract<GrantClaim, { ok: false }>['motivo']

/** Copy de cada rechazo. Un solo lugar para el título y la explicación de cada motivo. */
const RECHAZO: Record<GrantPreviewMotivo | ClaimMotivo, { titulo: string; texto: string }> = {
  no_existe: {
    titulo: 'No encontramos esta entrada',
    texto: 'El link puede estar incompleto o haber vencido. Pedile a la organización que te lo reenvíe.',
  },
  link_invalido: {
    titulo: 'Este link no es válido',
    texto: 'Puede que se haya cortado al copiarlo. Abrí el enlace completo desde el mail que te llegó.',
  },
  revocado: {
    titulo: 'Esta invitación fue dada de baja',
    texto: 'La organización canceló este regalo. Si creés que es un error, escribiles y te lo vuelven a mandar.',
  },
  de_otra_persona: {
    titulo: 'Esta entrada ya se usó',
    texto: 'Ya fue activada en otro dispositivo. Cada invitación se puede activar una sola vez.',
  },
}

function separarLink(raw: string | undefined): { grantId: string; token: string } | null {
  if (!raw) return null
  const punto = raw.indexOf('.')
  if (punto <= 0 || punto === raw.length - 1) return null
  return { grantId: raw.slice(0, punto), token: raw.slice(punto + 1) }
}

export default function EntradaRegalo() {
  const { token: raw } = useParams()
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })

  useEffect(() => {
    const partes = separarLink(raw)
    if (!partes) {
      setEstado({ fase: 'error', motivo: 'link_invalido' })
      return
    }
    let vivo = true
    store.previewGrant(partes.grantId, partes.token).then((res) => {
      if (!vivo) return
      if (res.ok) setEstado({ fase: 'listo-para-activar', preview: res })
      else setEstado({ fase: 'error', motivo: res.motivo })
    })
    return () => {
      vivo = false
    }
  }, [raw])

  async function activar() {
    const partes = separarLink(raw)
    if (!partes || estado.fase !== 'listo-para-activar') return
    const preview = estado.preview
    setEstado({ fase: 'activando', preview })
    const res = await store.claimGrant(partes.grantId, partes.token)
    if (res.ok) setEstado({ fase: 'activada', claim: res })
    else setEstado({ fase: 'error', motivo: res.motivo })
  }

  if (estado.fase === 'cargando') return <PagePending />

  if (estado.fase === 'error') {
    const { titulo, texto } = RECHAZO[estado.motivo]
    return (
      <Pantalla>
        <div className="grid size-14 place-items-center rounded-full bg-line/60 text-ink-soft">
          <AlertCircle className="size-7" strokeWidth={1.5} />
        </div>
        <h1 className="type-display mt-6 text-3xl md:text-4xl">{titulo}</h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-soft">{texto}</p>
        <ButtonLink to="/eventos" variant="outline" className="mt-8">
          Ver los eventos de CCM
        </ButtonLink>
      </Pantalla>
    )
  }

  if (estado.fase === 'activada') {
    const { eventTitle, eventWhen } = estado.claim
    return (
      <Pantalla>
        <div className="grid size-14 place-items-center rounded-full bg-accent/15 text-accent-strong">
          <Check className="size-7" strokeWidth={2} />
        </div>
        <p className="eyebrow mt-6 text-accent">Entrada activada</p>
        <h1 className="type-display mt-3 text-3xl md:text-4xl">
          ¡Listo! Ya tenés
          <br />
          <em className="text-accent">tu lugar</em>
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-soft">
          Guardamos tu entrada para <strong className="text-ink">{eventTitle}</strong>
          {eventWhen ? <> · {eventWhen}</> : null}. La vas a encontrar como código QR en tu app.
        </p>
        <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
          <ButtonLink to="/mi-qr" size="lg" className="w-full justify-center gap-2">
            <Smartphone className="size-4" strokeWidth={2} />
            Abrir mi entrada
          </ButtonLink>
          <p className="text-xs leading-relaxed text-ink-soft">
            Para usarla en la puerta, instalá la app cuando te lo ofrezca: así entrás mostrando tu QR
            desde el celular, sin buscar el mail.
          </p>
        </div>
      </Pantalla>
    )
  }

  // 'listo-para-activar' | 'activando' — la tarjeta del regalo con el CTA.
  const { preview } = estado
  const activando = estado.fase === 'activando'
  const yaReclamada = preview.estado === 'reclamado'
  return (
    <Pantalla>
      <div className="grid size-14 place-items-center rounded-full bg-accent/15 text-accent-strong">
        <Gift className="size-7" strokeWidth={1.5} />
      </div>
      <p className="eyebrow mt-6 text-accent">Córdoba Corazón de Moda</p>
      <h1 className="type-display mt-3 text-3xl md:text-4xl">
        Te regalamos
        <br />
        <em className="text-accent">
          {preview.qty === 1 ? 'una entrada' : `${preview.qty} entradas`}
        </em>
      </h1>

      <Card className="mt-8 w-full max-w-sm p-5 text-left">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md bg-accent/12 text-accent-strong">
            <Ticket className="size-5" strokeWidth={1.5} />
          </div>
          <div className="min-w-0">
            <p className="type-title text-base leading-snug text-ink">{preview.eventTitle}</p>
            {preview.eventWhen ? (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-soft">
                <CalendarDays className="size-3.5" strokeWidth={1.5} />
                {preview.eventWhen}
              </p>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="mt-7 flex w-full max-w-sm flex-col gap-3">
        <Button size="lg" onClick={activar} disabled={activando} className="w-full justify-center gap-2">
          {activando ? 'Activando…' : yaReclamada ? 'Abrir mi entrada' : 'Activar mi entrada'}
          {!activando ? <ArrowRight className="size-4" strokeWidth={2} /> : null}
        </Button>
        <p className="text-xs leading-relaxed text-ink-soft">
          Al activarla, tu entrada queda guardada en este dispositivo como código QR para mostrar en
          la puerta. Es gratis y no necesitás crear ninguna cuenta.
        </p>
      </div>
    </Pantalla>
  )
}

function Pantalla({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      {children}
    </div>
  )
}
