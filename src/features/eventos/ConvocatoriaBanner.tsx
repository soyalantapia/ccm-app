import { ButtonLink, Eyebrow } from '../../components/ui'
import { useStore } from '../../data/store'
import { IDS } from '../../data/ids'

/** Banner editorial night → /c/camino-a-ccm (fichas de eventos Camino). */
export function ConvocatoriaBanner() {
  const convocatoria = useStore((s) => s.getConvocatoria(IDS.convocatoriaSlugs.camino))
  if (!convocatoria) return null
  return (
    <section className="bg-night">
      <div className="mx-auto max-w-6xl items-center justify-between gap-10 px-5 py-16 md:flex md:py-20">
        <div className="max-w-xl">
          <Eyebrow>Convocatoria abierta</Eyebrow>
          <h2 className="type-display mt-4 text-[clamp(2rem,6vw,3.4rem)] text-balance text-night-ink">
            ¿Querés ser parte del <em className="text-accent">desfile</em>?
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-night-ink/70">
            Contanos tu historia y postulate a los encuentros que nos llevan a la 14ª edición. Vení
            con tu mejor LOOK 🖤
          </p>
        </div>
        <ButtonLink to={`/c/${convocatoria.slug}`} size="lg" className="mt-8 shrink-0 md:mt-0">
          Postulate
        </ButtonLink>
      </div>
    </section>
  )
}
