import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check, QrCode, ScanLine } from 'lucide-react'
import { Button, ButtonLink, Eyebrow, EmptyState, Stat } from '../components/ui'
import { requireProfile } from '../lib/profileRequest'
import { store, useStore } from '../data/store'
import { IDS } from '../data/ids'
import { findSponsorBySlug, sponsorMonogram, sponsorSlug } from '../features/stand/sponsorSlug'

/* Qué se lleva el visitante por dejar sus datos en el stand (beneficio editable). */
const PERKS = [
  {
    title: 'Sumás al sorteo',
    body: 'Cada registro entra automáticamente al sorteo del stand. Lo anunciamos en vivo al cierre de la jornada.',
  },
  {
    title: 'Accedés al beneficio',
    body: 'Mostrás esta pantalla en el stand y desbloqueás la promoción exclusiva para asistentes CCM 2026.',
  },
  {
    title: 'Te llega el contenido',
    body: 'Recibís novedades, lanzamientos y la cobertura del evento directo, sin pasar por redes.',
  },
]

/* La lectura B2B: por qué el stand con QR vale para el sponsor (gancho del pitch). */
const VALUE = [
  {
    number: '01',
    title: 'Lead calificado, no un volante',
    body: 'Cada escaneo es un perfil con nombre, apellido, email y teléfono — gente que eligió acercarse a tu marca, no una impresión anónima.',
  },
  {
    number: '02',
    title: 'Medible en tiempo real',
    body: 'Los leads del stand aparecen en tu reporte mientras el evento sucede. Sabés qué activación funciona y cuál no, sin esperar al lunes.',
  },
  {
    number: '03',
    title: 'Datos propios y con consentimiento',
    body: 'La base queda asociada a tu marca, lista para mailing segmentado y retargeting. Es tu activo, no el de una plataforma ajena.',
  },
]

export default function Stand() {
  const { slug } = useParams()
  const sponsors = useStore((s) => s.getSponsors())
  const [done, setDone] = useState(false)

  /* Resuelve el sponsor por slug; sin slug, cae al Principal (Banco Distrito). */
  const sponsor = useMemo(() => {
    if (slug) return findSponsorBySlug(sponsors, slug)
    return store.getSponsor(IDS.sponsors.banco) ?? sponsors.find((s) => s.level === 'Principal')
  }, [slug, sponsors])

  const sponsorId = sponsor?.id
  useEffect(() => {
    setDone(false)
    if (sponsorId) store.track('stand_view', { sponsorId, slug: slug ?? null })
  }, [sponsorId, slug])

  /* Sponsor inexistente: el QR apunta a un stand que ya no está. */
  if (!sponsor) {
    return (
      <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <EmptyState
          title="No encontramos este stand"
          action={
            <ButtonLink to="/sponsors" variant="outline" size="sm">
              Ver todas las marcas
            </ButtonLink>
          }
        >
          El código que escaneaste no corresponde a ningún stand activo de CCM 2026. Puede que el
          enlace esté mal escrito o que la activación ya haya cerrado.
        </EmptyState>
      </section>
    )
  }

  const monogram = sponsorMonogram(sponsor.name)
  const firstName = store.getProfile().fields.firstName?.value

  async function register() {
    if (!sponsor) return
    const ok = await requireProfile(['firstName', 'lastName', 'email', 'phone'], 'stand_lead', {
      title: `Registrate en el stand de ${sponsor.name}`,
      message:
        'Dejás tus datos una sola vez y quedás dentro del sorteo y los beneficios del stand. Después no te los volvemos a pedir.',
    })
    if (!ok) return
    store.track('stand_lead_captured', { sponsorId: sponsor.id, slug: slug ?? sponsorSlug(sponsor) })
    setDone(true)
  }

  return (
    <>
      {/* ─── Hero: branding del sponsor (monograma + lockup tipográfico) ─── */}
      <section className="bg-night text-night-ink">
        <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
          <Eyebrow tone="night">Stand · CCM 2026 · Nivel {sponsor.level}</Eyebrow>

          {/* Lockup honesto: monograma en cuadro dorado + nombre como wordmark. */}
          <div className="mt-8 flex items-center gap-5 animate-rise">
            <span
              aria-hidden
              className="type-display flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-accent text-2xl text-accent-ink md:h-20 md:w-20 md:text-3xl"
            >
              {monogram}
            </span>
            <div className="min-w-0">
              <p className="type-display text-[clamp(2rem,8vw,3.6rem)] leading-none text-night-ink">
                {sponsor.name}
              </p>
              <p className="eyebrow mt-2 text-[10px] text-night-ink/55">{sponsor.industry}</p>
            </div>
          </div>

          <p className="mt-8 max-w-xl text-balance type-serif text-xl text-night-ink/90 md:text-2xl">
            {sponsor.tagline}
          </p>

          <p className="mt-6 flex items-center gap-2 text-[13px] text-night-ink/55">
            <ScanLine size={15} className="text-accent" />
            Escaneaste el QR del stand. Estás a un toque de quedar adentro.
          </p>

          <h1 className="type-display mt-10 text-[clamp(1.8rem,6vw,3rem)] text-balance text-night-ink md:mt-12">
            Dejá tus datos en el stand de{' '}
            <em className="text-accent">{sponsor.name}</em> y sumás al sorteo
          </h1>

          {/* ─── Estado activo: CTA · Estado de éxito tras registrar ─── */}
          <div className="mt-10 md:mt-12">
            {done ? (
              <div className="animate-rise rounded-md border border-night-soft bg-night-soft p-7 md:p-8">
                <span
                  aria-hidden
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-ink"
                >
                  <Check size={22} strokeWidth={2.4} />
                </span>
                <p className="type-serif mt-5 text-2xl text-night-ink md:text-3xl">
                  {firstName ? `Listo, ${firstName} — ` : 'Listo — '}quedaste registrado en el stand
                  de <em className="text-accent">{sponsor.name}</em>
                </p>
                <p className="mt-4 max-w-md text-[15px] leading-relaxed text-night-ink/70">
                  Ya estás dentro del sorteo y con el beneficio del stand habilitado. Mostrá esta
                  pantalla al equipo de {sponsor.name} para reclamarlo.
                </p>

                <div className="mt-7 grid gap-px overflow-hidden rounded-md border border-night-soft bg-night-soft sm:grid-cols-3">
                  {PERKS.map((perk) => (
                    <div key={perk.title} className="bg-night p-5">
                      <p className="eyebrow flex items-center gap-2 text-[10px] text-accent">
                        <Check size={13} strokeWidth={2.4} />
                        {perk.title}
                      </p>
                      <p className="mt-2.5 text-[13px] leading-relaxed text-night-ink/65">
                        {perk.body}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <ButtonLink to="/mi-qr" variant="primary" size="lg">
                    Ver mi acreditación
                  </ButtonLink>
                  <span className="text-[13px] text-night-ink/55">
                    Tu QR personal te abre todos los stands del evento.
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <Button size="lg" onClick={register} className="gap-2.5">
                  <QrCode size={16} />
                  Registrarme en el stand
                </Button>
                <span className="max-w-xs text-[13px] leading-relaxed text-night-ink/55">
                  Nombre, apellido, email y teléfono. Una sola vez: no te lo volvemos a pedir.
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ─── Qué ganás vos (beneficio del visitante) ─── */}
      {!done && (
        <section className="border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
            <Eyebrow>Qué te llevás</Eyebrow>
            {/* Título display — solo desktop (estándar de sección del sitio) */}
            <h2 className="type-display mt-4 hidden text-[clamp(1.8rem,4vw,2.6rem)] text-balance text-ink lg:block">
              Tres cosas que te llevás por dejar tus datos
            </h2>
            <div className="mt-8 grid gap-px overflow-hidden rounded-md border border-line bg-line md:mt-10 md:grid-cols-3">
              {PERKS.map((perk) => (
                <div key={perk.title} className="bg-surface p-7 md:p-8">
                  <p className="type-serif text-xl text-ink">{perk.title}</p>
                  <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{perk.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─── La lectura B2B: por qué el stand mide (gancho para Gastón) ─── */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
          <Eyebrow>Para la marca</Eyebrow>
          <h2 className="type-display mt-4 text-[clamp(1.8rem,6vw,3rem)] text-balance text-ink">
            Cada escaneo es un <em className="text-accent">lead</em>, no un volante
          </h2>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-soft md:text-base">
            Esta misma pantalla es el stand de {sponsor.name}: el QR convierte a cada persona que se
            acerca en un contacto calificado, medible y propio. Así se ve la captura de leads del
            evento por dentro.
          </p>

          <div className="mt-12 grid grid-cols-3 gap-x-6 gap-y-10 md:mt-14">
            <Stat value="1 toque" label="Del QR al lead capturado" />
            <Stat value="4 datos" label="Nombre · apellido · email · teléfono" />
            <Stat value="En vivo" label="Visible en el reporte del sponsor" tone="accent" />
          </div>

          <div className="mt-14 md:mt-16">
            {VALUE.map((v) => (
              <article
                key={v.number}
                className="grid gap-y-3 border-t border-line py-10 first:border-t-0 first:pt-0 md:grid-cols-12 md:gap-x-8"
              >
                <span className="type-display text-5xl text-accent md:col-span-2 md:text-6xl">
                  {v.number}
                </span>
                <h3 className="type-serif text-2xl text-ink md:col-span-4 md:text-3xl">{v.title}</h3>
                <p className="text-[15px] leading-relaxed text-ink-soft md:col-span-6">{v.body}</p>
              </article>
            ))}
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-5 border-t border-line pt-10 md:mt-14">
            <ButtonLink to="/sponsors" variant="outline" size="lg">
              Quiero un stand para mi marca
            </ButtonLink>
            <span className="text-[13px] text-ink-soft">
              Stands, activaciones y exclusividad por rubro para CCM 2026.
            </span>
          </div>
        </div>
      </section>
    </>
  )
}
