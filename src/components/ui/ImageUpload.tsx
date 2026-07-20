/**
 * ImageUpload — botón de subida de imagen que autofills un campo URL.
 *
 * Uso:
 *   <ImageUpload onUrl={(url) => setF(p => ({ ...p, banner: url }))} />
 *
 * Al seleccionar un archivo local (jpeg/png/webp/gif/svg, ≤5 MB), hace POST
 * /admin/upload con FormData y, al recibir { url }, llama onUrl(url).
 * Si UPLOAD_DIR no está configurado en el server, muestra un aviso claro.
 */
import { useRef, useState } from 'react'
import { toast } from './Toast'

interface Props {
  /** Se llama con la URL pública del archivo subido. Con `multiple`, una vez POR ARCHIVO. */
  onUrl: (url: string) => void
  /** Clase extra para el botón. */
  className?: string
  /** Título del botón. Default: "Subir imagen" */
  label?: string
  /** Permite elegir varios archivos de una (galerías, portfolios). */
  multiple?: boolean
  /** Cupo restante: si se eligen más, se recorta ANTES de subir y se avisa. */
  max?: number
  /** Avisa mientras hay subidas en vuelo (para bloquear el submit del form). */
  onBusyChange?: (busy: boolean) => void
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml'
const MAX_BYTES = 5 * 1024 * 1024

function apiBase() {
  const raw = import.meta.env.VITE_API_URL ?? window.location.origin
  return raw.replace(/\/+$/, '') + '/api/v1'
}

function adminToken() {
  try { return sessionStorage.getItem('ccm:admin-token') ?? '' } catch { return '' }
}

export function ImageUpload({ onUrl, className = '', label = 'Subir imagen', multiple, max, onBusyChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progreso, setProgreso] = useState({ hechas: 0, total: 0 })

  /** Sube un lote de a uno. Cada éxito llama onUrl al toque (el form ve avanzar las imágenes). */
  async function handleFiles(files: File[]) {
    let elegidos = files
    if (max !== undefined && elegidos.length > max) {
      elegidos = elegidos.slice(0, Math.max(0, max))
      toast(
        max === 0
          ? 'No queda cupo para más imágenes. Quitá alguna primero.'
          : `Solo entran ${max} más: se van a subir las primeras ${max}.`,
        'info',
      )
      if (!elegidos.length) return
    }

    onBusyChange?.(true)
    setProgreso({ hechas: 0, total: elegidos.length })
    let fallaron = 0
    for (const [i, file] of elegidos.entries()) {
      const ok = await subirUno(file)
      if (!ok) fallaron++
      setProgreso({ hechas: i + 1, total: elegidos.length })
    }
    setProgreso({ hechas: 0, total: 0 })
    onBusyChange?.(false)
    if (elegidos.length > 1) {
      const bien = elegidos.length - fallaron
      toast(
        fallaron === 0
          ? `✓ Subieron las ${bien} imágenes`
          : `Subieron ${bien} de ${elegidos.length}. Volvé a elegir las ${fallaron} que fallaron.`,
        fallaron === 0 ? 'success' : 'info',
      )
    }
  }

  /** Devuelve true si la subida salió bien. */
  async function subirUno(file: File): Promise<boolean> {
    if (file.size > MAX_BYTES) {
      toast(`"${file.name}" supera los 5 MB. Comprimila antes de subirla.`, 'info')
      return false
    }
    return handleFile(file)
  }

  async function handleFile(file: File): Promise<boolean> {
    if (file.size > MAX_BYTES) {
      toast('La imagen supera los 5 MB. Comprimila antes de subirla.', 'info')
      return false
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const token = adminToken()
      const res = await fetch(`${apiBase()}/admin/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg: string = err?.error?.message ?? `No se pudo subir la imagen (${res.status})`
        // 503 = el server no tiene UPLOAD_DIR configurado: el organizador igual puede pegar la URL.
        toast(res.status === 503 ? 'El servidor todavía no tiene storage configurado — pegá la URL a mano.' : msg, 'info')
        return false
      }
      const { url } = await res.json() as { url: string }
      onUrl(url)
      if (!multiple) toast('✓ Imagen subida')
      return true
    } catch {
      toast('No se pudo subir la imagen. Revisá la conexión e intentá de nuevo.', 'info')
      return false
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        multiple={multiple}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (!files.length) return
          if (multiple) void handleFiles(files)
          else void handleFile(files[0])
        }}
        aria-label={multiple ? 'Seleccionar imágenes para subir' : 'Seleccionar imagen para subir'}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className={`flex shrink-0 items-center gap-1.5 rounded-sm border border-line bg-surface px-3 py-2.5 text-[13px] text-ink-soft transition-colors hover:border-accent hover:text-accent disabled:opacity-50 ${className}`}
        title={uploading ? 'Subiendo…' : 'Subir imagen desde tu computadora'}
      >
        {uploading ? (
          <span className="size-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        )}
        {uploading
          ? progreso.total > 1
            ? `Subiendo ${progreso.hechas + 1} de ${progreso.total}…`
            : 'Subiendo…'
          : label}
      </button>
    </>
  )
}
