interface HomeHeaderProps {
  firstName?: string
  dateLabel: string
}

/**
 * Cabecera compacta del home app: saludo corto + fecha del evento en eyebrow.
 * Nada de hero gigante — arranca como una app, no como una revista.
 */
export function HomeHeader({ firstName, dateLabel }: HomeHeaderProps) {
  return (
    <header className="animate-rise">
      <div className="eyebrow text-[10px] text-accent">{dateLabel}</div>
      <h1 className="type-display mt-2 text-balance text-[clamp(1.9rem,7.5vw,2.6rem)] leading-[1.04] text-ink">
        {firstName ? (
          <>
            Hola, <em className="text-accent">{firstName}</em>
          </>
        ) : (
          <>
            Bienvenida/o a <em className="text-accent">CCM</em>
          </>
        )}
      </h1>
    </header>
  )
}
