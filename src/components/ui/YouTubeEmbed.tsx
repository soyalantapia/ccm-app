import { useState } from 'react'
import { Play } from 'lucide-react'
import { track } from '../../lib/track'

interface YouTubeEmbedProps {
  youtubeId: string
  title: string
  trackPayload?: Record<string, unknown>
  className?: string
}

/**
 * Video SIEMPRE embebido (D3): facade con thumbnail → iframe de YouTube
 * nocookie con autoplay. Nunca saca al usuario de la plataforma.
 */
export function YouTubeEmbed({ youtubeId, title, trackPayload, className }: YouTubeEmbedProps) {
  const [playing, setPlaying] = useState(false)

  if (playing) {
    return (
      <div className={`aspect-video overflow-hidden rounded-md bg-night ${className ?? ''}`}>
        <iframe
          className="h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
    )
  }

  return (
    <button
      onClick={() => {
        setPlaying(true)
        track('video_play', { youtubeId, title, ...trackPayload })
      }}
      className={`group relative block aspect-video w-full overflow-hidden rounded-md bg-night text-left ${className ?? ''}`}
      aria-label={`Reproducir: ${title}`}
    >
      <img
        src={`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover opacity-80 transition-all duration-500 group-hover:scale-[1.03] group-hover:opacity-100"
      />
      <span className="absolute inset-0 bg-gradient-to-t from-night/70 via-transparent to-transparent" />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-ink shadow-xl transition-transform duration-300 group-hover:scale-110">
          <Play size={22} className="ml-1" fill="currentColor" strokeWidth={0} />
        </span>
      </span>
      <span className="absolute inset-x-0 bottom-0 p-4">
        <span className="type-serif block text-lg leading-snug text-night-ink">{title}</span>
      </span>
    </button>
  )
}
