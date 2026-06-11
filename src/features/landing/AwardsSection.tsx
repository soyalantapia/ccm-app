import { Eyebrow, Stat } from '../../components/ui'

/**
 * Premios Internacionales (PRD §6.1.7) — social proof editorial con los
 * reconocimientos reales del deck (sin nombres inventados).
 */
export function AwardsSection() {
  return (
    <section className="border-y border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-12 md:gap-8 md:py-24">
        <div className="md:col-span-4">
          <Eyebrow>Premios Internacionales</Eyebrow>
          <Stat value="+100" label="Premiados internacionales" tone="accent" className="mt-8" />
        </div>
        <div className="md:col-span-8">
          <p className="type-display text-[clamp(1.7rem,4.5vw,2.6rem)] text-balance text-ink">
            Cada edición, los Premios Internacionales CCM distinguen a los{' '}
            <em className="italic text-accent">protagonistas</em> del ecosistema.
          </p>
          <div className="mt-10 space-y-5">
            <div className="flex items-start gap-4 border-t border-line pt-5">
              <span aria-hidden className="eyebrow mt-0.5 text-[10px] text-accent">✦</span>
              <p className="text-[15px] leading-relaxed text-ink-soft">
                Declarado de beneplácito por el <strong className="font-semibold text-ink">Concejo Deliberante de Córdoba</strong>.
              </p>
            </div>
            <div className="flex items-start gap-4 border-t border-line pt-5">
              <span aria-hidden className="eyebrow mt-0.5 text-[10px] text-accent">✦</span>
              <p className="text-[15px] leading-relaxed text-ink-soft">
                De interés general, cultural y turístico por la{' '}
                <strong className="font-semibold text-ink">Legislatura de la Provincia de Córdoba</strong>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
