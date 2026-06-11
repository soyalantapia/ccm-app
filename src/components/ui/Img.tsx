import { useState, type ImgHTMLAttributes } from 'react'
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

/** Imagen lazy con placeholder y fade-in. SIEMPRE usar esto para fotos del seed. */
export function Img({ src, alt, ratio, priority, className, imgClassName, ...rest }: ImgProps) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div
      className={`overflow-hidden bg-ink/8 ${className ?? ''}`}
      style={ratio ? { aspectRatio: ratio } : undefined}
    >
      <img
        src={asset(src)}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`h-full w-full object-cover transition-opacity duration-700 ${
          loaded ? 'opacity-100' : 'opacity-0'
        } ${imgClassName ?? ''}`}
        {...rest}
      />
    </div>
  )
}
