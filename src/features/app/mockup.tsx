import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, GraduationCap, Heart, Newspaper, Percent, Play, Star, Ticket } from 'lucide-react'
import type { CatalogProfile, ContentItem, EventItem, Nota } from '../../data/types'

/**
 * Primitivas del sistema visual de los mockups CCM (revista de lujo → app).
 * Reutilizables por todas las pantallas app-facing para mantener el lenguaje.
 *
 * Escala responsive: en mobile son 1:1 con los mockups aprobados (clases sin
 * prefijo). En desktop (`lg:`) suben a escala editorial — tipografía, imágenes y
 * cards más grandes — para que la app no se lea como un teléfono estirado.
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
    <div className={`flex items-center gap-2.5 pb-2.5 pt-4 lg:gap-3.5 lg:pb-4 lg:pt-9 ${className}`}>
      <span aria-hidden className="h-0.5 w-6 shrink-0 bg-accent lg:w-10" />
      <span className="eyebrow text-[10px] text-accent lg:text-[13px]">{children}</span>
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
    <div className="flex items-start gap-3 rounded-[12px] bg-white p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.07)] lg:gap-4 lg:p-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-accent text-accent-ink lg:h-12 lg:w-12">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="type-serif text-[13px] leading-tight text-ink lg:text-[16px]">{title}</div>
        <div className="mt-1 text-[10px] leading-[1.5] text-text-3 lg:text-[12.5px]">{desc}</div>
        {trailing}
      </div>
    </div>
  )
}

/** section-empty: hero de estado vacío con tinte dorado (gradiente oscuro cálido). */
export function SectionEmpty({ icon, title, sub }: { icon: ReactNode; title: ReactNode; sub: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl rounded-[14px] border border-accent/20 bg-gradient-to-br from-ink to-brown-warm p-[18px] text-center lg:p-8">
      <div className="text-[40px] leading-none lg:text-[56px]">{icon}</div>
      <div className="type-serif mt-2.5 text-[16px] text-night-ink lg:mt-4 lg:text-[22px]">{title}</div>
      <div className="mt-1.5 text-[10px] text-text-2 lg:text-[13px]">{sub}</div>
    </div>
  )
}

/** sponsor-cuadrado: card oscura vertical (caja-logo dorada + label + nombre Playfair). */
export function SponsorCuadrado({ icon, name, label = 'Sponsor' }: { icon: ReactNode; name: ReactNode; label?: string }) {
  return (
    <div className="flex flex-col items-start gap-1.5 rounded-[12px] bg-ink p-3 lg:gap-2 lg:p-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-accent text-accent-ink lg:h-12 lg:w-12">{icon}</span>
      <span className="text-[7px] font-bold uppercase tracking-[0.1em] text-accent lg:text-[9px]">{label}</span>
      <span className="type-serif text-[12px] leading-tight text-night-ink lg:text-[15px]">{name}</span>
    </div>
  )
}

/** noticia-card: img (cover o gradiente con título), tag dorado, título Playfair, fecha. */
export function NoticiaCard({ n, featured = false }: { n: Nota; featured?: boolean }) {
  return (
    <Link
      to={`/novedades/${n.slug}`}
      className={`overflow-hidden rounded-[12px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.07)] transition-transform duration-200 hover:-translate-y-0.5 lg:rounded-[16px] lg:shadow-[0_4px_18px_rgba(0,0,0,0.08)] ${featured ? 'col-span-2' : ''}`}
    >
      <div className={`relative bg-cream-muted ${featured ? 'h-[110px] lg:h-[300px]' : 'h-[80px] lg:h-[190px]'}`}>
        {n.cover ? (
          <img src={n.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-brown-gray to-ink px-3 text-center">
            <span className="type-serif text-[11px] leading-tight text-accent lg:text-[16px]">{n.title}</span>
          </div>
        )}
      </div>
      <div className="px-2.5 pb-2.5 pt-2 lg:px-5 lg:pb-5 lg:pt-3.5">
        <div className="text-[8px] font-bold uppercase tracking-[0.08em] text-accent lg:text-[11px]">{n.category ?? 'CCM'}</div>
        <div className={`type-serif mt-0.5 leading-[1.3] text-ink lg:mt-1 ${featured ? 'text-[14px] lg:text-[30px]' : 'text-[12px] lg:text-[18px]'}`}>{n.title}</div>
        <div className="mt-1 text-[8px] text-text-4 lg:mt-1.5 lg:text-[11px]">{fmtDate(n.publishedAt)}</div>
      </div>
    </Link>
  )
}

/** video-card del carrusel (thumbnail YouTube + play + tag + título). */
export function VideoThumb({ c }: { c: ContentItem }) {
  return (
    <Link
      to="/contenido"
      className="w-[190px] shrink-0 overflow-hidden rounded-[12px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.07)] transition-transform duration-200 hover:-translate-y-0.5 lg:w-[300px] lg:rounded-[16px] lg:shadow-[0_4px_18px_rgba(0,0,0,0.08)]"
    >
      <div className="relative flex h-[100px] items-center justify-center bg-ink lg:h-[170px]">
        {c.youtubeId && (
          <img
            src={`https://i.ytimg.com/vi/${c.youtubeId}/mqdefault.jpg`}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover opacity-80"
          />
        )}
        <span className="absolute left-1.5 top-1.5 z-10 rounded-[3px] bg-accent px-1.5 py-0.5 text-[7px] font-bold uppercase text-accent-ink lg:left-3 lg:top-3 lg:text-[10px]">
          Video
        </span>
        <span className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-ink lg:h-12 lg:w-12">
          <Play size={12} className="ml-0.5 lg:hidden" />
          <Play size={20} className="ml-0.5 hidden lg:block" />
        </span>
      </div>
      <div className="p-2.5 lg:p-4">
        <div className="text-[8px] font-bold uppercase tracking-[0.08em] text-accent lg:text-[11px]">{c.platform ?? 'CCM'}</div>
        <div className="type-serif mt-0.5 line-clamp-2 text-[11px] leading-[1.3] text-ink lg:mt-1 lg:text-[15px]">{c.title}</div>
      </div>
    </Link>
  )
}

/** designer-card: card compacta del catálogo por plataforma (foto cuadrada + nombre + rol). */
export function DesignerCard({ profile }: { profile: CatalogProfile }) {
  return (
    <Link
      to={`/p/${profile.slug}`}
      className="overflow-hidden rounded-[14px] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.08)] transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98] lg:rounded-[18px]"
    >
      <div className="aspect-square bg-gradient-to-br from-brown-gray to-ink">
        {profile.photo && <img src={profile.photo} alt={profile.name} loading="lazy" className="h-full w-full object-cover" />}
      </div>
      <div className="p-2.5 text-center lg:p-4">
        <div className="type-serif text-[12px] leading-tight text-ink lg:text-[15px]">{profile.name}</div>
        <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.06em] text-accent lg:mt-1 lg:text-[10px]">{profile.role}</div>
      </div>
    </Link>
  )
}

/** entrevista-row: fila horizontal (thumb 90px + play chico + guest/título/meta). */
export function EntrevistaRow({ c }: { c: ContentItem }) {
  const meta = [c.duration, c.platform].filter(Boolean).join(' · ')
  return (
    <Link to="/contenido" className="flex overflow-hidden rounded-[12px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-transform duration-200 hover:-translate-y-0.5 lg:rounded-[16px]">
      <div className="relative flex w-[90px] shrink-0 items-center justify-center bg-ink lg:w-[200px]">
        {c.youtubeId && (
          <img
            src={`https://i.ytimg.com/vi/${c.youtubeId}/mqdefault.jpg`}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover opacity-70"
          />
        )}
        <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-ink lg:h-12 lg:w-12">
          <Play size={11} className="ml-0.5 lg:hidden" />
          <Play size={20} className="ml-0.5 hidden lg:block" />
        </span>
      </div>
      <div className="min-w-0 flex-1 px-3 py-2.5 lg:px-6 lg:py-5">
        <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-accent lg:text-[11px]">{c.platform ?? 'Elukamo'}</div>
        <div className="type-serif mt-0.5 line-clamp-2 text-[13px] leading-tight text-ink lg:mt-1.5 lg:text-[17px]">{c.title}</div>
        {meta && <div className="mt-1 text-[9px] text-text-4 lg:mt-2 lg:text-[12px]">{meta}</div>}
      </div>
    </Link>
  )
}

/** prensa-item: fila de prensa (logo + medio + título + fecha + flecha). */
export function PrensaItem({ n }: { n: Nota }) {
  return (
    <Link
      to={`/novedades/${n.slug}`}
      className="flex items-center gap-3 rounded-[12px] bg-white p-3 px-3.5 shadow-[0_1px_6px_rgba(0,0,0,0.06)] transition-transform duration-200 hover:-translate-y-0.5 lg:gap-4 lg:p-5"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-cream-muted lg:h-14 lg:w-14 lg:rounded-[10px]">
        {n.cover ? <img src={n.cover} alt="" className="h-full w-full object-cover" /> : <Newspaper size={18} className="text-ink/40" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-bold uppercase tracking-[0.06em] text-accent lg:text-[11px]">{n.category ?? 'Prensa'}</div>
        <div className="mt-0.5 line-clamp-2 text-[12px] font-semibold leading-snug text-ink lg:text-[15px]">{n.title}</div>
        <div className="mt-0.5 text-[9px] text-text-5 lg:text-[11px]">{fmtDate(n.publishedAt)}</div>
      </div>
      <ArrowRight size={14} className="shrink-0 text-accent lg:hidden" />
      <ArrowRight size={18} className="hidden shrink-0 text-accent lg:block" />
    </Link>
  )
}

/** corazones-cta: CTA del programa de influencers (Corazones CCM). */
export function CorazonesCta({ to }: { to: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3.5 rounded-[14px] border border-accent/25 bg-gradient-to-br from-ink to-brown-warm p-[18px] lg:gap-5 lg:p-7"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-accent text-accent-ink lg:h-16 lg:w-16">
        <Heart size={22} strokeWidth={0} className="fill-current" />
      </span>
      <div className="min-w-0">
        <div className="text-[8px] font-bold uppercase tracking-[0.1em] text-accent lg:text-[10px]">Programa de influencers</div>
        <div className="type-serif mt-0.5 text-[15px] leading-tight text-night-ink lg:mt-1 lg:text-[20px]">Sé un Corazón CCM</div>
        <div className="mt-1 text-[9px] leading-snug text-text-2 lg:text-[12px]">
          Creá contenido, crecé con la comunidad y sumate al equipo de embajadores.
        </div>
        <div className="mt-2 text-[10px] font-bold text-accent lg:text-[12px]">Quiero sumarme →</div>
      </div>
    </Link>
  )
}

/** lanzamiento-card: "Evento especial" (badge + fecha + título Playfair 900 + CTA). */
export function LanzamientoCard({ event }: { event: EventItem }) {
  return (
    <div className="mx-auto max-w-2xl rounded-[14px] border border-accent/30 bg-gradient-to-br from-ink to-brown-warm p-[18px] lg:max-w-3xl lg:rounded-[18px] lg:p-7">
      <span className="inline-block rounded-[4px] bg-accent px-2 py-1 text-[8px] font-bold uppercase tracking-[0.08em] text-accent-ink lg:text-[10px]">
        Evento especial
      </span>
      <div className="mt-2.5 text-[10px] font-bold uppercase text-accent lg:mt-3 lg:text-[12px]">
        {event.dateLabel}
        {event.timeLabel ? ` · ${event.timeLabel}` : ''}
      </div>
      <div className="type-display mt-1 text-[18px] leading-tight text-night-ink lg:mt-1.5 lg:text-[30px]">{event.title}</div>
      <div className="mt-1 text-[10px] text-text-2 lg:text-[13px]">📍 {event.venue}</div>
      <Link
        to={`/eventos/${event.slug}`}
        className="mt-3.5 block rounded-[8px] bg-accent py-2.5 text-center text-[11px] font-bold uppercase tracking-[0.05em] text-accent-ink lg:mt-5 lg:max-w-xs lg:py-3.5 lg:text-[13px]"
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
      <div className="flex items-center justify-between bg-accent px-[18px] py-3 lg:px-8 lg:py-4">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white lg:text-[13px]">Socio CCM VIP</span>
        <span className="rounded-full bg-white/20 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.05em] text-white lg:text-[11px]">
          Membresía Premium
        </span>
      </div>
      <div className="px-[18px] pb-5 pt-5 lg:px-8 lg:pb-8 lg:pt-8">
        <h2 className="type-display text-[22px] leading-tight text-night-ink lg:text-[32px]">
          Accedé a todo <span className="text-accent">el contenido.</span>
        </h2>
        <p className="mt-2 text-[11px] leading-relaxed text-text-5 lg:mt-3 lg:text-[14px]">
          Las capacitaciones, descuentos exclusivos y eventos especiales son solo para Socios CCM VIP.
        </p>
        <div className="mt-4 flex flex-col gap-2.5 lg:mt-6 lg:grid lg:grid-cols-2 lg:gap-4">
          {PAYWALL_BENEFITS.map((b) => (
            <div key={b.title} className="flex items-start gap-2.5 lg:gap-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-accent/30 bg-accent/15 text-accent lg:h-11 lg:w-11">
                <b.icon size={15} />
              </span>
              <div>
                <div className="text-[12px] font-bold leading-tight text-night-ink lg:text-[14px]">{b.title}</div>
                <div className="mt-0.5 text-[10px] leading-snug text-text-2 lg:text-[12px]">{b.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="my-[18px] h-px bg-white/[0.06] lg:my-6" />
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] text-text-2 lg:text-[12px]">Membresía</div>
            <div className="mt-0.5 text-[10px] text-text-2 lg:text-[12px]">Cancelá cuando quieras</div>
          </div>
          <div className="text-right">
            <div className="type-display text-[26px] text-accent lg:text-[36px]">{priceLabel}</div>
            <div className="mt-0.5 text-[10px] text-text-2 lg:text-[12px]">/ edición</div>
          </div>
        </div>
        <Link
          to="/membresia"
          className="mt-4 block rounded-[10px] bg-accent py-3.5 text-center text-[13px] font-bold uppercase tracking-[0.06em] text-accent-ink lg:mt-6 lg:text-[15px]"
        >
          Quiero ser Socio VIP
        </Link>
        <div className="mt-2.5 text-center text-[10px] text-text-3 lg:text-[12px]">
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
    <div className="flex items-center gap-3 rounded-[12px] bg-white p-3 px-3.5 shadow-[0_1px_6px_rgba(0,0,0,0.06)] lg:gap-4 lg:p-5">
      <span className="min-w-[48px] shrink-0 text-[11px] font-bold text-accent lg:min-w-[64px] lg:text-[14px]">{hora}</span>
      <div className="min-w-0 flex-1">
        <div className="type-serif text-[13px] leading-tight text-ink lg:text-[16px]">{titulo}</div>
        <div className="mt-0.5 text-[9px] font-semibold text-accent lg:text-[11px]">{plataforma}</div>
      </div>
      <span className="shrink-0 rounded-[4px] bg-accent px-2 py-1 text-[9px] font-bold text-accent-ink lg:text-[11px]">✓ Registrado</span>
    </div>
  )
}
