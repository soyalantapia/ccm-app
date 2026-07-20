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
  /** Se llama con la URL pública del archivo subido. */
  onUrl: (url: string) => void
  /** Clase extra para el botón. */
  className?: string
  /** Título del botón. Default: "Subir imagen" */
  label?: string
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

export function ImageUpload({ onUrl, className = '', label = 'Subir imagen' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(file: File) {
    if (file.size > MAX_BYTES) {
      toast('La imagen supera los 5 MB. Comprimila antes de subirla.', 'info')
      return
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
        return
      }
      const { url } = await res.json() as { url: string }
      onUrl(url)
      toast('✓ Imagen subida')
    } catch {
      toast('No se pudo subir la imagen. Revisá la conexión e intentá de nuevo.', 'info')
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
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        aria-label="Seleccionar imagen para subir"
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
        {uploading ? 'Subiendo…' : label}
      </button>
    </>
  )
}
