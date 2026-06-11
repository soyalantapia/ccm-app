import { Link } from 'react-router-dom'
import type { EventItem } from '../../data/types'
import { ButtonLink, Card, Eyebrow } from '../../components/ui'

/** Pantalla de éxito editorial que reemplaza al form tras enviar la postulación. */
export function ConvocatoriaSuccess({ event }: { event?: EventItem }) {
  return (
    <Card tone="night" className="overflow-hidden">
      <div className="flex flex-col items-center px-6 py-16 text-center md:px-16 md:py-24 animate-rise">
        <Eyebrow>Postulación enviada</Eyebrow>
        <h2 className="type-display mt-5 text-[clamp(2rem,7vw,3.6rem)] text-balance text-night-ink">
          ¡Listo! Quedaste <em className="italic text-accent">preinscripta/o</em> 🖤
        </h2>
        <p className="mt-6 max-w-md text-[15px] leading-relaxed text-night-ink/75">
          El equipo CCM revisa tu historia y te confirma el lugar por teléfono. Máximo 1
          acompañante.
        </p>
        <div className="mt-10 flex flex-col items-center gap-5">
          <ButtonLink to={event ? `/eventos/${event.slug}` : '/eventos'} size="lg">
            Mientras tanto, inscribite al encuentro
          </ButtonLink>
          <Link
            to="/perfil"
            className="eyebrow text-[11px] text-night-ink/80 transition-colors hover:text-accent hover:underline hover:decoration-accent hover:underline-offset-4"
          >
            Ver mi postulación
          </Link>
        </div>
      </div>
    </Card>
  )
}
