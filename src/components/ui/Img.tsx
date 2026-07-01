import { useState, type ImgHTMLAttributes } from 'react'
import { ImageOff } from 'lucide-react'
import { asset } from '../../lib/assets'

interface ImgProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** Ruta relativa a public/ (ej: 'img/gallery/g01.jpg') */
  src: string
  alt: string
  /** aspect-ratio CSS, ej '3/4' */
  ratio?: string
  priority?: boolean
  imgClassName?: string
}

type Status = 'loading' | 'loaded' | 'error'

/** Imagen lazy con placeholder, fade-in y fallback elegante si la carga falla. SIEMPRE usar esto para fotos del seed. */
export function Img({ src, alt, ratio, priority, className, imgClassName, ...rest }: ImgProps) {
  const [status, setStatus] = useState<Status>('loading')
  return (
    <div
      className={`overflow-hidden bg-ink/8 ${status === 'loading' ? 'animate-pulse' : ''} ${className ?? ''}`}
      style={ratio ? { aspectRatio: ratio } : undefined}
    >
      {status === 'error' ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-night px-4 text-center text-night-ink">
          <ImageOff className="size-6 opacity-60" strokeWidth={1.25} aria-hidden />
          {alt ? <span className="text-[11px] leading-snug text-night-ink/70">{alt}</span> : null}
        </div>
      ) : (
        <img
          src={asset(src)}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          decoding="async"
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
          className={`h-full w-full object-cover transition-opacity duration-700 ${
            status === 'loaded' ? 'opacity-100' : 'opacity-0'
          } ${imgClassName ?? ''}`}
          {...rest}
        />
      )}
    </div>
  )
}
