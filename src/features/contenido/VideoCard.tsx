import { useEffect } from 'react'
import { Lock } from 'lucide-react'
import { ButtonLink, Eyebrow, YouTubeEmbed } from '../../components/ui'
import { store, useStore } from '../../data/store'
import type { ContentItem } from '../../data/types'
import { formatMoney } from '../tickets/format'
import { SOCIO_PRICE } from '../membresia/plans'
import { formatPublishedAt } from './format'

interface VideoCardProps {
  item: ContentItem
  /** El primero del archivo va a ancho completo, con meta en dos columnas. */
  featured?: boolean
  className?: string
}

/** Card bloqueada: contenido exclusivo para Socios CCM, con CTA a la membresía. */
function LockedVideoCard({ item, featured, className }: VideoCardProps) {
  useEffect(() => {
    store.track('content_locked_view', { contentId: item.id })
  }, [item.id])

  return (
    <article className={className}>
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-md border-2 border-accent bg-night p-6 text-center text-night-ink">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-ink">
          <Lock size={18} />
        </span>
        <p className="eyebrow text-[10px] text-accent">Contenido exclusivo · Socios CCM</p>
        <h3 className={`type-serif text-night-ink ${featured ? 'text-2xl md:text-3xl' : 'text-xl'}`}>
          {item.title}
        </h3>
        <p className="max-w-md text-sm leading-relaxed text-night-ink/65">
          Entrevistas y backstage que no salen al público. Hacéte Socio para verlo.
        </p>
        <ButtonLink to="/membresia" size="sm" className="mt-1">
          Hacerme Socio · {formatMoney(SOCIO_PRICE)}
        </ButtonLink>
      </div>
    </article>
  )
}

/**
 * Video del archivo: embed de YouTube inline (D3) + título serif + meta.
 * Si tiene sponsor, lleva el crédito dorado "Presentado por" (slot S4)
 * y cuenta la impresión al renderizarse (PRD §11). Si es `socioOnly` y el
 * visitante no es Socio, se muestra bloqueado (sin embed ni impresión).
 */
export function VideoCard({ item, featured, className }: VideoCardProps) {
  const isSocio = useStore((s) => s.isSocio())
  const sponsor = useStore((s) => (item.sponsorId ? s.getSponsor(item.sponsorId) : undefined))
  const locked = !!item.socioOnly && !isSocio

  useEffect(() => {
    if (item.sponsorId && !locked) {
      store.track('ad_impression', { slot: 'S4', sponsorId: item.sponsorId, contentId: item.id })
    }
  }, [item.id, item.sponsorId, locked])

  if (locked) return <LockedVideoCard item={item} featured={featured} className={className} />

  const meta = [item.platform, item.duration, formatPublishedAt(item.publishedAt)]
    .filter(Boolean)
    .join(' · ')

  const trackPayload: Record<string, unknown> = { contentId: item.id }
  if (item.platform) trackPayload.platform = item.platform
  if (item.sponsorId) {
    trackPayload.sponsorId = item.sponsorId
    trackPayload.slot = 'S4'
  }

  return (
    <article className={className}>
      {sponsor && <Eyebrow className="mb-4">Presentado por {sponsor.name}</Eyebrow>}

      <YouTubeEmbed youtubeId={item.youtubeId} title={item.title} trackPayload={trackPayload} />

      {featured ? (
        <div className="mt-6 md:grid md:grid-cols-12 md:gap-x-8">
          <div className="md:col-span-7">
            <p className="eyebrow text-[10px] text-ink-soft">{meta}</p>
            <h3 className="type-serif mt-2.5 text-2xl text-ink md:text-3xl">{item.title}</h3>
          </div>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-soft md:col-span-5 md:mt-1">
            {item.description}
          </p>
        </div>
      ) : (
        <div className="mt-5">
          <p className="eyebrow text-[10px] text-ink-soft">{meta}</p>
          <h3 className="type-serif mt-2 text-xl leading-snug text-ink">{item.title}</h3>
          <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">{item.description}</p>
        </div>
      )}
    </article>
  )
}
