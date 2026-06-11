import { Button, Eyebrow, SectionTitle, Stat } from '../components/ui'
import { useStore } from '../data/store'
import type { Sponsor } from '../data/types'
import { SponsorForm } from '../features/contenido/SponsorForm'

/* ─── Copy estático del deck CCM 2026 ─── */

const OFFER = [
  { title: 'Sponsors exclusivos por rubro', caption: 'Una sola marca por categoría' },
  { title: 'Stands y activaciones', caption: '+100 stands interactivos' },
  { title: 'Charlas y masterclasses', caption: 'Tu marca como contenido' },
  { title: 'Experiencias de marca', caption: 'Galas, hospitality, art shows' },
  { title: 'Base segmentada por plataforma', caption: '20.000 registrados proyectados' },
]

const PROMISES = [
  {
    number: '01',
    title: 'Lead Generation en tiempo real',
    body: 'Tótems QR en cada espacio del evento: cada escaneo es un perfil capturado al instante, con nombre, email y profesión asociados a tu marca. Los leads aparecen en tu reporte mientras el evento todavía está sucediendo.',
  },
  {
    number: '02',
    title: 'Estrategia post-evento',
    body: 'La conversación no termina el domingo: mailing masivo segmentado por plataforma e intereses, y audiencias listas para retargeting en Meta y Google construidas con datos propios del evento.',
  },
  {
    number: '03',
    title: 'Reporte Técnico de Impacto',
    body: 'Al cierre, cada sponsor recibe su reporte: impresiones, clics, escaneos, descargas y leads con consentimiento. Todo se mide — se acaba la discusión de si el sponsoreo funcionó o no.',
  },
]

const LEVELS: { level: Sponsor['level']; label: string; description: string }[] = [
  {
    level: 'Principal',
    label: 'Sponsor Principal',
    description:
      'La marca que abraza todo el evento: presencia en cada superficie, activación central, gala y reporte ampliado. Exclusividad de rubro incluida.',
  },
  {
    level: 'Oro',
    label: 'Nivel Oro',
    description:
      'Stand premium, contenido patrocinado dentro de la plataforma y presencia en los momentos de mayor contacto con la audiencia.',
  },
  {
    level: 'Plata',
    label: 'Nivel Plata',
    description:
      'Presencia de marca en galerías de fotos, newsletters y espacios seleccionados de las dos jornadas.',
  },
]

function scrollToForm() {
  document.getElementById('contacto-comercial')?.scrollIntoView({ behavior: 'smooth' })
}

export default function Sponsors() {
  const sponsors = useStore((s) => s.getSponsors())

  return (
    <>
      {/* Hero editorial — la propuesta del deck */}
      <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <SectionTitle
          eyebrow="Sponsors · CCM 2026"
          title={
            <>
              Cada plataforma, un <em className="italic text-accent">mercado</em> propio
            </>
          }
          lead="Moda, belleza, turismo, arte, gastronomía, tecnología y sustentabilidad: siete plataformas con audiencia propia y una sola marca por rubro. Stands y activaciones, charlas y masterclasses, experiencias de marca y una base segmentada que sigue trabajando después del evento."
        />

        <div className="mt-10 flex flex-wrap items-center gap-5 md:mt-12">
          <Button size="lg" onClick={scrollToForm}>
            Quiero ser sponsor
          </Button>
          <span className="text-[13px] text-ink-soft">
            La exclusividad por rubro se reserva por orden de llegada.
          </span>
        </div>

        {/* Qué compra una marca — ruled list editorial */}
        <div className="mt-14 border-t border-line md:mt-20">
          {OFFER.map((item, i) => (
            <div
              key={item.title}
              className="grid gap-y-1 border-b border-line py-5 md:grid-cols-12 md:items-baseline md:gap-x-8"
            >
              <span className="eyebrow text-[10px] text-accent md:col-span-1">
                0{i + 1}
              </span>
              <span className="type-serif text-xl text-ink md:col-span-6 md:text-2xl">
                {item.title}
              </span>
              <span className="eyebrow text-[10px] text-ink-soft md:col-span-5 md:text-right">
                {item.caption}
              </span>
            </div>
          ))}
        </div>

        {/* La audiencia, en números del deck */}
        <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 md:mt-16 md:grid-cols-4">
          <Stat value="+18.000" label="Asistentes calificados" />
          <Stat value="70%" label="Mujeres +30 · ABC1" />
          <Stat value="+100" label="Stands interactivos" />
          <Stat value="20.000" label="Base proyectada de registrados" tone="accent" />
        </div>
      </section>

      {/* Las 3 promesas tecnológicas — features numeradas (PRD §1) */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
          <SectionTitle
            eyebrow="La plataforma"
            title={
              <>
                Todo se <em className="italic text-accent">mide</em>
              </>
            }
            lead="Esta plataforma convierte cada punto de contacto del evento en datos propios y trazables. Tres promesas que tu marca recibe firmadas:"
          />
          <div className="mt-10 md:mt-14">
            {PROMISES.map((p) => (
              <article
                key={p.number}
                className="grid gap-y-3 border-t border-line py-10 first:border-t-0 first:pt-0 md:grid-cols-12 md:gap-x-8"
              >
                <span className="type-display text-5xl text-accent md:col-span-2 md:text-6xl">
                  {p.number}
                </span>
                <h3 className="type-serif text-2xl text-ink md:col-span-4 md:text-3xl">
                  {p.title}
                </h3>
                <p className="text-[15px] leading-relaxed text-ink-soft md:col-span-6">{p.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Dark block — exclusividad por rubro (D20) + niveles + sponsors actuales */}
      <section className="bg-night text-night-ink">
        <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
          <SectionTitle
            tone="night"
            eyebrow="Estructura comercial"
            title={
              <>
                Exclusividad por <em className="italic text-accent">rubro</em>
              </>
            }
            lead="Una sola marca por categoría: si tu empresa toma un rubro, ningún competidor entra al evento ni a la plataforma. No vendemos espacios sueltos — vendemos mercados enteros, con resultados medidos."
          />

          <div className="mt-10 grid gap-px overflow-hidden rounded-md border border-night-soft bg-night-soft md:mt-14 md:grid-cols-3">
            {LEVELS.map(({ level, label, description }) => (
              <div key={level} className="bg-night p-7 md:p-8">
                <p className="eyebrow text-[10px] text-accent">{label}</p>
                <p className="type-serif mt-3 text-2xl text-night-ink">{level}</p>
                <p className="mt-3 text-sm leading-relaxed text-night-ink/65">{description}</p>
              </div>
            ))}
          </div>

          {/* Sponsors actuales — wordmarks tipográficos por nivel */}
          <div className="mt-16 md:mt-20">
            <Eyebrow className="mb-2">Ya están adentro</Eyebrow>
            {LEVELS.map(({ level, label }) => {
              const group = sponsors.filter((s) => s.level === level)
              if (group.length === 0) return null
              return (
                <div
                  key={level}
                  className="grid gap-y-4 border-t border-night-soft py-7 last:border-b md:grid-cols-12 md:items-baseline md:gap-x-8"
                >
                  <div className="eyebrow text-[10px] text-night-ink/50 md:col-span-3">{label}</div>
                  <div className="flex flex-wrap items-baseline gap-x-12 gap-y-6 md:col-span-9">
                    {group.map((s) => (
                      <div key={s.id}>
                        <p className="type-serif text-2xl text-night-ink md:text-3xl">{s.name}</p>
                        <p className="eyebrow mt-1.5 flex items-center gap-2 text-[9px] text-night-ink/45">
                          {s.industry}
                          {s.exclusive && (
                            <span className="rounded-sm border border-accent/40 px-2 py-0.5 text-accent">
                              Exclusividad de rubro
                            </span>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Contacto comercial */}
      <section id="contacto-comercial" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16 md:py-24">
        <div className="md:grid md:grid-cols-12 md:gap-x-10">
          <div className="md:col-span-5">
            <SectionTitle
              eyebrow="Contacto comercial"
              title={
                <>
                  Hablemos de tu <em className="italic text-accent">marca</em>
                </>
              }
              lead="Contanos quién sos y qué rubro querés tomar. El equipo comercial arma una propuesta a medida: stand, activación, contenido o el evento entero."
            />
          </div>
          <div className="mt-10 md:col-span-7 md:mt-0">
            <SponsorForm />
          </div>
        </div>
      </section>
    </>
  )
}
