import { Link } from 'react-router-dom'
import { GraduationCap, Mic } from 'lucide-react'
import { AdBanner, ButtonLink, SectionTitle } from '../../components/ui'
import { useStore } from '../../data/store'
import { config } from '../../config'
import { NoticiaCard, SectionLabel, VideoThumb } from '../../features/app/mockup'
import { WelcomeSheet } from '../../features/app/WelcomeSheet'

/** Noticias (feed) — mockup: franja evento → banners → noticias → Elukamo accesos →
 *  membresía → más noticias → carrusel de video. Todo con data real (notas/contents).
 *  Mobile = mockup 1:1; desktop (`lg:`) = revista ancha con hero editorial. */
export default function Inicio() {
  const notas = useStore((s) => s.getNotas())
  const contents = useStore((s) => s.getContents())
  const [featured, ...restNotas] = notas
  const masNoticias = restNotas.slice(2, 6)

  return (
    <div className="mx-auto max-w-2xl pb-6 lg:max-w-6xl lg:pb-16">
      {/* Cabecera editorial — solo desktop (estándar de página del sitio) */}
      <div className="hidden lg:block lg:px-8 lg:pt-14">
        <SectionTitle
          eyebrow={`CCM 2026 · ${config.mainDatesLabel}`}
          title="Noticias"
          lead="Lo que pasa en el ecosistema CCM: novedades, plataformas y contenido en video."
          action={
            <ButtonLink to="/entradas" size="lg">
              Inscribite
            </ButtonLink>
          }
        />
      </div>

      {/* Franja evento inline — mobile (mockup 1:1) */}
      <div className="flex items-center justify-between gap-3 bg-ink px-5 py-3 lg:hidden">
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

      <div className="px-5 lg:px-8">
        <AdBanner slot="S2" className="mt-3.5 lg:mt-6" />

        {/* Noticias: 1 featured (hero full-width en desktop) + 2 */}
        {featured && (
          <>
            <SectionLabel>Noticias</SectionLabel>
            {/* Con UNA sola nota secundaria, en desktop va al lado del hero
                (grilla de 3) en vez de quedar huérfana a media columna. */}
            <div
              className={`grid grid-cols-2 gap-2.5 lg:gap-5 ${
                restNotas.slice(0, 2).length === 1 ? 'lg:grid-cols-3' : ''
              }`}
            >
              <NoticiaCard n={featured} featured />
              {restNotas.slice(0, 2).map((n) => (
                <NoticiaCard key={n.id} n={n} />
              ))}
            </div>
          </>
        )}

        <AdBanner slot="S2" index={1} className="mt-4 lg:mt-8" />

        {/* Elukamo accesos */}
        <SectionLabel>Elukamo</SectionLabel>
        <div className="grid grid-cols-2 gap-2.5 lg:gap-5">
          <Link to="/contenido" className="flex flex-col gap-1.5 rounded-[12px] bg-ink p-3.5 lg:gap-2.5 lg:rounded-[16px] lg:p-6">
            <Mic size={20} className="text-accent lg:hidden" />
            <Mic size={28} className="hidden text-accent lg:block" />
            <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-accent lg:text-[10px]">Elukamo</span>
            <span className="type-serif text-[13px] text-night-ink lg:text-[18px]">Entrevistas</span>
            <span className="text-[9px] font-semibold text-accent lg:text-[11px]">Ver todas →</span>
          </Link>
          <Link to="/membresia" className="flex flex-col gap-1.5 rounded-[12px] bg-ink p-3.5 lg:gap-2.5 lg:rounded-[16px] lg:p-6">
            <GraduationCap size={20} className="text-accent lg:hidden" />
            <GraduationCap size={28} className="hidden text-accent lg:block" />
            <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-accent lg:text-[10px]">Elukamo</span>
            <span className="type-serif text-[13px] text-night-ink lg:text-[18px]">Capacitaciones</span>
            <span className="text-[9px] font-semibold text-accent lg:text-[11px]">Ver todas →</span>
          </Link>
        </div>

        {/* Más noticias */}
        {masNoticias.length > 0 && (
          <>
            <SectionLabel>Más noticias</SectionLabel>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-5">
              {masNoticias.map((n) => (
                <NoticiaCard key={n.id} n={n} />
              ))}
            </div>
          </>
        )}

        {/* Membresía CTA (gradiente dorado) */}
        <Link
          to="/membresia"
          className="mt-4 flex items-center justify-between gap-3 rounded-[12px] bg-gradient-to-br from-accent to-gold-deep px-4 py-3.5 lg:mt-10 lg:rounded-[18px] lg:px-9 lg:py-7"
        >
          <div className="min-w-0">
            <div className="text-[8px] font-bold uppercase tracking-[0.1em] text-white/70 lg:text-[10px]">Membresía</div>
            <div className="type-display mt-0.5 text-[15px] text-white lg:mt-1 lg:text-[24px]">Socio CCM VIP</div>
            <div className="mt-0.5 truncate text-[9px] text-white/75 lg:text-[13px]">Capacitaciones · descuentos · eventos VIP</div>
          </div>
          <span className="shrink-0 rounded-[8px] bg-white px-3.5 py-2 text-[10px] font-bold uppercase text-accent lg:rounded-[10px] lg:px-6 lg:py-3.5 lg:text-[12px]">
            Quiero ser VIP
          </span>
        </Link>

        {/* Noticias en video (carrusel) */}
        {contents.length > 0 && (
          <>
            <SectionLabel>Noticias en video</SectionLabel>
            {/* Mobile: carrusel táctil. Desktop: grilla (el carrusel dejaba 1/3 vacío). */}
            <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:px-0">
              {contents.slice(0, 8).map((c) => (
                <VideoThumb key={c.id} c={c} />
              ))}
            </div>
          </>
        )}

        <AdBanner slot="S2" index={2} className="mt-6 lg:mt-10" />
      </div>

      <WelcomeSheet />
    </div>
  )
}
