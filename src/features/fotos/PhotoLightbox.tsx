import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Heart } from 'lucide-react'
import { Button, Img, Modal, toast } from '../../components/ui'
import { store, useStore } from '../../data/store'
import { requireProfile } from '../../lib/profileRequest'
import type { Gallery } from '../../data/types'
import { SponsorBanner } from './SponsorBanner'
import { downloadPhoto } from './downloadPhoto'

interface PhotoLightboxProps {
  gallery: Gallery
  /** Índice de la foto abierta (null = cerrado). */
  index: number | null
  onClose: () => void
  onNavigate: (index: number) => void
}

/**
 * Modal de foto (PRD §6.7, §12): foto grande + banner S3 del sponsor de la
 * galería + favorito + descarga gated por perfil. Al abrir y en cada cambio
 * de foto trackea photo_view; el banner registra su propia impresión.
 */
export function PhotoLightbox({ gallery, index, onClose, onNavigate }: PhotoLightboxProps) {
  const total = gallery.photos.length
  const open = index !== null && total > 0
  const photo = open && index !== null ? gallery.photos[index] : null
  const photoId = photo?.id

  const sponsor = useStore((s) => s.getSponsor(gallery.sponsorId))
  const favorites = useStore((s) => s.getFavorites())
  const isFav = photoId ? favorites.includes(photoId) : false
  const [downloading, setDownloading] = useState(false)

  /* photo_view al abrir y en cada prev/next (PRD §13). */
  useEffect(() => {
    if (!photoId) return
    store.track('photo_view', { photoId, galleryId: gallery.id })
  }, [photoId, gallery.id])

  /* Navegación con teclado ← → */
  useEffect(() => {
    if (!open || index === null || total < 2) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') onNavigate((index + 1) % total)
      if (e.key === 'ArrowLeft') onNavigate((index - 1 + total) % total)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, index, total, onNavigate])

  const onDownload = async () => {
    if (!photo) return
    const ok = await requireProfile(['firstName', 'lastName', 'email'], 'descarga_foto', {
      title: 'Para descargar necesitamos estos datos',
    })
    if (!ok) return
    setDownloading(true)
    try {
      store.recordDownload(photo.id, gallery.id)
      await downloadPhoto(photo.src, `ccm-${gallery.slug}-${photo.id}.jpg`)
      toast('Foto guardada ✓')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} variant="media">
      {photo && index !== null && (
        <div className="mx-auto w-full max-w-[52dvh]">
          <div className="relative">
            <Img key={photo.id} src={photo.src} alt={photo.alt} ratio="3/4" priority />
            {total > 1 && (
              <>
                <button
                  onClick={() => onNavigate((index - 1 + total) % total)}
                  aria-label="Foto anterior"
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-sm bg-black/45 p-2.5 text-white/90 transition-colors duration-200 hover:bg-black/65 hover:text-white"
                >
                  <ChevronLeft size={20} strokeWidth={1.5} />
                </button>
                <button
                  onClick={() => onNavigate((index + 1) % total)}
                  aria-label="Foto siguiente"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm bg-black/45 p-2.5 text-white/90 transition-colors duration-200 hover:bg-black/65 hover:text-white"
                >
                  <ChevronRight size={20} strokeWidth={1.5} />
                </button>
              </>
            )}
          </div>

          {sponsor && (
            <SponsorBanner sponsor={sponsor} galleryId={gallery.id} photoId={photo.id} />
          )}

          <div className="mt-5 flex items-end justify-between gap-5 pb-2">
            <div className="min-w-0">
              <span className="eyebrow text-[10px] text-accent">
                {index + 1} / {total}
              </span>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/65">{photo.alt}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <button
                onClick={() => store.toggleFavorite(photo.id)}
                aria-pressed={isFav}
                aria-label={isFav ? 'Quitar de favoritas' : 'Guardar como favorita'}
                className={`rounded-sm border p-3 transition-colors duration-200 ${
                  isFav
                    ? 'border-accent text-accent'
                    : 'border-white/25 text-white/80 hover:border-white/60 hover:text-white'
                }`}
              >
                <Heart size={18} strokeWidth={1.5} fill={isFav ? 'currentColor' : 'none'} />
              </button>
              <Button onClick={onDownload} disabled={downloading} size="md">
                <Download size={15} strokeWidth={2} />
                {downloading ? 'Guardando…' : 'Descargar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
