import { ButtonLink } from '../components/ui'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="eyebrow text-accent">Error 404</p>
      <h1 className="type-display mt-4 text-5xl md:text-7xl">Esta pasarela
        <br />
        <em className="text-accent">no existe</em>
      </h1>
      <p className="mt-5 max-w-sm text-sm leading-relaxed text-ink-soft">
        La página que buscás no está en el programa. Volvé al inicio y seguí recorriendo CCM.
      </p>
      <ButtonLink to="/" className="mt-8">
        Volver al inicio
      </ButtonLink>
    </div>
  )
}
