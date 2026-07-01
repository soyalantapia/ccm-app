import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, GraduationCap, Heart, Newspaper, Percent, Play, Star, Ticket } from 'lucide-react'
import type { CatalogProfile, ContentItem, EventItem, Nota } from '../../data/types'

/**
 * Primitivas del sistema visual de los mockups CCM (revista de lujo → app).
 * Reutilizables por todas las pantallas app-facing para mantener el lenguaje.
 */

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  } catch {
    return ''
  }
}

/** section-label: barra dorada 24×2 + eyebrow dorado uppercase (0.12em). */
export function SectionLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 pb-2.5 pt-4 ${className}`}>
      <span aria-hidden className="h-0.5 w-6 shrink-0 bg-accent" />
      <span className="eyebrow text-[10px] text-accent">{children}</span>
    </div>
  )
}

/** beneficio-item: fila blanca con caja-ícono dorada 40px + título Playfair + desc. */
export function BeneficioItem({
  icon,
  title,
  desc,
  trailing,
}: {
  icon: ReactNode
  title: ReactNode
  desc: ReactNode
  trailing?: ReactNode
}) {
  return (
    <div className="flex items-start gap-3 rounded-[12px] bg-white p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.07)]">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-accent text-accent-ink">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="type-serif text-[13px] leading-tight text-ink">{title}</div>
        <div className="mt-1 text-[10px] leading-[1.5] text-text-3">{desc}</div>
        {trailing}
      </div>
    </div>
  )
}

/** section-empty: hero de estado vacío con tinte dorado (gradiente oscuro cálido). */
export function SectionEmpty({ icon, title, sub }: { icon: ReactNode; title: ReactNode; sub: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl rounded-[14px] border border-accent/20 bg-gradient-to-br from-ink to-brown-warm p-[18px] text-center">
      <div className="text-[40px] leading-none">{icon}</div>
      <div className="type-serif mt-2.5 text-[16px] text-night-ink">{title}</div>
      <div className="mt-1.5 text-[10px] text-text-2">{sub}</div>
    </div>
  )
}

/** sponsor-cuadrado: card oscura vertical (caja-logo dorada + label + nombre Playfair). */
export function SponsorCuadrado({ icon, name, label = 'Sponsor' }: { icon: ReactNode; name: ReactNode; label?: string }) {
  return (
    <div className="flex flex-col items-start gap-1.5 rounded-[12px] bg-ink p-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-accent text-accent-ink">{icon}</span>
      <span className="text-[7px] font-bold uppercase tracking-[0.1em] text-accent">{label}</span>
      <span className="type-serif text-[12px] leading-tight text-night-ink">{name}</span>
    </div>
  )
}

/** noticia-card: img (cover o gradiente con título), tag dorado, título Playfair, fecha. */
export function NoticiaCard({ n, featured = false }: { n: Nota; featured?: boolean }) {
  return (
    <Link
      to={`/novedades/${n.slug}`}
      className={`overflow-hidden rounded-[12px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.07)] ${featured ? 'col-span-2' : ''}`}
    >
      <div className={`relative ${featured ? 'h-[110px]' : 'h-[80px]'} bg-cream-muted`}>
        {n.cover ? (
          <img src={n.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-brown-gray to-ink px-3 text-center">
            <span className="type-serif text-[11px] leading-tight text-accent">{n.title}</span>
          </div>
        )}
      </div>
      <div className="px-2.5 pb-2.5 pt-2">
        <div className="text-[8px] font-bold uppercase tracking-[0.08em] text-accent">{n.category ?? 'CCM'}</div>
        <div className={`type-serif mt-0.5 leading-[1.3] text-ink ${featured ? 'text-[14px]' : 'text-[12px]'}`}>{n.title}</div>
        <div className="mt-1 text-[8px] text-text-4">{fmtDate(n.publishedAt)}</div>
      </div>
    </Link>
  )
}

/** video-card del carrusel (thumbnail YouTube + play + tag + título). */
export function VideoThumb({ c }: { c: ContentItem }) {
  return (
    <Link
      to="/contenido"
      className="w-[190px] shrink-0 overflow-hidden rounded-[12px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.07)]"
    >
      <div className="relative flex h-[100px] items-center justify-center bg-ink">
        {c.youtubeId && (
          <img
            src={`https://i.ytimg.com/vi/${c.youtubeId}/mqdefault.jpg`}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover opacity-80"
          />
        )}
        <span className="absolute left-1.5 top-1.5 z-10 rounded-[3px] bg-accent px-1.5 py-0.5 text-[7px] font-bold uppercase text-accent-ink">
          Video
        </span>
        <span className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-ink">
          <Play size={12} className="ml-0.5" />
        </span>
      </div>
      <div className="p-2.5">
        <div className="text-[8px] font-bold uppercase tracking-[0.08em] text-accent">{c.platform ?? 'CCM'}</div>
        <div className="type-serif mt-0.5 line-clamp-2 text-[11px] leading-[1.3] text-ink">{c.title}</div>
      </div>
    </Link>
  )
}

/** designer-card: card compacta del catálogo por plataforma (foto cuadrada + nombre + rol). */
export function DesignerCard({ profile }: { profile: CatalogProfile }) {
  return (
    <Link
      to={`/p/${profile.slug}`}
      className="overflow-hidden rounded-[14px] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.08)] transition-transform duration-200 active:scale-[0.98]"
    >
      <div className="aspect-square bg-gradient-to-br from-brown-gray to-ink">
        {profile.photo && <img src={profile.photo} alt={profile.name} loading="lazy" className="h-full w-full object-cover" />}
      </div>
      <div className="p-2.5 text-center">
        <div className="type-serif text-[12px] leading-tight text-ink">{profile.name}</div>
        <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.06em] text-accent">{profile.role}</div>
      </div>
    </Link>
  )
}

/** entrevista-row: fila horizontal (thumb 90px + play chico + guest/título/meta). */
export function EntrevistaRow({ c }: { c: ContentItem }) {
  const meta = [c.duration, c.platform].filter(Boolean).join(' · ')
  return (
    <Link to="/contenido" className="flex overflow-hidden rounded-[12px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
      <div className="relative flex w-[90px] shrink-0 items-center justify-center bg-ink">
        {c.youtubeId && (
          <img
            src={`https://i.ytimg.com/vi/${c.youtubeId}/mqdefault.jpg`}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover opacity-70"
          />
        )}
        <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-ink">
          <Play size={11} className="ml-0.5" />
        </span>
      </div>
      <div className="min-w-0 flex-1 px-3 py-2.5">
        <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-accent">{c.platform ?? 'Elukamo'}</div>
        <div className="type-serif mt-0.5 line-clamp-2 text-[13px] leading-tight text-ink">{c.title}</div>
        {meta && <div className="mt-1 text-[9px] text-text-4">{meta}</div>}
      </div>
    </Link>
  )
}

/** prensa-item: fila de prensa (logo + medio + título + fecha + flecha). */
export function PrensaItem({ n }: { n: Nota }) {
  return (
    <Link
      to={`/novedades/${n.slug}`}
      className="flex items-center gap-3 rounded-[12px] bg-white p-3 px-3.5 shadow-[0_1px_6px_rgba(0,0,0,0.06)]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-cream-muted">
        {n.cover ? <img src={n.cover} alt="" className="h-full w-full object-cover" /> : <Newspaper size={18} className="text-ink/40" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-bold uppercase tracking-[0.06em] text-accent">{n.category ?? 'Prensa'}</div>
        <div className="mt-0.5 line-clamp-2 text-[12px] font-semibold leading-snug text-ink">{n.title}</div>
        <div className="mt-0.5 text-[9px] text-text-5">{fmtDate(n.publishedAt)}</div>
      </div>
      <ArrowRight size={14} className="shrink-0 text-accent" />
    </Link>
  )
}

/** corazones-cta: CTA del programa de influencers (Corazones CCM). */
export function CorazonesCta({ to }: { to: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3.5 rounded-[14px] border border-accent/25 bg-gradient-to-br from-ink to-brown-warm p-[18px]"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-accent text-accent-ink">
        <Heart size={22} strokeWidth={0} className="fill-current" />
      </span>
      <div className="min-w-0">
        <div className="text-[8px] font-bold uppercase tracking-[0.1em] text-accent">Programa de influencers</div>
        <div className="type-serif mt-0.5 text-[15px] leading-tight text-night-ink">Sé un Corazón CCM</div>
        <div className="mt-1 text-[9px] leading-snug text-text-2">
          Creá contenido, crecé con la comunidad y sumate al equipo de embajadores.
        </div>
        <div className="mt-2 text-[10px] font-bold text-accent">Quiero sumarme →</div>
      </div>
    </Link>
  )
}

/** lanzamiento-card: "Evento especial" (badge + fecha + título Playfair 900 + CTA). */
export function LanzamientoCard({ event }: { event: EventItem }) {
  return (
    <div className="mx-auto max-w-2xl rounded-[14px] border border-accent/30 bg-gradient-to-br from-ink to-brown-warm p-[18px]">
      <span className="inline-block rounded-[4px] bg-accent px-2 py-1 text-[8px] font-bold uppercase tracking-[0.08em] text-accent-ink">
        Evento especial
      </span>
      <div className="mt-2.5 text-[10px] font-bold uppercase text-accent">
        {event.dateLabel}
        {event.timeLabel ? ` · ${event.timeLabel}` : ''}
      </div>
      <div className="type-display mt-1 text-[18px] leading-tight text-night-ink">{event.title}</div>
      <div className="mt-1 text-[10px] text-text-2">📍 {event.venue}</div>
      <Link
        to={`/eventos/${event.slug}`}
        className="mt-3.5 block rounded-[8px] bg-accent py-2.5 text-center text-[11px] font-bold uppercase tracking-[0.05em] text-accent-ink"
      >
        Reservá tu lugar
      </Link>
    </div>
  )
}

const PAYWALL_BENEFITS = [
  { icon: GraduationCap, title: 'Capacitaciones exclusivas', desc: 'Acceso completo a todos los cursos y módulos de Elukamo.' },
  { icon: Ticket, title: 'Entrada preferencial a CCM', desc: 'El precio más bajo garantizado para el evento.' },
  { icon: Percent, title: 'Descuentos exclusivos', desc: 'Beneficios con marcas y sponsors que no están para el público general.' },
  { icon: Star, title: 'Eventos exclusivos VIP', desc: 'Acceso a actividades y experiencias privadas dentro de CCM.' },
]

/** paywall-card: gate premium de Capacitaciones (header dorado + beneficios + precio + CTA). */
export function PaywallCard({ priceLabel }: { priceLabel: string }) {
  return (
    <div className="mx-auto max-w-2xl overflow-hidden rounded-[18px] border border-accent/30 bg-gradient-to-br from-ink to-brown-warm">
      <div className="flex items-center justify-between bg-accent px-[18px] py-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white">Socio CCM VIP</span>
        <span className="rounded-full bg-white/20 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.05em] text-white">
          Membresía Premium
        </span>
      </div>
      <div className="px-[18px] pb-5 pt-5">
        <h2 className="type-display text-[22px] leading-tight text-night-ink">
          Accedé a todo <span className="text-accent">el contenido.</span>
        </h2>
        <p className="mt-2 text-[11px] leading-relaxed text-text-5">
          Las capacitaciones, descuentos exclusivos y eventos especiales son solo para Socios CCM VIP.
        </p>
        <div className="mt-4 flex flex-col gap-2.5">
          {PAYWALL_BENEFITS.map((b) => (
            <div key={b.title} className="flex items-start gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-accent/30 bg-accent/15 text-accent">
                <b.icon size={15} />
              </span>
              <div>
                <div className="text-[12px] font-bold leading-tight text-night-ink">{b.title}</div>
                <div className="mt-0.5 text-[10px] leading-snug text-text-2">{b.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="my-[18px] h-px bg-white/[0.06]" />
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] text-text-2">Membresía</div>
            <div className="mt-0.5 text-[10px] text-text-2">Cancelá cuando quieras</div>
          </div>
          <div className="text-right">
            <div className="type-display text-[26px] text-accent">{priceLabel}</div>
            <div className="mt-0.5 text-[10px] text-text-2">/ edición</div>
          </div>
        </div>
        <Link
          to="/membresia"
          className="mt-4 block rounded-[10px] bg-accent py-3.5 text-center text-[13px] font-bold uppercase tracking-[0.06em] text-accent-ink"
        >
          Quiero ser Socio VIP
        </Link>
        <div className="mt-2.5 text-center text-[10px] text-text-3">
          ¿Preferís el plan gratuito?{' '}
          <Link to="/membresia" className="font-semibold text-accent underline">
            Registrate como Socio CCM
          </Link>
        </div>
      </div>
    </div>
  )
}

/** inscripcion-item: fila de inscripción (hora dorada | título + rubro | chip Registrado). */
export function InscripcionItem({ hora, titulo, plataforma }: { hora: string; titulo: string; plataforma: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] bg-white p-3 px-3.5 shadow-[0_1px_6px_rgba(0,0,0,0.06)]">
      <span className="min-w-[48px] shrink-0 text-[11px] font-bold text-accent">{hora}</span>
      <div className="min-w-0 flex-1">
        <div className="type-serif text-[13px] leading-tight text-ink">{titulo}</div>
        <div className="mt-0.5 text-[9px] font-semibold text-accent">{plataforma}</div>
      </div>
      <span className="shrink-0 rounded-[4px] bg-accent px-2 py-1 text-[9px] font-bold text-accent-ink">✓ Registrado</span>
    </div>
  )
}
