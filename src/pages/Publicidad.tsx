import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Check, QrCode } from 'lucide-react'
import { Badge, Button, ButtonLink, Field, Input, QR, SectionTitle } from '../components/ui'
import { store } from '../data/store'
import type { AdCampaign, AdSlot } from '../data/types'
import { formatMoney } from '../features/tickets/format'
import { AD_SLOTS, DURATIONS, priceFor, reachFor, slotMeta } from '../features/publicidad/adPricing'

/** Vista previa del aviso tal como se verá en el slot elegido. */
function AdPreview({ slot, brand, headline, cta, tagline }: { slot: AdSlot; brand: string; headline: string; cta: string; tagline: string }) {
  const h = headline.trim() || 'El titular de tu aviso'
  const b = brand.trim() || 'Tu marca'
  if (slot === 'S6') {
    return (
      <div className="rounded-md border border-line bg-bg px-4 py-6 text-center">
        <div className="eyebrow text-[8px] text-ink-soft/60">Pantalla Mi QR</div>
        <div className="eyebrow mt-2 text-[10px] text-ink-soft">{h}</div>
      </div>
    )
  }
  if (slot === 'S3') {
    return (
      <div className="overflow-hidden rounded-md border-t-2 border-accent bg-night px-5 py-4">
        <div className="eyebrow text-[9px] text-night-ink/50">Presentado por</div>
        <div className="type-serif mt-0.5 text-lg text-night-ink">{b}</div>
        <div className="mt-0.5 text-xs text-night-ink/70">{h}</div>
      </div>
    )
  }
  if (slot === 'S1') {
    return (
      <div className="rounded-md bg-night p-6 text-night-ink">
        <div className="eyebrow text-[9px] text-accent">Espacio del sponsor · splash</div>
        <div className="type-display mt-3 text-3xl leading-none">{b}</div>
        <p className="type-serif mt-3 text-base leading-snug text-night-ink/90">{h}</p>
        {cta.trim() && (
          <span className="mt-4 inline-flex rounded-sm bg-accent px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-ink">
            {cta}
          </span>
        )}
      </div>
    )
  }
  // S2 — feed nativo
  return (
    <div className="relative overflow-hidden rounded-md border border-line bg-surface">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-accent" />
      <div className="py-5 pl-6 pr-5">
        <div className="eyebrow text-[9px] text-ink-soft/60">Espacio patrocinado</div>
        <div className="type-serif mt-1.5 text-xl leading-snug text-ink">{h}</div>
        <div className="mt-2 flex items-center justify-between gap-4">
          <span className="text-xs text-ink-soft">
            {b}
            {tagline.trim() ? ` · ${tagline.trim()}` : ''}
          </span>
          {cta.trim() && (
            <span className="eyebrow flex shrink-0 items-center gap-1 text-[10px] text-accent">
              {cta} <ArrowUpRight size={12} />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function Steps({ step }: { step: number }) {
  const labels = ['Espacio', 'Aviso', 'Pago']
  return (
    <div className="mt-8 flex items-center gap-2">
      {labels.map((l, i) => {
        const n = i + 1
        const active = step >= n
        return (
          <div key={l} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
                active ? 'bg-accent text-accent-ink' : 'bg-ink/8 text-ink-soft'
              }`}
            >
              {step > n ? <Check size={13} strokeWidth={2.5} /> : n}
            </span>
            <span className={`eyebrow text-[9px] ${active ? 'text-ink' : 'text-ink-soft/60'}`}>{l}</span>
            {i < labels.length - 1 && <span className="mx-1 h-px w-5 bg-line" />}
          </div>
        )
      })}
    </div>
  )
}

export default function Publicidad() {
  const [step, setStep] = useState(1)
  const [slot, setSlot] = useState<AdSlot | null>(null)
  const [hours, setHours] = useState(5)
  const [brand, setBrand] = useState('')
  const [headline, setHeadline] = useState('')
  const [cta, setCta] = useState('')
  const [tagline, setTagline] = useState('')
  const [error, setError] = useState('')
  const [campaign, setCampaign] = useState<AdCampaign | null>(null)

  const total = slot ? priceFor(slot, hours) : 0
  const reach = slot ? reachFor(slot, hours) : 0
  const meta = slot ? slotMeta(slot) : null

  const goPay = () => {
    if (!brand.trim() || !headline.trim()) {
      setError('Completá la marca y el titular del aviso.')
      return
    }
    setError('')
    setStep(3)
  }

  const pay = () => {
    if (!slot) return
    const c = store.createCampaign({
      slot,
      brand: brand.trim(),
      headline: headline.trim(),
      hours,
      total,
      ...(cta.trim() ? { cta: cta.trim() } : {}),
      ...(tagline.trim() ? { tagline: tagline.trim() } : {}),
    })
    setCampaign(c)
    setStep(4)
  }

  const reset = () => {
    setStep(1)
    setSlot(null)
    setBrand('')
    setHeadline('')
    setCta('')
    setTagline('')
    setCampaign(null)
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 md:py-16 lg:max-w-5xl">
      <SectionTitle
        eyebrow="Publicidad · autogestión"
        title={
          <>
            Comprá tu <em className="text-accent">espacio</em>
          </>
        }
        lead="Elegí dónde aparece tu aviso, por cuánto tiempo, cargalo y pagá con QR. Queda activo al instante — sin pasar por nadie."
      />

      {step < 4 && <Steps step={step} />}

      {/* ─── Paso 1: elegir espacio ─── */}
      {step === 1 && (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AD_SLOTS.map((s) => (
            <button
              key={s.slot}
              onClick={() => {
                setSlot(s.slot)
                setStep(2)
              }}
              className="group rounded-md border border-line bg-surface p-5 text-left transition-all duration-200 hover:border-accent active:scale-[0.99]"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="type-serif text-lg text-ink">{s.name}</h3>
                <Badge tone="outline">{s.slot}</Badge>
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{s.where}</p>
              <div className="mt-4 flex items-end justify-between border-t border-line pt-3">
                <div>
                  <div className="type-serif text-xl text-ink">{formatMoney(s.pricePerHour)}</div>
                  <div className="eyebrow text-[8px] text-ink-soft/70 lg:text-[10px]">por hora</div>
                </div>
                <span className="eyebrow flex items-center gap-1 text-[10px] text-accent-strong transition-transform group-hover:translate-x-0.5">
                  Elegir <ArrowRight size={12} />
                </span>
              </div>
              <p className="mt-2 text-[11px] text-ink-soft/70 lg:text-xs">~{s.reachPerHour} impresiones/h estimadas</p>
            </button>
          ))}
        </div>
      )}

      {/* ─── Paso 2: duración + aviso ─── */}
      {step === 2 && slot && meta && (
        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="eyebrow text-[10px] text-ink-soft">Espacio elegido</h3>
                <button onClick={() => setStep(1)} className="eyebrow text-[9px] text-accent-strong hover:underline">
                  Cambiar
                </button>
              </div>
              <p className="type-serif mt-1.5 text-lg text-ink">
                {meta.name} <span className="text-ink-soft">· {meta.slot}</span>
              </p>
            </div>

            <div>
              <h3 className="eyebrow mb-2.5 text-[10px] text-ink-soft">Duración</h3>
              <div className="grid grid-cols-2 gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d.hours}
                    onClick={() => setHours(d.hours)}
                    className={`rounded-sm border px-3 py-2.5 text-[13px] transition-colors ${
                      hours === d.hours
                        ? 'border-accent bg-accent/10 text-ink'
                        : 'border-line text-ink-soft hover:border-ink'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3.5">
              <Field label="Marca / anunciante" required>
                <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ej: Banco Distrito" />
              </Field>
              <Field label="Titular del aviso" required>
                <Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Ej: 20% en moda con tu tarjeta" />
              </Field>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <Field label="Botón / CTA" hint="Opcional">
                  <Input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Ver más" />
                </Field>
                <Field label="Bajada" hint="Opcional">
                  <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Banca que viste tu vida" />
                </Field>
              </div>
            </div>

            {error && <p className="text-xs text-danger">{error}</p>}

            <Button size="lg" className="w-full" onClick={goPay}>
              Continuar al pago · {formatMoney(total)}
            </Button>
          </div>

          {/* Vista previa + ficha */}
          <aside className="space-y-4">
            <div>
              <h3 className="eyebrow mb-2.5 text-[10px] text-ink-soft">Vista previa</h3>
              <AdPreview slot={slot} brand={brand} headline={headline} cta={cta} tagline={tagline} />
            </div>
            <dl className="grid grid-cols-2 gap-4 rounded-md border border-line bg-surface p-4">
              <div>
                <dd className="type-serif text-2xl text-ink">{formatMoney(total)}</dd>
                <dt className="eyebrow mt-0.5 text-[8px] text-ink-soft">Total · {hours} h</dt>
              </div>
              <div>
                <dd className="type-serif text-2xl text-accent-strong">~{reach.toLocaleString('es-AR')}</dd>
                <dt className="eyebrow mt-0.5 text-[8px] text-ink-soft">Impresiones estimadas</dt>
              </div>
            </dl>
          </aside>
        </div>
      )}

      {/* ─── Paso 3: pago con QR ─── */}
      {step === 3 && slot && meta && (
        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="eyebrow text-[10px] text-ink-soft">Resumen</h3>
            <dl className="mt-4 space-y-3 border-t border-line pt-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Espacio</dt>
                <dd className="text-ink">{meta.name} · {meta.slot}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Duración</dt>
                <dd className="text-ink">{hours} horas</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Marca</dt>
                <dd className="text-ink">{brand}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
                <dt className="eyebrow text-[10px] text-ink-soft">Total</dt>
                <dd className="type-serif text-3xl text-ink">{formatMoney(total)}</dd>
              </div>
            </dl>
            <button onClick={() => setStep(2)} className="eyebrow mt-4 text-[9px] text-accent-strong hover:underline">
              ← Volver a editar
            </button>
          </div>

          <div className="flex flex-col items-center rounded-md border border-line bg-surface p-6 text-center">
            <div className="eyebrow flex items-center gap-1.5 text-[10px] text-ink-soft">
              <QrCode size={13} className="text-accent-strong" /> Pagá con Mercado Pago
            </div>
            <div className="mt-4 rounded-md border border-line bg-bg p-3">
              <QR
                value={`https://www.mercadopago.com.ar/checkout/ccm?slot=${slot}&hs=${hours}&monto=${total}&marca=${encodeURIComponent(brand)}`}
                size={184}
              />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-ink-soft">
              Escaneá el QR desde tu app de Mercado Pago y aboná <strong className="text-ink">{formatMoney(total)}</strong>.
            </p>
            <Button size="lg" className="mt-5 w-full" onClick={pay}>
              <Check size={16} strokeWidth={2} /> Ya pagué · activar aviso
            </Button>
            <p className="mt-2 text-[10px] leading-relaxed text-ink-soft/70">
              Demo: el cobro real se confirma por webhook de Mercado Pago en producción.
            </p>
          </div>
        </div>
      )}

      {/* ─── Paso 4: éxito ─── */}
      {step === 4 && campaign && (
        <div className="mt-10 rounded-lg border border-line bg-surface p-7 text-center md:p-10">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-ink">
            <Check size={26} strokeWidth={2.5} />
          </span>
          <h2 className="type-display mt-5 text-3xl text-ink">Tu aviso está activo</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
            <em className="text-accent-strong">{campaign.brand}</em> ya está corriendo en{' '}
            {slotMeta(campaign.slot).name} por {campaign.hours} horas. Empezamos a medir impresiones y clics
            desde ahora.
          </p>
          <div className="mx-auto mt-6 max-w-sm">
            <AdPreview slot={campaign.slot} brand={campaign.brand} headline={campaign.headline} cta={campaign.cta ?? ''} tagline={campaign.tagline ?? ''} />
          </div>
          <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            <ButtonLink to={slotMeta(campaign.slot).liveAt} size="lg">
              Ver mi aviso en la app <ArrowRight size={15} />
            </ButtonLink>
            <Button variant="ghost" size="lg" onClick={reset}>
              Comprar otro espacio
            </Button>
          </div>
          <p className="mt-6 text-[11px] leading-relaxed text-ink-soft/70">
            El organizador ve tu campaña medida en el panel — impresiones, clics y CTR en tiempo real.
          </p>
        </div>
      )}

      {step === 1 && (
        <p className="mt-8 border-t border-line pt-5 text-[12px] leading-relaxed text-ink-soft/80">
          ¿Buscás algo más grande (presencia en todo el evento, activación, gala)?{' '}
          <Link to="/sponsors" className="text-accent-strong underline-offset-2 hover:underline">
            Hablá con el equipo de sponsors
          </Link>
          .
        </p>
      )}
    </div>
  )
}
