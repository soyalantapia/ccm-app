import { Sparkles } from 'lucide-react'
import { Badge, Eyebrow, EmptyState, SectionTitle } from '../../components/ui'
import { store, useStore } from '../../data/store'
import type { EventBlock, EventItem } from '../../data/types'
import { TicketSelector } from '../tickets/TicketSelector'
import { formatMoney } from '../tickets/format'
import { vipDesde } from '../tickets/vipDesde'
import { BlockRow } from './BlockRow'
import { blockSortKey, dayLabel } from './eventMeta'

/** Contenido real de la página oficial del evento (Tikealo, 06/2026). */
const VIVIR = [
  'Pasarelas de moda Primavera/Verano',
  'Stands interactivos de marcas y emprendimientos',
  'Workshops, lanzamientos y experiencias en vivo',
  'Degustaciones y propuestas gastronómicas',
  'Presentaciones de destinos turísticos',
  'Intervenciones artísticas y shows',
  'Innovación en tecnología e inteligencia artificial',
  'Espacios de sostenibilidad y economía circular',
]

const POR_QUE = [
  'Conocer las últimas tendencias del mercado',
  'Conectar con marcas, profesionales y oportunidades de negocio',
  'Vivir experiencias únicas de múltiples industrias en un solo lugar',
  'Ser parte de un evento con impacto cultural, turístico y económico',
]

const EXPERIENCIAS = [
  { name: 'Night VIP', show: 'Desfile de las Estrellas', when: 'Sábado 19 · 19 a 21 hs' },
  { name: 'Sunset VIP', show: 'Desfile Internacional', when: 'Domingo 20 · 18 a 20 hs' },
]

/**
 * Cuerpo de la ficha del evento principal: la compra vive ADENTRO del evento
 * (selector arriba de todo), seguida de la información real de la expo,
 * la agenda por bloques y el director general.
 */
export function PrincipalBody({ event }: { event: EventItem }) {
  // El más barato de los VIP, no el primero de la lista (ver features/tickets/vipDesde).
  const vipFrom = useStore((s) => vipDesde(s.getPlans(event.id)))

  const sortedBlocks = [...store.getBlocks(event.id)].sort((a, b) =>
    blockSortKey(a).localeCompare(blockSortKey(b)),
  )
  const days = new Map<string, EventBlock[]>()
  for (const block of sortedBlocks) {
    const list = days.get(block.day)
    if (list) list.push(block)
    else days.set(block.day, [block])
  }
  const dayEntries = [...days.entries()]

  return (
    <>
      {/* ─── Entradas (la acción principal, primero) ─── */}
      <section id="entradas" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-12 md:py-16">
        <div className="md:grid md:grid-cols-12 md:gap-10">
          <div className="md:col-span-4">
            <SectionTitle
              eyebrow="Entradas"
              title={
                <>
                  Asegurá tu <em className="text-accent">lugar</em>
                </>
              }
              lead="La entrada general es gratuita con inscripción obligatoria. Las experiencias VIP se compran acá mismo."
            />
          </div>
          <div className="mt-8 md:col-span-8 md:mt-0">
            <TicketSelector eventId={event.id} />
          </div>
        </div>
      </section>

      {/* ─── Información del evento (copy real) ─── */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-5 py-12 md:py-16">
          <div className="max-w-2xl">
            <Eyebrow>Información del evento</Eyebrow>
            <p className="mt-6 text-[15px] leading-relaxed text-ink md:text-lg md:leading-relaxed">
              {event.description}
            </p>
          </div>

          <div className="mt-10 md:mt-14">
            <Eyebrow>Durante la expo vas a vivir</Eyebrow>
            <ul className="mt-6 grid gap-x-10 gap-y-3 md:grid-cols-2">
              {VIVIR.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[15px] leading-relaxed text-ink-soft">
                  <span aria-hidden className="mt-2.5 inline-block h-px w-5 shrink-0 bg-accent" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ─── Experiencias especiales (acceso independiente) ─── */}
      <section className="bg-night text-night-ink">
        <div className="mx-auto max-w-6xl px-5 py-12 md:py-16">
          <SectionTitle
            tone="night"
            eyebrow="Experiencias especiales"
            title={
              <>
                Con acceso <em className="text-accent">independiente</em>
              </>
            }
            lead="Desfiles exclusivos, música en vivo, shows y experiencias premium dentro del evento."
          />
          {/* <a> nativo al hash: React Router no scrollea a #entradas por defecto — el CTA quedaba muerto */}
          <div className="mt-8 grid gap-4 md:mt-10 md:grid-cols-2">
            {EXPERIENCIAS.map((x) => (
              <a
                key={x.name}
                href="#entradas"
                className="group flex items-center justify-between gap-4 rounded-md border border-night-soft bg-night-soft/40 p-5 transition-colors hover:border-accent/60"
              >
                <div>
                  <div className="eyebrow text-[9px] text-accent">{x.when}</div>
                  <div className="type-display mt-1.5 text-2xl md:text-3xl">{x.name}</div>
                  <div className="type-serif mt-0.5 text-base text-night-ink/75">{x.show}</div>
                </div>
                <div className="shrink-0 text-right">
                  {vipFrom !== null && (
                    <div className="type-serif text-lg">{formatMoney(vipFrom)}</div>
                  )}
                  <div className="eyebrow mt-1 text-[9px] text-night-ink/50 transition-colors group-hover:text-accent">
                    Comprar ↑
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Por qué asistir ─── */}
      <section className="mx-auto max-w-6xl px-5 py-12 md:py-16">
        <Eyebrow>¿Por qué asistir?</Eyebrow>
        <div className="mt-6 grid gap-x-10 gap-y-6 md:grid-cols-2">
          {POR_QUE.map((reason, i) => (
            <div key={reason} className="flex items-start gap-4">
              <span className="eyebrow w-7 shrink-0 pt-1 text-[10px] text-accent">
                {String(i + 1).padStart(2, '0')}
              </span>
              <p className="type-serif text-lg leading-snug text-ink md:text-xl">{reason}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Agenda por bloques (cupos en vivo) ─── */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-5 py-12 md:py-16">
          <SectionTitle
            eyebrow="Agenda · inscripción por bloque"
            title={
              <>
                El <em className="text-accent">programa</em>
              </>
            }
            lead="Charlas, masterclasses y desfiles con cupo limitado. La disponibilidad se actualiza en vivo."
          />
          {dayEntries.length === 0 ? (
            <EmptyState title="La grilla se publica pronto" className="mt-10 border-t border-line">
              Las charlas, masterclasses y desfiles se anuncian acá.
            </EmptyState>
          ) : (
            <div className="mt-10 border-b border-line md:mt-14">
              {dayEntries.map(([day, dayBlocks], i) => (
                <div key={day} className={i > 0 ? 'mt-4' : ''}>
                  {dayEntries.length > 1 && <Eyebrow className="pb-5 pt-2">{dayLabel(day)}</Eyebrow>}
                  {dayBlocks.map((block) => (
                    <BlockRow key={block.id} block={block} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ─── Director General ─── */}
      <section className="mx-auto max-w-6xl px-5 pb-16 md:pb-24">
        <div className="rounded-md border border-line bg-surface p-6 md:p-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-10">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-night">
              <span className="type-display text-2xl text-night-ink">NM</span>
            </div>
            <div className="min-w-0">
              <Eyebrow>Director General</Eyebrow>
              <h3 className="type-display mt-2 text-3xl text-ink md:text-4xl">Néstor Moio</h3>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
                Asesor de imagen · Speaker internacional · Coach empresarial · Fotógrafo de moda ·
                CEO Planeta Moio · Creador de Expo Córdoba Corazón de Moda
              </p>
            </div>
            <div className="md:ml-auto">
              <Badge tone="accent" className="whitespace-nowrap">
                <Sparkles size={11} /> 14ª edición consecutiva
              </Badge>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
