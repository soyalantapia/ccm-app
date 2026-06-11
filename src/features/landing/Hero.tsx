import { useNavigate } from 'react-router-dom'
import { Button, ButtonLink, Countdown, Eyebrow, Img } from '../../components/ui'
import { registerFree } from '../../lib/actions'
import { useStore } from '../../data/store'
import { IDS } from '../../data/ids'
import { config } from '../../config'

/**
 * Hero editorial (PRD §6.1.2) — composición asimétrica tipo portada de revista:
 * claim display gigante que invade la columna de la foto, folio "Nº 14",
 * countdown y CTAs en la fila inferior.
 */
export function Hero() {
  const navigate = useNavigate()
  const registered = useStore((s) => s.isRegistered(IDS.events.principal))

  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-5 pb-16 pt-10 md:pb-24 md:pt-16">
        <div className="grid gap-10 md:grid-cols-12 md:grid-rows-[auto_auto] md:gap-x-8">
          {/* Claim */}
          <div className="relative z-10 animate-rise md:col-span-7 md:-mr-12">
            <Eyebrow>14ª Edición · 19 y 20 de septiembre 2026</Eyebrow>
            <h1 className="type-display mt-6 text-[clamp(2.6rem,9vw,5.5rem)] text-balance text-ink">
              El <em className="italic text-accent">Ecosistema</em> de Negocios y{' '}
              <em className="italic">Tendencias</em> más influyente del interior del país
            </h1>
            <p className="type-serif mt-6 text-lg text-ink-soft md:text-xl">
              {config.venue.name} · Córdoba · 9 a 21 hs
            </p>
          </div>

          {/* Foto portada */}
          <div className="relative animate-rise md:col-span-5 md:row-span-2 md:mt-4">
            <span
              aria-hidden
              className="absolute -bottom-4 -right-3 h-full w-full rounded-md border border-accent md:-right-4"
            />
            <Img
              src="img/hero/hero-main.jpg"
              alt="Pasarela de la 14ª edición de Córdoba Corazón de Moda"
              ratio="4/5"
              priority
              className="rounded-md"
            />
            <span
              aria-hidden
              className="type-display absolute -top-5 left-4 italic text-accent text-5xl md:-left-6 md:text-6xl"
            >
              Nº14
            </span>
            <div className="eyebrow mt-4 flex items-center justify-between text-[9px] text-ink-soft">
              <span>{config.venue.name}</span>
              <span>Córdoba · ARG</span>
            </div>
          </div>

          {/* Countdown + CTAs */}
          <div className="md:col-span-7 md:self-end">
            <Countdown to={config.countdownTo} />
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={() => void registerFree(navigate)}>
                {registered ? 'Ver mi QR' : 'Registrate gratis'}
              </Button>
              <ButtonLink to="/entradas" variant="outline" size="lg">
                Entradas VIP
              </ButtonLink>
            </div>
            <p className="mt-5 max-w-md text-[13px] leading-relaxed text-ink-soft">
              Entrada gratuita con inscripción previa obligatoria. Cupos limitados.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
