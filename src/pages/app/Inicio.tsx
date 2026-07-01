import { Link } from 'react-router-dom'
import { GraduationCap, Mic } from 'lucide-react'
import { AdBanner } from '../../components/ui'
import { useStore } from '../../data/store'
import { config } from '../../config'
import { NoticiaCard, SectionLabel, VideoThumb } from '../../features/app/mockup'
import { WelcomeSheet } from '../../features/app/WelcomeSheet'

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
