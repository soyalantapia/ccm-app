import { asset } from '../../lib/assets'

function triggerDownload(href: string, filename: string): void {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/**
 * Descarga REAL de la foto (PRD §12): fetch del asset → blob → object URL →
 * <a download> programático. El usuario nunca sale de la app.
 * Si el fetch falla, cae al link directo con atributo download (mismo origen).
 */
export async function downloadPhoto(src: string, filename: string): Promise<void> {
  const url = asset(src)
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    triggerDownload(objectUrl, filename)
    setTimeout(() => URL.revokeObjectURL(objectUrl), 4000)
  } catch {
    triggerDownload(url, filename)
  }
}
