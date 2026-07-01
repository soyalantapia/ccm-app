import { Link } from 'react-router-dom'
import { Check, Minus, Star, UserRound } from 'lucide-react'
import { Badge, ButtonLink, Eyebrow, Stat } from '../../components/ui'
import { store, useStore } from '../../data/store'
import { IDS } from '../../data/ids'
import { FIELD_META } from '../../lib/profileRequest'
import { AppSection } from '../../features/app/AppSection'
import { ProfileCompleteCard } from '../../features/app/ProfileCompleteCard'
import { ProfileFieldRow } from '../../features/app/ProfileFieldRow'
import { APPLICATION_STATUS_META, formatDay } from '../../features/app/meta'
import type { ProfileFieldKey } from '../../data/types'

const FIELD_ORDER = Object.keys(FIELD_META) as ProfileFieldKey[]

/** Perfil — PRD §8.5: datos progresivos, postulaciones, actividad y consents. Sin logout (D22). */
export default function Perfil() {
  const profile = useStore((s) => s.getProfile())
  const applications = useStore((s) => s.getApplications().filter((a) => !a.fromSeed))
  const registrationsCount = useStore(
    (s) => s.getRegistrations().filter((r) => r.status === 'confirmada').length,
  )
  const downloadsCount = useStore((s) => s.getDownloads().length)
  const favoritesCount = useStore((s) => s.getFavorites().length)
  const isSocio = useStore((s) => s.isSocio())

  const first = profile.fields.firstName?.value
  const last = profile.fields.lastName?.value
  const name = [first, last].filter(Boolean).join(' ')
  const initials = [first?.[0], last?.[0]].filter(Boolean).join('').toUpperCase()
  const profession = profile.fields.profession?.value

  const camino = store.getConvocatoria(IDS.convocatoriaSlugs.camino)

  const consents = [
    { key: 'terms', label: 'Términos y Política de Privacidad', ts: profile.consents.terms },
    { key: 'news', label: 'Novedades de CCM', ts: profile.consents.news },
    { key: 'sponsors', label: 'Beneficios de sponsors', ts: profile.consents.sponsors },
  ]

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 md:py-20 lg:max-w-4xl">
      {/* Header con avatar tipográfico */}
      <header className="flex animate-rise items-center gap-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-night text-night-ink md:h-20 md:w-20">
          {initials ? (
            <span className="type-serif text-2xl md:text-3xl">{initials}</span>
          ) : (
            <UserRound size={24} strokeWidth={1.5} />
          )}
        </div>
        <div className="min-w-0">
          <Eyebrow>Tu perfil</Eyebrow>
          <h1 className="type-display mt-1.5 truncate text-3xl text-ink md:text-4xl">
            {name || 'Invitada/o de CCM'}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {profession ?? 'Completá tus datos: te ahorran tiempo en cada acción.'}
          </p>
        </div>
      </header>

      {/* CTA principal: completar todo de una sola vez (estado en vivo) */}
      <div className="mt-10 md:mt-12">
        <ProfileCompleteCard />
      </div>

      {/* Tu membresía (niveles de suscripción) */}
      <AppSection eyebrow="Tu membresía">
        {isSocio ? (
          <div className="flex items-center gap-4 rounded-md border border-accent/40 bg-accent/5 p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
              <Star size={20} strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="type-serif text-lg text-ink">Socio CCM</p>
              <p className="text-xs leading-relaxed text-ink-soft">
                Capacitaciones, zona VIP, contenido exclusivo y descuentos desbloqueados.
              </p>
            </div>
            <ButtonLink to="/membresia" variant="ghost" size="sm" className="shrink-0">
              Beneficios
            </ButtonLink>
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="type-serif text-lg text-ink">Estás en el nivel Gratis</p>
              <p className="text-xs leading-relaxed text-ink-soft">
                Hacete Socio y desbloqueá capacitaciones, zona VIP, contenido exclusivo y descuentos.
              </p>
            </div>
            <ButtonLink to="/membresia" size="sm" className="shrink-0">
              Hacerme Socio
            </ButtonLink>
          </div>
        )}
      </AppSection>

      {/* Tus datos — progressive profiling (ver / corregir cada dato) */}
      <AppSection eyebrow="Tus datos">
        <p className="-mt-1 text-sm leading-relaxed text-ink-soft">
          Acá podés ver y corregir cada dato por separado cuando quieras.
        </p>
        <div className="mt-5 border-b border-line">
          {FIELD_ORDER.map((field) => (
            <ProfileFieldRow key={field} field={field} />
          ))}
        </div>
      </AppSection>

      {/* Tus postulaciones */}
      <AppSection eyebrow="Tus postulaciones">
        {applications.length === 0 ? (
          <p className="text-sm leading-relaxed text-ink-soft">
            Todavía no te postulaste a ninguna convocatoria.{' '}
            <Link
              to={`/c/${IDS.convocatoriaSlugs.camino}`}
              className="text-ink underline decoration-accent underline-offset-4 transition-colors hover:text-accent"
            >
              Conocé el Camino a CCM
            </Link>
            .
          </p>
        ) : (
          <div className="border-b border-line">
            {applications.map((a) => {
              const meta = APPLICATION_STATUS_META[a.status]
              return (
                <article key={a.id} className="flex items-center justify-between gap-4 border-t border-line py-4">
                  <div className="min-w-0">
                    <h3 className="type-serif truncate text-lg text-ink">
                      {camino && a.convocatoriaId === camino.id ? camino.title : 'Convocatoria CCM'}
                    </h3>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      Enviada el {formatDay(a.ts)}
                      {a.decidedAt ? ` · resuelta el ${formatDay(a.decidedAt)}` : ''}
                    </p>
                  </div>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </article>
              )
            })}
          </div>
        )}
      </AppSection>

      {/* Tu actividad */}
      <AppSection eyebrow="Tu actividad">
        <div className="grid grid-cols-3 gap-6">
          <Stat value={registrationsCount} label="Inscripciones" />
          <Stat value={downloadsCount} label="Descargas" />
          <Stat value={favoritesCount} label="Favoritos" />
        </div>
      </AppSection>

      {/* Consentimientos */}
      <AppSection eyebrow="Consentimientos">
        <div className="border-b border-line">
          {consents.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-4 border-t border-line py-3.5">
              <span className="text-sm text-ink">{c.label}</span>
              {c.ts ? (
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-success">
                  <Check size={13} /> {formatDay(c.ts)}
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-soft/60">
                  <Minus size={13} /> No otorgado
                </span>
              )}
            </div>
          ))}
        </div>
      </AppSection>

      {/* Nota legal — sin logout (D22): tu dispositivo es tu cuenta */}
      <p className="mt-14 text-center text-[11px] leading-relaxed text-ink-soft/70">
        Tu dispositivo es tu cuenta: no hay contraseñas ni cierre de sesión. Tus datos se usan solo
        para la experiencia CCM.{' '}
        <Link
          to="/privacidad"
          className="underline decoration-accent underline-offset-2 transition-colors hover:text-ink"
        >
          Política de Privacidad
        </Link>
      </p>
    </div>
  )
}
