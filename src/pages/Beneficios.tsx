import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BedDouble,
  Crown,
  Gift,
  GraduationCap,
  MessageCircle,
  Percent,
  Smartphone,
  Sparkles,
  Star,
  Ticket,
  UtensilsCrossed,
  Copy,
  Check,
  ArrowUpRight,
  Lock,
} from 'lucide-react'
import { ButtonLink } from '../components/ui'
import { store } from '../data/store'
import { useBenefits, useRegistrations } from '../data/queries'
import { safeExternalHref, isInternalPath } from '../lib/href'
import { SectionLabel, BeneficioItem } from '../features/app/mockup'
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
  otro: 'Otros beneficios',
}
const CAT_ORDER: BenefitCategory[] = ['hotel', 'spa', 'gastronomia', 'entradas', 'suscripcion', 'otro']

/** Perks de la membresía VIP (describen el plan; contenido estático del mockup). */
const VIP_GROUPS: { label: string; items: { icon: typeof Gift; title: string; desc: string }[] }[] = [
  {
    label: 'Acceso y Experiencia',
    items: [
      { icon: Ticket, title: 'Entrada Preferencial', desc: 'Acceso prioritario con el mejor precio garantizado para los 2 días del evento.' },
      { icon: Star, title: 'Eventos Exclusivos VIP', desc: 'Actividades privadas, sunsets y networking solo para socios VIP.' },
      { icon: GraduationCap, title: 'Capacitaciones Exclusivas', desc: 'Acceso completo a todos los cursos y módulos de formación en Elukamo.' },
    ],
  },
  {
    label: 'Descuentos y Ofertas',
    items: [
      { icon: Percent, title: 'Descuentos Exclusivos', desc: 'Beneficios con marcas y sponsors que no están disponibles para el público general.' },
      { icon: Gift, title: 'Códigos QR Dinámicos', desc: 'Códigos de descuento personalizados y de uso único en cada transacción.' },
    ],
  },
  {
    label: 'Comunidad y Contenido',
    items: [
      { icon: MessageCircle, title: 'Acceso Comunidad VIP', desc: 'Un grupo exclusivo de creadores y emprendedores de la industria creativa.' },
      { icon: Smartphone, title: 'Contenido Premium', desc: 'Acceso anticipado a noticias, videos y contenido exclusivo de CCM y Elukamo.' },
    ],
  },
]

function HeroTitle({ pre, highlight, sub }: { pre: string; highlight: string; sub: string }) {
  return (
    <div className="pt-3.5 text-center">
      <h1 className="type-display text-[26px] leading-[1.2] text-ink">
        {pre} <em className="text-accent">{highlight}</em>
      </h1>
      <p className="mt-1.5 text-[10px] text-text-2">{sub}</p>
    </div>
  )
}

/** Fila de descuento real (beneficio-item) con código gateado a inscriptos. */
function DescuentoRow({ b, registered }: { b: Benefit; registered: boolean }) {
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
  const externalHref = b.url ? safeExternalHref(b.url) : null
  return (
    <BeneficioItem
      icon={<Icon size={18} />}
      title={
        <span className="flex items-center gap-2">
          {b.partner}
          {b.discountLabel && (
            <span className="rounded-[4px] bg-accent px-1.5 py-0.5 text-[8px] font-bold uppercase text-accent-ink">
              {b.discountLabel}
            </span>
          )}
        </span>
      }
      desc={b.description}
      trailing={
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {registered && b.code ? (
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-[6px] border border-dashed border-accent/60 bg-accent/5 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-ink [font-family:ui-monospace,monospace] transition hover:bg-accent/10"
            >
              {b.code}
              {copied ? <Check size={12} className="text-accent" /> : <Copy size={12} className="text-text-3" />}
            </button>
          ) : b.code ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] text-text-3">
              <Lock size={11} /> Código para inscriptos
            </span>
          ) : null}
          {externalHref ? (
            <a
              href={externalHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => store.track('benefit_click', { benefitId: b.id })}
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-accent"
            >
              Canjear <ArrowUpRight size={12} />
            </a>
          ) : b.url && isInternalPath(b.url) ? (
            <Link
              to={b.url}
              onClick={() => store.track('benefit_click', { benefitId: b.id })}
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-accent"
            >
              Ver más <ArrowUpRight size={12} />
            </Link>
          ) : null}
        </div>
      }
    />
  )
}

/** /beneficios — Beneficios VIP / Descuentos (tabs de los mockups). El código de
 *  cada descuento se revela solo a quien se inscribió. */
export default function Beneficios() {
  const [tab, setTab] = useState<'vip' | 'descuentos'>('vip')
  const benefits = useBenefits()
  const registered = useRegistrations().some((r) => r.status === 'confirmada')

  const byCat = CAT_ORDER.map((cat) => ({ cat, items: benefits.filter((b) => b.category === cat) })).filter(
    (g) => g.items.length > 0,
  )

  return (
    <div className="mx-auto max-w-2xl pb-4 lg:max-w-4xl">
      {/* Tabs-container oscuro */}
      <div className="flex border-b border-white/[0.08] bg-ink">
        {(['vip', 'descuentos'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 border-b-2 py-3 text-center text-[11px] font-bold uppercase tracking-[0.08em] transition-colors ${
              tab === t ? 'border-accent text-accent' : 'border-transparent text-[#6b6b6b]'
            }`}
          >
            {t === 'vip' ? 'Beneficios VIP' : 'Descuentos'}
          </button>
        ))}
      </div>

      <div className="px-5">
        {tab === 'vip' ? (
          <>
            <HeroTitle pre="Beneficios" highlight="VIP" sub="Como Socio CCM VIP tenés acceso a:" />
            {VIP_GROUPS.map((g) => (
              <section key={g.label}>
                <SectionLabel>{g.label}</SectionLabel>
                <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-3">
                  {g.items.map((it) => (
                    <BeneficioItem key={it.title} icon={<it.icon size={18} />} title={it.title} desc={it.desc} />
                  ))}
                </div>
              </section>
            ))}
            <div className="mt-8">
              <ButtonLink to="/membresia" className="w-full justify-center">
                Quiero ser Socio VIP
              </ButtonLink>
            </div>
          </>
        ) : (
          <>
            <HeroTitle pre="Descuentos" highlight="Activos" sub="Ofertas para inscriptos a CCM 2026:" />

            {!registered && (
              <Link
                to="/eventos"
                className="mt-4 flex items-center justify-between gap-3 rounded-[14px] border border-accent/30 bg-gradient-to-br from-ink to-brown-warm p-4 text-left"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
                    <Lock size={15} />
                  </span>
                  <div>
                    <div className="type-serif text-[14px] text-night-ink">Inscribite para ver los códigos</div>
                    <div className="mt-1 text-[10px] text-text-2">Con tu inscripción gratis se desbloquean todos.</div>
                  </div>
                </div>
                <ArrowUpRight size={16} className="shrink-0 text-accent" />
              </Link>
            )}

            {byCat.length === 0 ? (
              <div className="py-10 text-center text-[11px] text-text-2">
                Estamos cerrando acuerdos con hoteles, spas y más.
              </div>
            ) : (
              byCat.map((g) => (
                <section key={g.cat}>
                  <SectionLabel>{CAT_LABEL[g.cat]}</SectionLabel>
                  <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-3">
                    {g.items.map((b) => (
                      <DescuentoRow key={b.id} b={b} registered={registered} />
                    ))}
                  </div>
                </section>
              ))
            )}
          </>
        )}
      </div>
    </div>
  )
}
