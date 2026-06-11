import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

export const inputClass =
  'w-full rounded-sm border border-line bg-bg/50 px-3.5 py-3 text-[15px] text-ink placeholder:text-ink-soft/50 transition-colors focus:border-accent focus:outline-none'

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
  return (
    <select className={`${inputClass} appearance-none ${className ?? ''}`} {...rest}>
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
