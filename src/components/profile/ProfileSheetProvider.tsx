import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { bus } from '../../lib/bus'
import { getProfile, missingFields } from '../../lib/identity'
import { store } from '../../data/store'
import { FIELD_META, type ProfileRequest } from '../../lib/profileRequest'
import { Sheet, Field, Input, Button } from '../ui'
import type { ProfileFieldKey } from '../../data/types'

/**
 * Sheet global de perfil progresivo (D22): pide SOLO los campos faltantes,
 * una única vez. Toda acción gated pasa por acá vía requireProfile().
 */
export function ProfileSheetProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ProfileRequest | null>(null)
  const [missing, setMissing] = useState<ProfileFieldKey[]>([])
  const [values, setValues] = useState<Partial<Record<ProfileFieldKey, string>>>({})
  const [needsConsents, setNeedsConsents] = useState(false)
  const [terms, setTerms] = useState(false)
  const [news, setNews] = useState(false)
  const [sponsors, setSponsors] = useState(false)
  const [error, setError] = useState('')

  useEffect(
    () =>
      bus.on((key, detail) => {
        if (key !== 'ui:profile-request' || !detail) return
        const req = detail as ProfileRequest
        const miss = missingFields(req.fields)
        if (miss.length === 0) {
          req.resolve(true)
          return
        }
        setMissing(miss)
        setValues({})
        setTerms(false)
        setNews(false)
        setSponsors(false)
        setError('')
        setNeedsConsents(!getProfile().consents.terms)
        setRequest(req)
      }),
    [],
  )

  const close = (ok: boolean) => {
    request?.resolve(ok)
    setRequest(null)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (missing.some((f) => !values[f]?.trim())) {
      setError('Completá todos los campos para continuar.')
      return
    }
    if (needsConsents && !terms) {
      setError('Necesitamos que aceptes los Términos y la Política de Privacidad.')
      return
    }
    store.saveProfileFields(values, request!.action)
    if (needsConsents) store.saveConsents({ terms: true, news, sponsors })
    close(true)
  }

  return (
    <>
      {children}
      <Sheet open={!!request} onClose={() => close(false)} title={request?.title}>
        {request && (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm leading-relaxed text-ink-soft">
              {request.message ?? 'Los pedimos una sola vez: la próxima ya no te preguntamos nada.'}
            </p>

            {missing.map((field) => {
              const meta = FIELD_META[field]
              return (
                <Field key={field} label={meta.label} required>
                  <Input
                    type={meta.type}
                    placeholder={meta.placeholder}
                    autoComplete={meta.autocomplete}
                    value={values[field] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
                    required
                  />
                </Field>
              )
            })}

            {needsConsents && (
              <div className="space-y-3 rounded-md border border-line bg-bg/60 p-4">
                <div className="flex items-start gap-2.5 text-xs leading-relaxed text-ink-soft">
                  <Sparkles size={14} className="mt-0.5 shrink-0 text-accent" />
                  <span>
                    Registrarte tiene beneficios: sorteos, descuentos y accesos preferenciales
                    antes, durante y después del evento.
                  </span>
                </div>
                <label className="flex items-start gap-2.5 text-xs leading-relaxed text-ink">
                  <input
                    type="checkbox"
                    checked={terms}
                    onChange={(e) => setTerms(e.target.checked)}
                    className="mt-0.5 accent-(--t-accent)"
                  />
                  <span>
                    Acepto los{' '}
                    <Link to="/terminos" className="underline decoration-accent underline-offset-2">
                      Términos
                    </Link>{' '}
                    y la{' '}
                    <Link to="/privacidad" className="underline decoration-accent underline-offset-2">
                      Política de Privacidad
                    </Link>{' '}
                    <span className="text-accent">*</span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 text-xs leading-relaxed text-ink-soft">
                  <input
                    type="checkbox"
                    checked={news}
                    onChange={(e) => setNews(e.target.checked)}
                    className="mt-0.5 accent-(--t-accent)"
                  />
                  Quiero recibir novedades de CCM
                </label>
                <label className="flex items-start gap-2.5 text-xs leading-relaxed text-ink-soft">
                  <input
                    type="checkbox"
                    checked={sponsors}
                    onChange={(e) => setSponsors(e.target.checked)}
                    className="mt-0.5 accent-(--t-accent)"
                  />
                  Quiero enterarme de beneficios de sponsors
                </label>
              </div>
            )}

            {error && <p className="text-xs text-danger">{error}</p>}

            <Button type="submit" className="w-full" size="lg">
              Continuar
            </Button>
          </form>
        )}
      </Sheet>
    </>
  )
}
