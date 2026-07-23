import QRCode from 'qrcode'

/**
 * Genera el PNG de un QR en el servidor. El front dibuja el QR en un canvas (QR.tsx), pero para
 * mandarlo por mail hace falta un buffer PNG del lado de Node — es la misma librería `qrcode`.
 *
 * Colores fijos oscuro-sobre-blanco (no el tema del panel): un QR tiene que leerse en cualquier
 * cliente de correo y con cualquier cámara, así que no se juega con contraste. Corrección de
 * errores 'M' — el mismo nivel que usa el front.
 */
export async function qrPng(value: string, size = 320): Promise<Buffer> {
  return QRCode.toBuffer(value, {
    type: 'png',
    width: size,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#181410', light: '#ffffff' },
  })
}
