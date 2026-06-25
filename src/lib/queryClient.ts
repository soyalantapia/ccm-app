import { QueryClient } from '@tanstack/react-query'
import { bus } from './bus'

/**
 * Cliente de TanStack Query — capa de LECTURA reactiva que reemplaza progresivamente al
 * hook sync `useStore` (paso 1 de la migración async del DataStore, canon 11).
 *
 * Mientras el `DataStore` siga SYNC, las query usan `initialData` (lee el store al instante,
 * sin flicker → comportamiento idéntico al de useStore). Cuando la interfaz pase a `Promise`,
 * se quita `initialData` y el `await` de la `queryFn` pasa a ser real (recién ahí aparecen los
 * estados de carga). Así la app queda funcionando en CADA paso, sin big-bang.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: Infinity,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
})

// Bridge de reactividad: cada bus.emit(key) (escritura local o cross-tab vía `storage`)
// invalida la query de ese dominio → re-render. Sustituye al version-bump de useStore.
if (typeof window !== 'undefined') {
  bus.on((key) => {
    void queryClient.invalidateQueries({ queryKey: [key] })
  })
}
