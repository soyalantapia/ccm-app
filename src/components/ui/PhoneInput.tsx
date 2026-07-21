import { useId, useMemo } from 'react'
import { inputClass } from './fields'
import { PAISES, banderaDe, separarTelefono, unirTelefono } from '../../lib/paises'

/**
 * Teléfono con prefijo internacional: un selector de país + el número.
 *
 * Antes era un `<input type="tel">` suelto con el placeholder «+54 351 ...», así que el prefijo
 * quedaba a criterio de cada persona: unos lo ponían, otros no, otros escribían 0351 o 15. Para
 * un evento que convoca de todo el país y de la región, eso significa una columna de teléfonos
 * que después no se puede usar para escribirle a nadie por WhatsApp.
 *
 * Hacia afuera sigue siendo UN solo string —`"+54 3511234567"`— porque así se persiste hoy en
 * `ProfileField.phone`. No hace falta migrar nada ni tocar el backend.
 *
 * Se usa un `<select>` nativo a propósito, no un combo custom: con 200+ países, el nativo trae
 * gratis la búsqueda por teclado, el scroll con inercia y la rueda de iOS, que es exactamente
 * lo que se espera en el teléfono.
 */
export function PhoneInput({
  value,
  onChange,
  required,
  placeholder = '351 234 5678',
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  required?: boolean
  placeholder?: string
  autoFocus?: boolean
}) {
  const idPais = useId()
  const { pais, numero } = useMemo(() => separarTelefono(value), [value])

  return (
    <span className="flex gap-2">
      <span className="relative shrink-0">
        <label htmlFor={idPais} className="sr-only">
          País del teléfono
        </label>
        <select
          id={idPais}
          // La clave es iso, no el prefijo: +1 lo comparten Estados Unidos, Canadá y medio
          // Caribe, así que con el prefijo el select no podría distinguirlos.
          value={pais.iso}
          onChange={(e) => {
            const nuevo = PAISES.find((p) => p.iso === e.target.value)
            if (nuevo) onChange(unirTelefono(nuevo, numero))
          }}
          className={`${inputClass} w-[7.5rem] appearance-none pr-7`}
          aria-label="País del teléfono"
        >
          {PAISES.map((p) => (
            <option key={p.iso} value={p.iso}>
              {banderaDe(p.iso)} {p.prefijo}
            </option>
          ))}
        </select>
        <span
          aria-hidden
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-soft"
        >
          ▾
        </span>
      </span>

      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        className={`${inputClass} flex-1`}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        value={numero}
        onChange={(e) => onChange(unirTelefono(pais, e.target.value))}
      />
    </span>
  )
}
