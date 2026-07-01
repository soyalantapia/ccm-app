import { Link } from 'react-router-dom'
import { GraduationCap, Mic, Play } from 'lucide-react'
import { AdBanner } from '../../components/ui'
import { useStore } from '../../data/store'
import { config } from '../../config'
import { SectionLabel } from '../../features/app/mockup'
import { WelcomeSheet } from '../../features/app/WelcomeSheet'
import type { ContentItem, Nota } from '../../data/types'

function fmtDate(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  } catch {
    return ''
  }
}

/** noticia-card de los mockups: img (cover o gradiente con título), tag dorado,
 *  título Playfair, fecha. Variante featured = ancho completo (col-span-2). */
function NoticiaCard({ n, featured = false }: { n: Nota; featured?: boolean }) {
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
        <div className={`type-serif mt-0.5 leading-[1.3] text-ink ${featured ? 'text-[14px]' : 'text-[12px]'}`}>
          {n.title}
        </div>
        <div className="mt-1 text-[8px] text-text-4">{fmtDate(n.publishedAt)}</div>
      </div>
    </Link>
  )
}

/** video-card del carrusel (thumbnail de YouTube + play + tag + título). */
function VideoThumb({ c }: { c: ContentItem }) {
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

/** Noticias (feed) — mockup: franja evento → banners → noticias → Elukamo accesos →
 *  membresía → más noticias → carrusel de video. Todo con data real (notas/contents). */
export default function Inicio() {
  const notas = useStore((s) => s.getNotas())
  const contents = useStore((s) => s.getContents())
  const [featured, ...restNotas] = notas
  const masNoticias = restNotas.slice(2, 6)

  return (
    <div className="mx-auto max-w-2xl pb-6">
      {/* Franja evento inline */}
      <div className="flex items-center justify-between gap-3 bg-ink px-5 py-3">
        <div className="min-w-0">
          <div className="type-serif text-[14px] text-night-ink">CCM 2026 · {config.edition}</div>
          <div className="mt-0.5 truncate text-[10px] font-medium tracking-[0.04em] text-accent">
            {config.mainDatesLabel}
          </div>
        </div>
        <Link
          to="/entradas"
          className="shrink-0 rounded-[5px] bg-accent px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.05em] text-accent-ink"
        >
          Inscribite
        </Link>
      </div>

      <div className="px-5">
        <AdBanner slot="S2" className="mt-3.5" />

        {/* Noticias: 1 featured + 2 */}
        {featured && (
          <>
            <SectionLabel>Noticias</SectionLabel>
            <div className="grid grid-cols-2 gap-2.5">
              <NoticiaCard n={featured} featured />
              {restNotas.slice(0, 2).map((n) => (
                <NoticiaCard key={n.id} n={n} />
              ))}
            </div>
          </>
        )}

        <AdBanner slot="S2" index={1} className="mt-4" />

        {/* Elukamo accesos */}
        <SectionLabel>Elukamo</SectionLabel>
        <div className="grid grid-cols-2 gap-2.5">
          <Link to="/contenido" className="flex flex-col gap-1.5 rounded-[12px] bg-ink p-3.5">
            <Mic size={20} className="text-accent" />
            <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-accent">Elukamo</span>
            <span className="type-serif text-[13px] text-night-ink">Entrevistas</span>
            <span className="text-[9px] font-semibold text-accent">Ver todas →</span>
          </Link>
          <Link to="/membresia" className="flex flex-col gap-1.5 rounded-[12px] bg-ink p-3.5">
            <GraduationCap size={20} className="text-accent" />
            <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-accent">Elukamo</span>
            <span className="type-serif text-[13px] text-night-ink">Capacitaciones</span>
            <span className="text-[9px] font-semibold text-accent">Ver todas →</span>
          </Link>
        </div>

        {/* Más noticias */}
        {masNoticias.length > 0 && (
          <>
            <SectionLabel>Más noticias</SectionLabel>
            <div className="grid grid-cols-2 gap-2.5">
              {masNoticias.map((n) => (
                <NoticiaCard key={n.id} n={n} />
              ))}
            </div>
          </>
        )}

        {/* Membresía CTA (gradiente dorado) */}
        <Link
          to="/membresia"
          className="mt-4 flex items-center justify-between gap-3 rounded-[12px] bg-gradient-to-br from-accent to-gold-deep px-4 py-3.5"
        >
          <div className="min-w-0">
            <div className="text-[8px] font-bold uppercase tracking-[0.1em] text-white/70">Membresía</div>
            <div className="type-display mt-0.5 text-[15px] text-white">Socio CCM VIP</div>
            <div className="mt-0.5 truncate text-[9px] text-white/75">Capacitaciones · descuentos · eventos VIP</div>
          </div>
          <span className="shrink-0 rounded-[8px] bg-white px-3.5 py-2 text-[10px] font-bold uppercase text-accent">
            Quiero ser VIP
          </span>
        </Link>

        {/* Noticias en video (carrusel) */}
        {contents.length > 0 && (
          <>
            <SectionLabel>Noticias en video</SectionLabel>
            <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5">
              {contents.slice(0, 8).map((c) => (
                <VideoThumb key={c.id} c={c} />
              ))}
            </div>
          </>
        )}

        <AdBanner slot="S2" index={2} className="mt-6" />
      </div>

      <WelcomeSheet />
    </div>
  )
}
