/**
 * Internal event bus + cross-tab bridge.
 *
 * Every DataStore write emits here; the native `storage` event re-emits
 * writes made in OTHER tabs of the same browser. Result: the admin
 * dashboard open in another tab updates live while a user interacts
 * with the app ("tiempo real" sin backend).
 */
type Handler = (key: string, detail?: unknown) => void

const handlers = new Set<Handler>()

export const bus = {
  emit(key: string, detail?: unknown) {
    handlers.forEach((h) => h(key, detail))
  },
  on(handler: Handler): () => void {
    handlers.add(handler)
    return () => handlers.delete(handler)
  },
}

const PREFIX = 'ccm:'

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith(PREFIX)) bus.emit(e.key.slice(PREFIX.length))
  })
}
