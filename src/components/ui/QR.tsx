import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { useDataVersion } from '../../data/store'

interface QRProps {
  value: string
  size?: number
  className?: string
}

/** QR client-side (funciona offline). Toma el color de tinta del tema actual. */
export function QR({ value, size = 240, className }: QRProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const version = useDataVersion() // re-render si cambia el tema

  useEffect(() => {
    if (!ref.current) return
    const ink =
      getComputedStyle(document.documentElement).getPropertyValue('--t-ink').trim() || '#181410'
    QRCode.toCanvas(ref.current, value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: ink, light: '#00000000' },
    })
  }, [value, size, version])

  return <canvas ref={ref} className={className} style={{ width: size, height: size }} />
}
