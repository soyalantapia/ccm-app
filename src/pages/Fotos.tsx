import { useMemo, useState } from 'react'
import { Heart } from 'lucide-react'
import { Button, EmptyState, Img, SectionTitle, Tabs } from '../components/ui'
import { useStore } from '../data/store'
import { GalleryCard, PhotoLightbox } from '../features/fotos'

type TabId = 'galerias' | 'favoritos' | 'descargas'

function formatTs(ts: string): string {
  const d = new Date(ts)
  const date = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  return `${date} · ${time} hs`
}

export default function Fotos() {
  const galleries = useStore((s) => s.getGalleries())
  const favorites = useStore((s) => s.getFavorites())
  const downloads = useStore((s) => s.getDownloads())
  const [tab, setTab] = useState<TabId>('galerias')
  const [lightbox, setLightbox] = useState<{ galleryId: string; index: number } | null>(null)

  /* Favoritos: resolver cada photoId dentro de las galerías (con su índice para el modal). */
  const favoriteEntries = useMemo(() => {
    const favSet = new Set(favorites)
    return galleries.flatMap((gallery) =>
      gallery.photos
        .map((photo, index) => ({ gallery, photo, index }))
        .filter((entry) => favSet.has(entry.photo.id)),
    )
  }, [galleries, favorites])

  /* Mis descargas: más recientes primero, con thumbnail resuelto. */
  const downloadEntries = useMemo(
    () =>
      [...downloads]
        .reverse()
        .flatMap((d) => {
          const gallery = galleries.find((g) => g.id === d.galleryId)
          const index = gallery ? gallery.photos.findIndex((p) => p.id === d.photoId) : -1
          if (!gallery || index < 0) return []
          return [{ ts: d.ts, gallery, photo: gallery.photos[index], index }]
        }),
    [downloads, galleries],
  )

  const activeGallery = lightbox ? galleries.find((g) => g.id === lightbox.galleryId) : undefined

  return (
    <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <SectionTitle
        eyebrow="El recuerdo es tuyo"
        title={
          <>
            Fotos <em className="italic text-accent">CCM</em>
          </>
        }
        lead="Las galerías oficiales de cada evento. Guardá tus favoritas con el corazón y descargá tu foto en alta, cortesía de nuestros sponsors."
      />

      <Tabs
        className="mt-10 md:mt-14"
        tabs={[
          { id: 'galerias', label: 'Galerías', count: galleries.length },
          { id: 'favoritos', label: 'Favoritos', count: favoriteEntries.length },
          { id: 'descargas', label: 'Mis descargas', count: downloadEntries.length },
        ]}
        active={tab}
        onChange={(id) => setTab(id as TabId)}
      />

      {tab === 'galerias' && (
        <div className="mt-8 grid animate-rise gap-5 md:grid-cols-2 md:gap-6">
          {galleries.map((gallery, i) => (
            <GalleryCard key={gallery.id} gallery={gallery} featured={i === 0} />
          ))}
        </div>
      )}

      {tab === 'favoritos' &&
        (favoriteEntries.length > 0 ? (
          <div className="mt-8 grid animate-rise grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {favoriteEntries.map(({ gallery, photo, index }) => (
              <button
                key={photo.id}
                onClick={() => setLightbox({ galleryId: gallery.id, index })}
                aria-label={`Ver foto: ${photo.alt}`}
                className="group relative block overflow-hidden rounded-md text-left"
              >
                <Img
                  src={photo.src}
                  alt={photo.alt}
                  ratio="3/4"
                  imgClassName="transition duration-700 group-hover:scale-[1.04]"
                />
                <span className="absolute right-2 top-2 rounded-sm bg-night/55 p-1.5 text-accent">
                  <Heart size={12} strokeWidth={1.5} fill="currentColor" />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Todavía no marcaste favoritas"
            action={
              <Button variant="outline" size="sm" onClick={() => setTab('galerias')}>
                Explorar galerías
              </Button>
            }
          >
            Tocá el corazón en cualquier foto y queda guardada acá.
          </EmptyState>
        ))}

      {tab === 'descargas' &&
        (downloadEntries.length > 0 ? (
          <div className="mt-8 animate-rise border-t border-line">
            {downloadEntries.map((entry, i) => (
              <button
                key={`${entry.photo.id}-${entry.ts}-${i}`}
                onClick={() => setLightbox({ galleryId: entry.gallery.id, index: entry.index })}
                className="flex w-full items-center gap-4 border-b border-line py-4 text-left transition-colors duration-200 hover:bg-ink/5"
              >
                <Img
                  src={entry.photo.src}
                  alt={entry.photo.alt}
                  ratio="1/1"
                  className="w-16 shrink-0 rounded-sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{entry.photo.alt}</p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {entry.gallery.title} · {formatTs(entry.ts)}
                  </p>
                </div>
                <span className="eyebrow shrink-0 text-[10px] text-accent">Ver</span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Todavía no descargaste fotos"
            action={
              <Button variant="outline" size="sm" onClick={() => setTab('galerias')}>
                Explorar galerías
              </Button>
            }
          >
            Abrí una galería, elegí tu foto y llevátela en alta calidad.
          </EmptyState>
        ))}

      {activeGallery && (
        <PhotoLightbox
          gallery={activeGallery}
          index={lightbox?.index ?? null}
          onClose={() => setLightbox(null)}
          onNavigate={(i) => setLightbox((prev) => (prev ? { ...prev, index: i } : prev))}
        />
      )}
    </section>
  )
}
