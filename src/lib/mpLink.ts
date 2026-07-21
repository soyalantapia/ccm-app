/**
 * Link de cobro de Mercado Pago, configurable por entorno.
 *
 * Membresía y Publicidad mostraban un QR con una URL inventada
 * (`mercadopago.com.ar/checkout/ccm?…`) que NO existe: quien la escaneaba caía en
 * "La página que buscás ya no existe" y no podía pagar. Un QR que lleva a un error es
 * peor que no tener QR, porque parece que el circuito funciona.
 *
 * Mientras el dueño genera los links reales, las pantallas leen
 * `VITE_MP_LINK_MEMBRESIA` / `VITE_MP_LINK_PUBLICIDAD`. Si hay un link de pago de verdad
 * se muestra el QR + el botón; si no, un mensaje honesto para coordinar el pago.
 *
 * Se considera válido sólo un `https://` a un dominio de Mercado Pago con una ruta propia:
 * - la home pelada (`https://www.mercadopago.com.ar`) es el placeholder del seed, no un cobro;
 * - `/checkout/ccm` es justamente la ruta inventada que devuelve 404.
 */
export function mpLinkValido(raw: string | undefined): string | null {
  const valor = (raw ?? '').trim()
  if (!valor) return null

  let url: URL
  try {
    url = new URL(valor)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null

  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const esMercadoPago =
    host === 'mercadopago.com.ar' ||
    host.endsWith('.mercadopago.com.ar') ||
    host === 'mercadopago.com' ||
    host.endsWith('.mercadopago.com') ||
    host === 'mpago.la' ||
    host.endsWith('.mpago.la') ||
    host === 'mpago.li' ||
    host.endsWith('.mpago.li')
  if (!esMercadoPago) return null

  const ruta = url.pathname.replace(/\/+$/, '')
  if (ruta === '') return null
  if (/^\/checkout\/ccm$/i.test(ruta)) return null

  return valor
}
