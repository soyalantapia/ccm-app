import { useState, type FormEvent } from 'react'
import { Button, Input, toast } from '../../components/ui'
import { store, useStore } from '../../data/store'
import { FIELD_META, requireProfile } from '../../lib/profileRequest'
import type { ProfileFieldKey } from '../../data/types'
import { formatDay, sourceLabel } from './meta'

/**
 * Fila de progressive profiling (PRD §8.5): valor + origen de captura;
 * los vacíos se completan vía sheet global (D22) y los existentes se
 * editan con un mini form inline.
 */
export function ProfileFieldRow({ field }: { field: ProfileFieldKey }) {
  const captured = useStore((s) => s.getProfile().fields[field])
  const meta = FIELD_META[field]
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')

  const complete = async () => {
    const ok = await requireProfile([field], 'edicion_perfil', {
      title: 'Completá tu perfil',
      message: 'Una sola vez: no te lo volvemos a pedir.',
    })
    if (ok) toast('Perfil actualizado ✓')
  }

  const startEdit = () => {
    setValue(captured?.value ?? '')
    setEditing(true)
  }

  const save = (e: FormEvent) => {
    e.preventDefault()
    if (!value.trim()) return
    store.saveProfileFields({ [field]: value } as Partial<Record<ProfileFieldKey, string>>, 'edicion_perfil')
    setEditing(false)
    toast('Dato actualizado ✓')
  }

  return (
    <div className="border-t border-line py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow text-[10px] text-ink-soft">{meta.label}</div>
          {captured ? (
            <>
              <div className="mt-1 truncate text-[15px] text-ink">{captured.value}</div>
              <div className="mt-0.5 text-[11px] text-ink-soft/60">
                capturado al {sourceLabel(captured.source)} · {formatDay(captured.capturedAt)}
              </div>
            </>
          ) : (
            <div className="mt-1 text-sm text-ink-soft/50">Sin completar</div>
          )}
        </div>
        {captured ? (
          !editing && (
            <button
              onClick={startEdit}
              className="eyebrow shrink-0 pt-0.5 text-[10px] text-ink-soft transition-colors hover:text-accent"
            >
              Editar
            </button>
          )
        ) : (
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => void complete()}>
            + Completar
          </Button>
        )}
      </div>

      {editing && (
        <form onSubmit={save} className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            type={meta.type}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={meta.placeholder}
            aria-label={meta.label}
            autoComplete={meta.autocomplete}
            autoFocus
            className="min-w-0 flex-1 basis-48"
          />
          <Button type="submit" size="sm">
            Guardar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </form>
      )}
    </div>
  )
}
