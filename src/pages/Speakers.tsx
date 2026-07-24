import { useStore } from '../data/store'
import { ParticipanteCard } from '../features/catalogo/ParticipanteCard'

/** Público: "Corazones que inspiran" — speakers agrupados por evento (Task 5:
 *  store.getSpeakersByEvent()). Reusa la misma card del catálogo (CatalogProfile),
 *  que ya muestra la frase (quote) cuando existe. */
export default function Speakers() {
  const grupos = useStore((s) => s.getSpeakersByEvent())

  return (
    <section className="mx-auto max-w-2xl px-5 pb-6 lg:max-w-6xl lg:px-8">
      <header className="py-8 lg:py-12">
        <h1 className="type-display text-[clamp(2rem,6vw,3.4rem)] text-ink">Corazones que inspiran</h1>
        <p className="mt-3 max-w-xl text-ink-soft">Quienes dan las charlas y workshops de cada edición.</p>
      </header>

      {grupos.length === 0 ? (
        <p className="py-12 text-center text-ink-soft">Pronto anunciamos a los speakers.</p>
      ) : (
        grupos.map((g) => (
          <div key={g.eventId} className="mb-12">
            <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-wider text-accent-strong">
              {g.eventTitle}
            </h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
              {g.speakers.map((p) => (
                <ParticipanteCard key={p.id} profile={p} />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  )
}
