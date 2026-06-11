import { useEffect, useState } from 'react'

function parts(to: string) {
  const diff = Math.max(0, new Date(to).getTime() - Date.now())
  return {
    d: Math.floor(diff / 86400000),
    h: Math.floor(diff / 3600000) % 24,
    m: Math.floor(diff / 60000) % 60,
    s: Math.floor(diff / 1000) % 60,
  }
}

export function Countdown({ to, tone = 'ink', className }: { to: string; tone?: 'ink' | 'night'; className?: string }) {
  const [t, setT] = useState(() => parts(to))
  useEffect(() => {
    const id = setInterval(() => setT(parts(to)), 1000)
    return () => clearInterval(id)
  }, [to])

  const units = [
    { value: t.d, label: 'días' },
    { value: t.h, label: 'horas' },
    { value: t.m, label: 'min' },
    { value: t.s, label: 'seg' },
  ]
  const num = tone === 'night' ? 'text-night-ink' : 'text-ink'
  const lab = tone === 'night' ? 'text-night-ink/55' : 'text-ink-soft'

  return (
    <div className={`flex items-start gap-5 sm:gap-8 ${className ?? ''}`}>
      {units.map((u, i) => (
        <div key={u.label} className="flex items-start gap-5 sm:gap-8">
          <div className="text-center">
            <div className={`type-display text-3xl tabular-nums sm:text-5xl ${num}`}>
              {String(u.value).padStart(2, '0')}
            </div>
            <div className={`eyebrow mt-1.5 text-[9px] ${lab}`}>{u.label}</div>
          </div>
          {i < units.length - 1 && (
            <span aria-hidden className={`type-serif mt-1 text-2xl sm:text-4xl ${tone === 'night' ? 'text-accent' : 'text-accent'}`}>
              ·
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
