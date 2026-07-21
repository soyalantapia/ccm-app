import { useEffect, useState } from 'react'
import { Button, Input } from '../../components/ui'
import { usePeople } from '../../data/queries'
import { CorePageHeader } from '../../features/admin/CorePageHeader'
import { UsuariosTabla } from '../../features/admin/UsuariosTabla'
import { UsuarioFicha } from '../../features/admin/UsuarioFicha'

export default function AdminUsuarios() {
  const [texto, setTexto] = useState('')
  const [q, setQ] = useState('')
  const [abierta, setAbierta] = useState<string | null>(null)

  // Debounce: sin esto sale una consulta por tecla.
  useEffect(() => {
    const t = setTimeout(() => setQ(texto), 300)
    return () => clearTimeout(t)
  }, [texto])

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } = usePeople(q)

  // La lista viene paginada de a 50: se aplanan las páginas ya traídas. El total de anónimos
  // sale de la primera — es global, no por página.
  const items = data?.pages.flatMap((p) => p.items) ?? []
  const anonimos = data?.pages[0]?.anonimos ?? 0

  return (
    <div className="px-5 py-8 md:px-10">
      <CorePageHeader
        eyebrow="CRM"
        title="Usuarios"
        lead="Toda la gente que pasó por CCM: quién es, qué hizo y cómo contactarla."
      />

      <div className="mt-8 max-w-md">
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por nombre, email, teléfono o DNI…"
          aria-label="Buscar usuarios"
        />
      </div>

      <div className="mt-6">
        {isLoading && <p className="py-10 text-center text-sm text-ink-soft">Cargando…</p>}

        {isError && (
          <p className="py-10 text-center text-sm text-danger">
            No se pudo cargar la lista: {(error as Error).message}
          </p>
        )}

        {data && items.length === 0 && (
          <p className="py-10 text-center text-sm text-ink-soft">
            {q
              ? `Sin resultados para «${q}».`
              : 'Todavía no hay nadie cargado. La lista se llena sola cuando la gente se registre, se inscriba o se postule.'}
          </p>
        )}

        {items.length > 0 && <UsuariosTabla items={items} onAbrir={setAbierta} />}

        {hasNextPage && (
          <div className="mt-6 text-center">
            <Button variant="outline" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? 'Cargando…' : 'Ver más'}
            </Button>
            <p className="mt-2 text-xs text-ink-soft">Mostrando {items.length} — hay más.</p>
          </div>
        )}

        {anonimos > 0 && (
          <p className="mt-8 border-t border-line pt-5 text-xs text-ink-soft">
            Además, {anonimos} dispositivo{anonimos > 1 ? 's' : ''} anónimo
            {anonimos > 1 ? 's' : ''} visitó la app sin dejar datos.
          </p>
        )}
      </div>

      <UsuarioFicha personId={abierta} onClose={() => setAbierta(null)} />
    </div>
  )
}
