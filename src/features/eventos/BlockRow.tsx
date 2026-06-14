import { useEffect, useRef } from 'react'
import { Badge, Button, toast } from '../../components/ui'
import { store, useStore } from '../../data/store'
import { requireProfile } from '../../lib/profileRequest'
import type { EventBlock } from '../../data/types'

/**
 * Fila de la grilla de bloques: horario serif, kind eyebrow, sala y speakers,
 * con disponibilidad EN VIVO (cupo seed + inscripciones locales) e inscripción D22.
 * Renderizar SIEMPRE con key={block.id} (la reactividad del selector depende del remount).
 */
export function BlockRow({ block }: { block: EventBlock }) {
  const availability = useStore((s) => s.blockAvailability(block.id))
  const registration = useStore((s) =>
    s
      .getRegistrations()
      .find((r) => r.status === 'confirmada' && r.eventId === block.eventId && r.blockId === block.id),
  )

  /* block_view (PRD §13): se emite una sola vez al entrar el bloque en viewport. */
  const ref = useRef<HTMLElement>(null)
  const viewed = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !viewed.current) {
          viewed.current = true
          store.track('block_view', { blockId: block.id, eventId: block.eventId })
          observer.disconnect()
        }
      },
      { threshold: 0.5 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [block.id, block.eventId])

  const onRegister = async () => {
    const ok = await requireProfile(
      ['firstName', 'lastName', 'email', 'profession'],
      'inscripcion_bloque',
      {
        title: 'Para inscribirte necesitamos estos datos',
        message: 'Una sola vez: no te lo volvemos a pedir.',
      },
    )
    if (!ok) return
    const created = store.register(block.eventId, block.id)
    if (created) toast('Inscripción confirmada ✓')
    else toast('Ese bloque ya está completo', 'info')
  }

  const onCancel = () => {
    if (!registration) return
    const eventId = registration.eventId
    const blockId = registration.blockId
    store.cancelRegistration(registration.id)
    toast('Inscripción cancelada', {
      tone: 'info',
      action: {
        label: 'Deshacer',
        onClick: () => {
          const restored = store.register(eventId, blockId)
          if (restored) toast('Inscripción confirmada ✓')
          else toast('Ese bloque ya está completo', 'info')
        },
      },
    })
  }

  return (
    <article ref={ref} className="grid gap-4 border-t border-line py-7 md:grid-cols-[7.5rem_1fr_auto] md:gap-8">
      <div>
        <div className="type-serif text-2xl text-ink">{block.start}</div>
        <div className="mt-0.5 text-xs text-ink-soft">a {block.end} hs</div>
      </div>

      <div>
        <div className="eyebrow text-[10px] text-accent">{block.kind}</div>
        <h3 className="type-serif mt-1.5 text-xl text-ink">{block.title}</h3>
        <p className="mt-1.5 text-sm text-ink-soft">
          {block.room}
          {block.speakers.length > 0 && <> · {block.speakers.join(' · ')}</>}
        </p>
        {block.description && (
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft/80">{block.description}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 md:flex-col md:items-end">
        {registration ? (
          <>
            <Badge tone="success">Ya estás inscripto</Badge>
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancelar
            </Button>
          </>
        ) : availability.full ? (
          <>
            <Badge tone="danger">Completo</Badge>
            <Button size="sm" disabled>
              Inscribime
            </Button>
          </>
        ) : (
          <>
            <Badge tone="success">
              {availability.left === 1 ? 'Queda 1 lugar' : `Quedan ${availability.left} lugares`}
            </Badge>
            <Button size="sm" onClick={() => void onRegister()}>
              Inscribime
            </Button>
          </>
        )}
      </div>
    </article>
  )
}
