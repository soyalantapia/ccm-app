/**
 * uploadService — guarda archivos en el Volume Railway (UPLOAD_DIR) y devuelve
 * la URL pública con la que el front los puede pegar en los campos de imagen.
 *
 * Restricciones:
 *   - Solo imágenes (jpeg/png/webp/gif/svg) hasta 5 MB.
 *   - Nombre de archivo: <uuid>.<ext> — sin path traversal posible.
 *   - Requiere UPLOAD_DIR en el entorno; si no está, rechaza con 503.
 *
 * Railway Volume: montá el volumen en /app/uploads y seteá:
 *   UPLOAD_DIR=/app/uploads
 *   UPLOAD_URL_PREFIX=/uploads        (o el path que uses)
 * La URL pública de cada archivo queda:
 *   https://<RAILWAY_PUBLIC_DOMAIN><UPLOAD_URL_PREFIX>/<uuid>.<ext>
 */
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { IncomingMessage } from 'http'
import formidable from 'formidable'
import { ApiError } from '../lib/errors.js'
import { env } from '../lib/env.js'

/** Tipos MIME aceptados → extensión canónica. */
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

/** Resuelve la URL pública de un archivo subido a partir de su nombre. */
function publicUrl(filename: string): string {
  const prefix = env.UPLOAD_URL_PREFIX.replace(/\/$/, '')
  return `${prefix}/${filename}`
}

/**
 * Achica la imagen ya guardada, en su lugar. Importa: estos archivos los sirve el PROPIO
 * servidor desde el volumen, así que una foto de celular de 5 MB se le baja entera a cada
 * visitante. Reduce el lado mayor a 2000 px y reencodea con calidad 82.
 *
 * Reglas para no romper nada:
 *  - SVG y GIF quedan intactos (vectorial / animación).
 *  - Se conserva el MISMO formato → la extensión y el MIME del archivo siguen siendo válidos.
 *  - Solo se sobrescribe si el resultado pesa MENOS (reencodear algo ya optimizado lo agranda).
 *  - `sharp` se importa de forma lazy y todo va dentro de try/catch: si el binario nativo no
 *    está disponible en el runtime, la subida sigue funcionando con el archivo original.
 */
async function optimizeInPlace(file: string, mime: string): Promise<void> {
  if (mime === 'image/svg+xml' || mime === 'image/gif') return
  try {
    const { default: sharp } = await import('sharp')
    const input = fs.readFileSync(file)
    const img = sharp(input, { failOn: 'none' }).rotate() // rotate() aplica el EXIF (fotos de celular)
    const meta = await img.metadata()
    const w = meta.width ?? 0
    const h = meta.height ?? 0
    if (w > 2000 || h > 2000) {
      if (w >= h) img.resize({ width: 2000, withoutEnlargement: true })
      else img.resize({ height: 2000, withoutEnlargement: true })
    }
    const out =
      mime === 'image/png'
        ? await img.png({ quality: 82 }).toBuffer()
        : mime === 'image/webp'
          ? await img.webp({ quality: 82 }).toBuffer()
          : await img.jpeg({ quality: 82, mozjpeg: true }).toBuffer()
    if (out.length < input.length) fs.writeFileSync(file, out)
  } catch {
    // sharp ausente o imagen que no se pudo procesar: se queda el original, sin romper la subida.
  }
}

/** Procesa un multipart POST y guarda el campo "file". Devuelve { url }. */
export async function handleUpload(req: IncomingMessage): Promise<{ url: string }> {
  if (!env.UPLOAD_DIR) {
    throw new ApiError(503, 'UPLOAD_NOT_CONFIGURED', 'Subida de archivos no configurada (falta UPLOAD_DIR)')
  }

  // Crea el directorio si no existe (primera vez, o tras montar el Volume).
  fs.mkdirSync(env.UPLOAD_DIR, { recursive: true })

  const form = formidable({
    maxFileSize: MAX_BYTES,
    maxFiles: 1,
    filter: ({ mimetype }) => !!(mimetype && ALLOWED[mimetype]),
    // El temporal se escribe DENTRO del volumen: en Railway, /tmp (filesystem del
    // contenedor) y /app/uploads (volumen montado) son dispositivos distintos, y mover
    // entre ellos con rename() falla con EXDEV. Escribiendo acá, el rename final es
    // dentro del mismo filesystem.
    uploadDir: env.UPLOAD_DIR,
  })

  // formidable aborta con su propio error cuando el archivo excede maxFileSize (u otro
  // límite del parseo). Sin este catch sale como 500 "Error interno" y el organizador no
  // entiende por qué falló su foto de celular de 8 MB.
  let files: formidable.Files
  try {
    ;[, files] = await form.parse(req)
  } catch (err) {
    const code = (err as { code?: number })?.code
    // 1009 = biggerThanMaxFileSize, 1015 = biggerThanTotalMaxFileSize
    if (code === 1009 || code === 1015) {
      throw new ApiError(413, 'FILE_TOO_LARGE', 'La imagen supera los 5 MB. Comprimila o subí una versión más liviana.')
    }
    throw new ApiError(400, 'UPLOAD_FAILED', 'No se pudo procesar el archivo. Verificá que sea una imagen válida (jpeg/png/webp/gif/svg) de hasta 5 MB.')
  }

  const raw = files.file?.[0]
  if (!raw) throw new ApiError(400, 'NO_FILE', 'Se esperaba un campo "file" de imagen (jpeg/png/webp/gif/svg, máx 5 MB)')

  const mime = raw.mimetype ?? ''
  const ext = ALLOWED[mime]
  if (!ext) throw new ApiError(415, 'INVALID_TYPE', `Tipo no permitido: ${mime}. Permitidos: jpeg, png, webp, gif, svg`)

  // Nombre único; ext normalizada → sin path traversal.
  const filename = `${randomUUID()}.${ext}`
  const dest = path.join(env.UPLOAD_DIR, filename)
  try {
    fs.renameSync(raw.filepath, dest)
  } catch (err) {
    // Red de seguridad si el temporal igual quedó en otro dispositivo (EXDEV): copiar y
    // borrar el origen es equivalente y funciona entre filesystems.
    if ((err as NodeJS.ErrnoException)?.code !== 'EXDEV') throw err
    fs.copyFileSync(raw.filepath, dest)
    fs.unlinkSync(raw.filepath)
  }

  await optimizeInPlace(dest, mime)

  return { url: publicUrl(filename) }
}
