// Punto ÚNICO de import de los tipos de dominio (canon 15).
// El backend NO duplica tipos: los re-exporta desde el front (src/data/types.ts)
// vía el path alias del tsconfig. Una sola definición, dos consumidores.
// Que `tsc --noEmit` resuelva este re-export ES la prueba de que el alias funciona.
export type * from '@domain/types'
