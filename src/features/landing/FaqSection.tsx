import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { SectionTitle } from '../../components/ui'
import { config } from '../../config'
import { IDS } from '../../data/ids'

const linkClass = 'font-semibold text-ink underline decoration-accent underline-offset-4 transition-colors hover:text-accent'

/** Las preguntas reales de la página oficial del evento (Tikealo). */
const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: '🎁 ¿Qué beneficios tiene registrarse?',
    a: 'Sorteos, descuentos y beneficios exclusivos antes, durante y después del evento — además de tu QR de acceso siempre a mano. Registrarte es gratis y sin contraseña.',
  },
  {
    q: '📝 ¿Cómo me inscribo?',
    a: 'Tocá "Registrate gratis": te pedimos nombre, email y profesión una sola vez, y tu acreditación con QR queda lista al instante en Mi QR.',
  },
  {
    q: '🎟️ ¿La entrada es gratuita?',
    a: 'Sí. La acreditación general ("Primera Pasada") de sábado y domingo es gratuita con inscripción previa obligatoria.',
  },
  {
    q: '🌟 ¿Qué incluye la entrada general?',
    a: 'Acceso a las 7 plataformas, +100 stands interactivos, pasarelas Primavera/Verano, workshops, degustaciones, intervenciones artísticas y los espacios de networking, durante toda la jornada.',
  },
  {
    q: '✨ ¿Qué son las experiencias exclusivas?',
    a: (
      <>
        Las dos noches premium con acceso independiente: Night VIP + Desfile de las Estrellas (sábado 19
        a 21 hs) y Sunset VIP + Desfile Internacional (domingo 18 a 20 hs), con desfiles exclusivos,
        música en vivo, degustaciones y shows. También hay un combo de las dos noches.{' '}
        <Link to={`/eventos/${IDS.slugs.principal}#entradas`} className={linkClass}>
          Ver precios y comprar
        </Link>
        .
      </>
    ),
  },
  {
    q: '📍 ¿Cuándo y dónde se realiza el evento?',
    a: (
      <>
        Sábado 19 (9 a 21 hs) y domingo 20 de septiembre (9 a 20 hs) en el {config.venue.name},{' '}
        {config.venue.address}.{' '}
        <a href={config.venue.mapsUrl} target="_blank" rel="noreferrer" className={linkClass}>
          Mostrar mapa
        </a>
        .
      </>
    ),
  },
  {
    q: '⚠️ ¿Qué pasa si no me registro?',
    a: 'Sin inscripción no se ingresa. La entrada es gratuita pero la inscripción previa es obligatoria y los cupos son limitados.',
  },
  {
    q: '🎫 ¿Cómo compro entradas para los eventos VIP?',
    a: (
      <>
        Desde la{' '}
        <Link to={`/eventos/${IDS.slugs.principal}#entradas`} className={linkClass}>
          ficha del evento
        </Link>{' '}
        o en{' '}
        <Link to="/entradas" className={linkClass}>
          Entradas
        </Link>
        : elegís cantidad y pagás por Mercado Pago. El cargo por servicio se muestra antes de confirmar.
      </>
    ),
  },
  {
    q: '🔥 ¿Hay cupos limitados?',
    a: 'Sí: tanto la entrada general como cada charla, masterclass y experiencia VIP tienen cupo. Cuando un bloque se llena vas a verlo marcado como "Completo".',
  },
  {
    q: '🚗 ¿Hay estacionamiento?',
    a: 'Sí: estacionamiento sin cargo en el Shopping Nuevo Centro.',
  },
  {
    q: '🤝 ¿Se puede hacer networking?',
    a: 'Es uno de los ejes del evento: espacios de networking y coworking durante las dos jornadas, pensados para conectar profesionales, marcas y oportunidades de negocio.',
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
                Todo lo que <em className="text-accent">querés</em> saber
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
