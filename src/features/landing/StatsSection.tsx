import { Eyebrow, Stat } from '../../components/ui'

const STATS: { value: string; label: string; tone?: 'ink' | 'accent' }[] = [
  { value: '+18.000', label: 'Audiencia calificada' },
  { value: '70%', label: 'Mujeres +30 · ABC1' },
  { value: '250+', label: 'Unidades de negocio' },
  { value: '+100', label: 'Stands interactivos' },
  { value: '7', label: 'Plataformas', tone: 'accent' },
]

/** Cifras del deck (PRD §6.1.3) — números grandes serif sobre reglas finas. */
export function StatsSection() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 md:py-20">
      <Eyebrow>CCM en números</Eyebrow>
      <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-5">
        {STATS.map((s) => (
          <Stat
            key={s.label}
            value={s.value}
            label={s.label}
            tone={s.tone ?? 'ink'}
            className="border-t border-line pt-5"
          />
        ))}
      </div>
    </section>
  )
}
