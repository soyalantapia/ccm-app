import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

// 16px en mobile, 15px de lg en adelante: iOS Safari hace zoom automático al enfocar
// cualquier campo con font-size < 16px, y no vuelve al zoom original al salir. Como esta
// constante es el estilo base de Input/Textarea/Select, el zoom afectaba TODOS los formularios
// (inscripción, postulación, panel admin) en iPhone.
export const inputClass =
  'w-full rounded-sm border border-line bg-bg/50 px-3.5 py-3 text-[16px] lg:text-[15px] text-ink placeholder:text-ink-soft/50 transition-colors focus:border-accent focus:outline-none'

interface FieldProps {
  label: ReactNode
  required?: boolean
  hint?: string
  error?: string
  children: ReactNode
  className?: string
}

export function Field({ label, required, hint, error, children, className }: FieldProps) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="eyebrow mb-2 block text-[10px] text-ink-soft">
        {label}
        {required && <span className="ml-1 text-accent">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1.5 block text-xs text-ink-soft/80">{hint}</span>}
      {error && <span className="mt-1.5 block text-xs text-danger">{error}</span>}
    </label>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClass} ${className ?? ''}`} {...rest} />
}

export function Textarea({ className, rows = 4, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={`${inputClass} resize-y ${className ?? ''}`} {...rest} />
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[]
  placeholder?: string
}

export function Select({ options, placeholder, className, ...rest }: SelectProps) {
  // appearance-none borra el chevron nativo → sin señal de "esto se despliega".
  // Chevron custom solo desktop (lg:) para no alterar el mockup mobile; el
  // placeholder sin valor se atenúa para no leerse como valor ya elegido.
  const empty = rest.value === ''
  return (
    <span className="relative block">
      <select
        className={`${inputClass} appearance-none lg:pr-9 ${empty ? 'lg:text-ink-soft/60' : ''} ${className ?? ''}`}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled hidden>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none absolute right-3.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-ink-soft lg:block"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 6l4 4 4-4" />
      </svg>
    </span>
  )
}
