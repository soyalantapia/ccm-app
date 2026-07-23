import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Copy, Gift, Send, Trash2 } from 'lucide-react'
import { Badge, Button, Field, Input, Select, Textarea, toast } from '../../components/ui'
import { useStore } from '../../data/store'
import {
  regalarEntradas,
  reenviarRegalo,
  revocarRegalo,
  usePersonGrants,
  type GrantEnvio,
  type GrantFicha,
} from '../../data/queries'
import { ApiError } from '../../lib/api'
import { formatDateTime } from './coreFormat'

const STATUS_META: Record<GrantFicha['status'], { label: string; tone: 'neutral' | 'success' | 'outline' }> = {
  pendiente: { label: 'Enviada, sin usar', tone: 'neutral' },
  reclamado: { label: 'Activada', tone: 'success' },
  revocado: { label: 'Dada de baja', tone: 'outline' },
}

/** Traduce el resultado del envío a un cartel honesto: no promete que llegó si el mailer no confirmó. */
function avisoEnvio(envio: GrantEnvio, verbo: string): void {
  if (envio.enviado) {
    toast(`${verbo}: le llegó el mail con el código QR.`)
    return
  }
  const motivo =
    envio.motivo === 'sin_email'
      ? 'esta persona no tiene email cargado'
      : 'el mail no salió'
  toast(`${verbo}, pero ${motivo}. Copiá el link y pasáselo por donde prefieras.`, 'info')
}

/**
 * Regalar entradas desde la ficha — el lado del ORGANIZADOR (lo que pidió Gastón: pararse sobre una
 * persona y darle N entradas a un evento, tenga costo o no; a ella le llega el mail con el QR).
 *
 * El cupo se reserva al otorgar y el mail sale solo; acá se orquesta el form + la lista de lo ya
 * regalado, con acciones de reenviar y dar de baja. Todo lo pesado (token, cupo, mail) vive en el
 * backend.
 */
export function RegalarEntradas({ personId }: { personId: string }) {
  const qc = useQueryClient()
  const { data: grants, isLoading } = usePersonGrants(personId)
  // Regalables: publicados y que no hayan pasado (el backend igual lo valida; esto evita ofrecer
  // en el selector lo que después rebotaría). Incluye el evento principal, workshops e iniciativas.
  const eventos = useStore((s) => s.getAdminEvents().filter((e) => e.published && !e.past))

  const [abierto, setAbierto] = useState(false)
  const [eventId, setEventId] = useState('')
  const [qty, setQty] = useState('1')
  const [note, setNote] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null) // id del grant con una acción en curso

  function refrescar() {
    void qc.invalidateQueries({ queryKey: ['grants', personId] })
    void qc.invalidateQueries({ queryKey: ['people', 'ficha', personId] })
  }

  async function copiar(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      toast('Link copiado.')
    } catch {
      toast('No se pudo copiar. Copialo a mano desde la barra del navegador.', 'info')
    }
  }

  async function enviar() {
    const n = Number(qty)
    if (!eventId) return toast('Elegí a qué evento la regalás.', 'info')
    if (!Number.isInteger(n) || n < 1 || n > 20) return toast('La cantidad tiene que ser un número de 1 a 20.', 'info')
    setEnviando(true)
    try {
      const res = await regalarEntradas({ personId, eventId, qty: n, note: note.trim() || undefined })
      avisoEnvio(res.envio, `Regalaste ${n === 1 ? 'una entrada' : `${n} entradas`}`)
      setEventId('')
      setQty('1')
      setNote('')
      setAbierto(false)
      refrescar()
    } catch (err) {
      toast(err instanceof ApiError ? err.userMessage : 'No se pudo regalar. Probá de nuevo.', 'info')
    } finally {
      setEnviando(false)
    }
  }

  async function reenviar(id: string) {
    setOcupado(id)
    try {
      avisoEnvio(await reenviarRegalo(id), 'Reenviado')
    } catch {
      toast('No se pudo reenviar. Probá de nuevo.', 'info')
    } finally {
      setOcupado(null)
    }
  }

  async function revocar(g: GrantFicha) {
    const extra = g.status === 'reclamado' ? ' Como ya la activó, también se cancela su inscripción.' : ''
    if (!window.confirm(`¿Dar de baja esta entrada regalada?${extra}`)) return
    setOcupado(g.id)
    try {
      await revocarRegalo(g.id)
      toast('Entrada dada de baja.')
      refrescar()
    } catch {
      toast('No se pudo dar de baja. Probá de nuevo.', 'info')
    } finally {
      setOcupado(null)
    }
  }

  const activas = (grants ?? []).filter((g) => g.status !== 'revocado')

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow text-[9px] text-ink-soft">Entradas regaladas</p>
        {!abierto && (
          <Button variant="outline" size="sm" onClick={() => setAbierto(true)} className="gap-1.5">
            <Gift className="size-3.5" strokeWidth={1.75} /> Regalar entradas
          </Button>
        )}
      </div>

      {abierto && (
        <div className="mt-3 space-y-3 rounded-sm border border-line bg-surface p-4">
          <Field label="¿A qué evento?" required>
            <Select
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              placeholder={eventos.length ? 'Elegí un evento…' : 'No hay eventos publicados para regalar'}
              options={eventos.map((e) => ({ value: e.id, label: e.title }))}
            />
          </Field>
          <Field label="¿Cuántas entradas?" required hint="De 1 a 20. El cupo se reserva al regalarlas.">
            <Input
              type="number"
              min={1}
              max={20}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </Field>
          <Field label="Nota interna (opcional)" hint="Solo la ven ustedes; no viaja en el mail.">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Prensa, jurado, invitado de…" />
          </Field>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAbierto(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => void enviar()} disabled={enviando} className="gap-1.5">
              <Send className="size-3.5" strokeWidth={1.75} />
              {enviando ? 'Regalando…' : 'Regalar y enviar mail'}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="mt-3 text-sm text-ink-soft">Cargando…</p>
      ) : activas.length === 0 ? (
        !abierto && <p className="mt-3 text-sm text-ink-soft">Todavía no le regalaste ninguna entrada.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {activas.map((g) => {
            const meta = STATUS_META[g.status]
            const trabajando = ocupado === g.id
            return (
              <li key={g.id} className="rounded-sm border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="text-[13px] text-ink">
                    {g.eventTitle}
                    {g.qty > 1 && <span className="text-ink-soft"> × {g.qty}</span>}
                  </span>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>
                <p className="mt-1 text-[11px] text-ink-soft">{formatDateTime(g.createdAt)}</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {g.link && (
                    <Button variant="ghost" size="sm" onClick={() => void copiar(g.link!)} className="gap-1.5">
                      <Copy className="size-3.5" strokeWidth={1.75} /> Copiar link
                    </Button>
                  )}
                  {g.status !== 'reclamado' && (
                    <Button variant="ghost" size="sm" onClick={() => void reenviar(g.id)} disabled={trabajando} className="gap-1.5">
                      <Send className="size-3.5" strokeWidth={1.75} /> Reenviar mail
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => void revocar(g)} disabled={trabajando} className="gap-1.5 text-danger">
                    <Trash2 className="size-3.5" strokeWidth={1.75} /> Dar de baja
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
