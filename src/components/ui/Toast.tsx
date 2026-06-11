import { useEffect, useState } from 'react'
import { CheckCircle2, Info } from 'lucide-react'

interface ToastItem {
  id: number
  message: string
  tone: 'success' | 'info'
}

let push: (t: Omit<ToastItem, 'id'>) => void = () => {}
let counter = 0

export function toast(message: string, tone: 'success' | 'info' = 'success') {
  push({ message, tone })
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    push = ({ message, tone }) => {
      const id = ++counter
      setItems((prev) => [...prev, { id, message, tone }])
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 2800)
    }
    return () => {
      push = () => {}
    }
  }, [])

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-6 md:bottom-8">
      {items.map((t) => (
        <div
          key={t.id}
          className="flex max-w-sm items-center gap-2.5 rounded-md bg-ink px-4 py-3 text-sm font-medium text-bg shadow-2xl animate-rise"
        >
          {t.tone === 'success' ? (
            <CheckCircle2 size={16} className="shrink-0 text-accent" />
          ) : (
            <Info size={16} className="shrink-0 text-accent" />
          )}
          {t.message}
        </div>
      ))}
    </div>
  )
}
