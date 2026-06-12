import { useEffect, useRef } from 'react'
import { useDataVersion } from '../../data/store'

interface QRProps {
  value: string
  size?: number
  className?: string
}

/**
 * QR client-side (funciona offline). Toma el color de tinta del tema actual.
 * La lib `qrcode` se importa dinámicamente para no engordar el bundle inicial
 * (este componente entra al barrel de ui pero solo Mi QR lo usa).
 */
export function QR({ value, size = 240, className }: QRProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const version = useDataVersion() // re-render si cambia el tema

  useEffect(() => {
    let cancelled = false
    import('qrcode').then((QRCode) => {
      if (cancelled || !ref.current) return
      const ink =
        getComputedStyle(document.documentElement).getPropertyValue('--t-ink').trim() || '#181410'
      QRCode.toCanvas(ref.current, value, {
        width: size,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: ink, light: '#00000000' },
      })
    })
    return () => {
      cancelled = true
    }
  }, [value, size, version])

  return <canvas ref={ref} className={className} style={{ width: size, height: size }} />
}
