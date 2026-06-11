import { useEffect } from 'react'
import { Eyebrow, YouTubeEmbed } from '../../components/ui'
import { store, useStore } from '../../data/store'
import type { ContentItem } from '../../data/types'
import { formatPublishedAt } from './format'

interface VideoCardProps {
  item: ContentItem
  /** El primero del archivo va a ancho completo, con meta en dos columnas. */
  featured?: boolean
  className?: string
}

/**
 * Video del archivo: embed de YouTube inline (D3) + título serif + meta.
 * Si tiene sponsor, lleva el crédito dorado "Presentado por" (slot S4)
 * y cuenta la impresión al renderizarse (PRD §11).
 */
export function VideoCard({ item, featured, className }: VideoCardProps) {
  const sponsor = useStore((s) => (item.sponsorId ? s.getSponsor(item.sponsorId) : undefined))

  useEffect(() => {
    if (item.sponsorId) {
      store.track('ad_impression', { slot: 'S4', sponsorId: item.sponsorId, contentId: item.id })
    }
  }, [item.id, item.sponsorId])

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
