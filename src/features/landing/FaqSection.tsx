import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { SectionTitle } from '../../components/ui'
import { config } from '../../config'
import { IDS } from '../../data/ids'

const linkClass = 'font-semibold text-ink underline decoration-accent underline-offset-4 transition-colors hover:text-accent'

const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: '¿Qué gano si me registro?',
    a: 'Sorteos, descuentos y beneficios exclusivos antes, durante y después del evento. Registrarte es gratis y te toma menos de un minuto: no te pedimos contraseña.',
  },
  {
    q: '¿La entrada es gratuita?',
    a: 'Sí. La entrada general es gratuita con inscripción previa obligatoria: sin inscripción no se ingresa.',
  },
  {
    q: '¿Hay cupos?',
    a: 'Sí, los cupos son limitados. Inscribite cuanto antes para asegurar tu lugar.',
  },
  {
    q: '¿Dónde es y cómo llego?',
    a: (
      <>
        En el {config.venue.name}, {config.venue.address}.{' '}
        <a href={config.venue.mapsUrl} target="_blank" rel="noreferrer" className={linkClass}>
          Cómo llegar
        </a>
        .
      </>
    ),
  },
  {
    q: '¿Hay estacionamiento?',
    a: 'Sí: estacionamiento sin cargo en el Shopping Nuevo Centro.',
  },
  {
    q: '¿En qué horario es el evento?',
    a: 'De 9 a 21 hs, ambas jornadas: sábado 19 y domingo 20 de septiembre.',
  },
  {
    q: '¿Qué incluye la entrada general?',
    a: 'Acceso a las 7 plataformas, +100 stands interactivos, pasarelas y workshops durante las dos jornadas.',
  },
  {
    q: '¿Qué son las galas VIP y cómo las compro?',
    a: (
      <>
        Son las dos pasarelas centrales con acceso pago: Night VIP + Desfile de las Estrellas (sábado 19, 19 a 21 hs)
        y Sunset VIP + Desfile Internacional (domingo 20, 18 a 20 hs). Comprá la tuya en{' '}
        <Link to="/entradas" className={linkClass}>
          Entradas
        </Link>
        .
      </>
    ),
  },
  {
    q: '¿Hay espacios de networking?',
    a: 'Sí: networking y coworking durante las dos jornadas, pensados para conectar con las +250 unidades de negocio del ecosistema.',
  },
  {
    q: '¿Cómo me postulo para participar?',
    a: (
      <>
        A través de los Caminos a CCM: completá la postulación con tu historia y tu portfolio, y el equipo confirma tu
        lugar.{' '}
        <Link to={`/c/${IDS.convocatoriaSlugs.camino}`} className={linkClass}>
          Postulate acá
        </Link>
        .
      </>
    ),
  },
  {
    q: '¿Quién organiza CCM?',
    a: (
      <>
        Córdoba Corazón de Moda, en su 14ª edición consecutiva. Produce {config.produceCredit}. Seguinos en Instagram:{' '}
        {config.instagramHandle}.
      </>
    ),
  },
]

/** FAQ (PRD §6.1.11) — acordeón editorial con los 11 ítems reales. */
export function FaqSection() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <div className="grid gap-10 md:grid-cols-12 md:gap-8">
        <div className="md:col-span-4">
          <SectionTitle
            eyebrow="Preguntas frecuentes"
            title={
              <>
                Todo lo que <em className="italic text-accent">querés</em> saber
              </>
            }
          />
        </div>
        <div className="md:col-span-8">
          {FAQS.map((item, i) => (
            <details key={item.q} className="group border-t border-line last:border-b">
              <summary className="flex cursor-pointer list-none items-baseline justify-between gap-6 py-5 [&::-webkit-details-marker]:hidden">
                <span className="flex items-baseline gap-4">
                  <span className="eyebrow w-7 shrink-0 text-[10px] text-accent">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="type-serif text-lg leading-snug text-ink transition-colors group-open:text-accent md:text-xl">
                    {item.q}
                  </span>
                </span>
                <Plus
                  size={18}
                  className="shrink-0 self-center text-ink-soft transition-transform duration-300 group-open:rotate-45"
                  strokeWidth={1.5}
                />
              </summary>
              <div className="pb-6 pl-11 pr-2 text-[15px] leading-relaxed text-ink-soft md:pr-10">{item.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
