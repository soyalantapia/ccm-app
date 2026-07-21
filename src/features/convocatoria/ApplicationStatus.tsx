import { Link } from 'react-router-dom'
import type { Application, ApplicationStatus as Status, Convocatoria, EventItem } from '../../data/types'
import { Badge, ButtonLink, Card, Eyebrow } from '../../components/ui'
import type { BadgeTone } from '../../components/ui/Badge'
import { formatApplicationDate } from './format'

const STATUS_META: Record<
  Status,
  { badgeTone: BadgeTone; badge: string; title: string; body: string }
> = {
  // Ninguno de los dos textos promete un canal de contacto puntual (antes "por teléfono"): el
  // mail que manda decideApplication (server/src/mail/templates.ts) dice "en los próximos días
  // te escribimos", y estos dos textos tienen que decir lo mismo — no algo distinto que se lea
  // como una contradicción si la persona lee primero acá y después el mail (o al revés).
  preinscripta: {
    badgeTone: 'accent',
    badge: 'En revisión',
    title: 'Tu postulación está en revisión',
    body: 'El equipo CCM está revisando tu postulación. Si quedás seleccionada/o, te escribimos en los próximos días con los detalles. Máximo 1 acompañante.',
  },
  aceptada: {
    badgeTone: 'success',
    badge: 'Aceptada',
    // Antes decía "¡Tenés tu lugar confirmado!": aceptar la postulación NO reserva ningún lugar
    // (no crea una Registration en ningún lado) — el texto prometía algo que no existía. Acá se
    // dice lo que de verdad pasó (la postulación fue aceptada) y lo que sigue (el equipo se
    // contacta), igual que el mail que ya recibió.
    title: '¡Quedaste seleccionada/o! 🖤',
    body: 'El equipo CCM aceptó tu postulación. En los próximos días te escribimos con los detalles de la fecha, el lugar y lo que tenés que llevar.',
  },
  rechazada: {
    badgeTone: 'danger',
    badge: 'Sin cupo',
    title: 'Esta vez no conseguimos lugar',
    body: 'Los cupos del encuentro eran limitados y no pudimos confirmarte. La historia sigue: vení igual y estate atenta/o a la próxima convocatoria.',
  },
}

interface ApplicationStatusProps {
  convocatoria: Convocatoria
  application: Application
  event?: EventItem
}

/** Estado de la postulación ya enviada desde este dispositivo (reemplaza al form). */
export function ApplicationStatusPanel({ convocatoria, application, event }: ApplicationStatusProps) {
  const meta = STATUS_META[application.status]
  const rows = convocatoria.fields
    .map((field) => ({ field, value: application.data[field.key] }))
    .filter((row) => Boolean(row.value))

  return (
    <div className="grid gap-10 md:grid-cols-12 md:gap-12">
      <div className="md:col-span-5 animate-rise">
        <Badge tone={meta.badgeTone}>{meta.badge}</Badge>
        <h2 className="type-display mt-5 text-[clamp(1.8rem,6vw,2.8rem)] text-balance text-ink">
          {meta.title}
        </h2>
        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ink-soft">{meta.body}</p>
        <p className="eyebrow mt-6 text-[10px] text-ink-soft/70">
          Enviada el {formatApplicationDate(application.ts)}
        </p>
        <div className="mt-8 flex flex-col items-start gap-5">
          {application.status !== 'rechazada' && (
            <ButtonLink to={event ? `/eventos/${event.slug}` : '/eventos'} size="lg">
              Inscribite al encuentro
            </ButtonLink>
          )}
          <Link
            to="/perfil"
            className="eyebrow text-[11px] text-ink transition-colors hover:text-accent hover:underline hover:decoration-accent hover:underline-offset-4"
          >
            Ir a mi perfil →
          </Link>
        </div>
      </div>

      <Card className="md:col-span-7 p-6 md:p-8">
        <Eyebrow>Tu ficha</Eyebrow>
        <dl className="mt-6">
          {rows.map(({ field, value }, i) => (
            <div key={field.key} className={`py-4 ${i > 0 ? 'border-t border-line' : 'pt-0'}`}>
              <dt className="eyebrow text-[10px] text-ink-soft">{field.label}</dt>
              <dd
                className={`mt-1.5 text-ink ${
                  field.type === 'textarea'
                    ? 'text-sm leading-relaxed text-ink-soft whitespace-pre-line'
                    : 'type-serif text-lg'
                }`}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  )
}
