import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BedDouble, Crown, Gift, Sparkles, Ticket, UtensilsCrossed, Copy, Check, ArrowUpRight, Lock } from 'lucide-react'
import { Badge, ButtonLink, Card, EmptyState, SectionTitle } from '../components/ui'
import { store } from '../data/store'
import { useBenefits, useRegistrations } from '../data/queries'
import { safeExternalHref, isInternalPath } from '../lib/href'
import type { Benefit, BenefitCategory } from '../data/types'

const CAT_ICON: Record<BenefitCategory, typeof Gift> = {
  hotel: BedDouble,
  spa: Sparkles,
  gastronomia: UtensilsCrossed,
  entradas: Ticket,
  suscripcion: Crown,
  otro: Gift,
}
const CAT_LABEL: Record<BenefitCategory, string> = {
  hotel: 'Alojamiento',
  spa: 'Bienestar',
  gastronomia: 'Gastronomía',
  entradas: 'Entradas',
  suscripcion: 'Membresía',
  otro: 'Beneficio',
}

function BenefitCard({ b }: { b: Benefit }) {
  const Icon = CAT_ICON[b.category] ?? Gift
  const [copied, setCopied] = useState(false)
  const copy = () => {
    if (!b.code) return
    void navigator.clipboard?.writeText(b.code).then(() => {
      setCopied(true)
      store.track('benefit_code_copied', { benefitId: b.id, category: b.category })
      setTimeout(() => setCopied(false), 1800)
    })
  }
  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/12 text-accent">
            <Icon size={18} />
          </span>
          <div>
            <div className="eyebrow text-[10px] text-accent">{CAT_LABEL[b.category]}</div>
            <p className="mt-0.5 text-sm font-semibold text-ink">{b.partner}</p>
          </div>
        </div>
        {b.discountLabel && <Badge tone="solid">{b.discountLabel}</Badge>}
      </div>

      <div>
        <h3 className="type-serif text-xl text-ink">{b.title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{b.description}</p>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-3">
        {b.code ? (
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-2 rounded-sm border border-dashed border-accent/60 bg-accent/5 px-3 py-2 font-mono text-sm font-semibold tracking-wide text-ink transition hover:bg-accent/10"
          >
            {b.code}
            {copied ? <Check size={14} className="text-accent" /> : <Copy size={14} className="text-ink-soft" />}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
            <Lock size={12} /> Código para inscriptos
          </span>
        )}
        {b.url &&
          (safeExternalHref(b.url) ? (
            <a
              href={safeExternalHref(b.url)!}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => store.track('benefit_click', { benefitId: b.id })}
              className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-accent hover:underline"
            >
              Canjear <ArrowUpRight size={13} />
            </a>
          ) : isInternalPath(b.url) ? (
            <Link
              to={b.url}
              onClick={() => store.track('benefit_click', { benefitId: b.id })}
              className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-accent hover:underline"
            >
              Ver más <ArrowUpRight size={13} />
            </Link>
          ) : null)}
      </div>
    </Card>
  )
}

/** /beneficios — descuentos para inscriptos. El código se revela solo a quien se inscribió. */
export default function Beneficios() {
  const benefits = useBenefits()
  const registered = useRegistrations().some((r) => r.status === 'confirmada')

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 md:py-16">
      <SectionTitle
        eyebrow="Para inscriptos"
        title={
          <>
            Tus <em className="text-accent">beneficios</em>
          </>
        }
        lead="Descuentos en alojamiento, bienestar, gastronomía y más para quienes se inscriben a CCM 2026."
      />

      {!registered && (
        <div className="mt-8 flex flex-col items-start gap-4 rounded-lg border-2 border-accent bg-night p-6 text-night-ink md:flex-row md:items-center md:justify-between md:p-8">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
              <Lock size={16} />
            </span>
            <div>
              <h3 className="type-serif text-xl">Inscribite para desbloquear tus códigos</h3>
              <p className="mt-1 max-w-md text-sm text-night-ink/70">
                Los beneficios son gratis: con tu inscripción a CCM 2026 accedés a todos los códigos de descuento.
              </p>
            </div>
          </div>
          <ButtonLink to="/eventos">Inscribirme gratis</ButtonLink>
        </div>
      )}

      {benefits.length === 0 ? (
        <EmptyState title="Pronto vas a encontrar beneficios acá">
          Estamos cerrando acuerdos con hoteles, spas y más.
        </EmptyState>
      ) : (
        <div className="mt-10 grid animate-rise gap-6 md:grid-cols-2 lg:grid-cols-3">
          {benefits.map((b) => (
            <BenefitCard key={b.id} b={b} />
          ))}
        </div>
      )}
    </div>
  )
}
