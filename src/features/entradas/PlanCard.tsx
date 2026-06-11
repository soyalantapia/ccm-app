import { Check } from 'lucide-react'
import type { TicketPlan } from '../../data/types'
import { Badge, Button, Card, Eyebrow, Img } from '../../components/ui'
import { formatPlanPrice } from './format'

/** Covers del contrato de assets (CLAUDE.md) — las baja otro agente. */
const COVERS: Partial<Record<TicketPlan['id'], { src: string; alt: string }>> = {
  'night-vip': { src: 'img/hero/hero-night.jpg', alt: 'Night VIP · Desfile de las Estrellas' },
  'sunset-vip': { src: 'img/hero/hero-sunset.jpg', alt: 'Sunset VIP · Desfile Internacional' },
}

interface PlanCardProps {
  plan: TicketPlan
  /** Posición en la comparativa (numeración editorial 01 / 02 / 03). */
  index: number
  /** Solo aplica al plan general: ya inscripto al evento principal. */
  registered?: boolean
  onAction: () => void
  className?: string
}

export function PlanCard({ plan, index, registered, onAction, className }: PlanCardProps) {
  const night = Boolean(plan.featured)
  const free = plan.id === 'general'
  const cover = COVERS[plan.id]
  const num = String(index + 1).padStart(2, '0')
  const priceLabel = formatPlanPrice(plan.price)

  const mutedText = night ? 'text-night-ink/70' : 'text-ink-soft'
  const strongText = night ? 'text-night-ink' : 'text-ink'
  const divider = night ? 'border-night-soft' : 'border-line'

  return (
    <Card
      tone={night ? 'night' : 'surface'}
      hover
      className={`group flex flex-col overflow-hidden ${className ?? ''}`}
    >
      {night && (
        <div className="eyebrow bg-accent px-5 py-2.5 text-center text-[10px] text-accent-ink">
          La experiencia insignia
        </div>
      )}

      {cover && (
        <div className="relative">
          <Img
            src={cover.src}
            alt={cover.alt}
            ratio="16/10"
            priority={night}
            imgClassName="transition duration-700 group-hover:scale-[1.04]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-night/80 via-night/20 to-transparent"
          />
          <Eyebrow className="absolute bottom-4 left-5">{num}</Eyebrow>
        </div>
      )}

      <div className="flex flex-1 flex-col p-6 md:p-7">
        {!cover && <Eyebrow>{num}</Eyebrow>}

        <h3 className={`type-serif text-[1.7rem] leading-tight ${strongText} ${cover ? '' : 'mt-4'}`}>
          {plan.name}
        </h3>
        <p className={`mt-1.5 text-sm leading-relaxed ${mutedText}`}>{plan.tagline}</p>

        <div className={`mt-6 border-t pt-5 ${divider}`}>
          {priceLabel ? (
            <p className={`type-serif text-3xl ${strongText}`}>{priceLabel}</p>
          ) : (
            <p className={`type-serif text-2xl italic ${strongText}`}>Precio a confirmar</p>
          )}
          <p className={`eyebrow mt-1.5 text-[10px] ${mutedText}`}>
            {free ? 'Cupos limitados' : priceLabel ? 'Por persona' : 'Muy pronto a la venta'}
          </p>
        </div>

        <ul className="mt-5 space-y-2.5">
          {plan.perks.map((perk) => (
            <li key={perk} className={`flex items-start gap-2.5 text-sm leading-snug ${night ? 'text-night-ink/90' : 'text-ink-soft'}`}>
              <Check size={15} strokeWidth={2.5} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              {perk}
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-7">
          {free && registered && (
            <Badge tone="success" className="mb-3">
              Ya estás inscripto
            </Badge>
          )}
          <Button
            variant={night ? 'primary' : free ? 'ink' : 'outline'}
            size="lg"
            className="w-full"
            onClick={onAction}
          >
            {free ? (registered ? 'Ver mi QR' : 'Registrarme gratis') : 'Comprar'}
          </Button>
        </div>
      </div>
    </Card>
  )
}
