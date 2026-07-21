/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

/** Variables de entorno del front (build-time, prefijo VITE_). */
interface ImportMetaEnv {
  /** Backend real; sin ella el front corre en modo demo offline (LocalDataStore). */
  readonly VITE_API_URL?: string
  /**
   * Link de pago REAL de Mercado Pago para la membresía Socio CCM.
   * Sin ella —o con algo que no sea un link de cobro de MP— /membresia no muestra QR
   * y ofrece coordinar el pago con el equipo. Ver src/lib/mpLink.ts.
   */
  readonly VITE_MP_LINK_MEMBRESIA?: string
  /** Ídem, para los espacios publicitarios de /publicidad. */
  readonly VITE_MP_LINK_PUBLICIDAD?: string
}
