import { useState } from 'react'
import { Button, Field, Sheet, Textarea, toast } from '../../components/ui'
import { store, useStore } from '../../data/store'
import type { Application, ConvocatoriaField } from '../../data/types'
import { OpsDangerButton } from './OpsDangerButton'
import { deriveApplicationFields } from './applicationFields'

type DecisionStatus = 'aceptada' | 'rechazada'

/**
 * Subject + cuerpo en texto plano de `server/src/mail/templates.ts`
 * (`applicationAcceptedEmail` / `applicationRejectedEmail`), copiados A MANO: son funciones del
 * SERVER (usan `@prisma/client`), así que no se pueden importar desde el front. Si esas
 * plantillas cambian, este preview queda desactualizado hasta que alguien lo note acá.
 *
 * El saludo replica la MISMA lógica que `applicationService.decideApplication` en vez de la
 * heurística de `deriveApplicationFields` (que prueba 'nombre'/'name'/'firstName' y los fields de
 * la convocatoria): el server, al armar el mail, sólo mira `data.nombre` literal y cae a 'Hola'
 * si no está. Mostrar el título derivado acá sería un preview lindo pero MENTIROSO — el
 * organizador tiene que ver el mismo "Hola Hola." raro que va a leer la persona si la
 * convocatoria no tiene un campo con esa key exacta.
 */
function subjectFor(status: DecisionStatus, convocatoria: string): string {
  return status === 'aceptada' ? `Quedaste seleccionado — ${convocatoria}` : `Sobre tu postulación a ${convocatoria}`
}

function bodyFor(status: DecisionStatus, nombre: string, convocatoria: string): string {
  return status === 'aceptada'
    ? `Quedaste seleccionado.

Hola ${nombre}. Tu postulación a ${convocatoria} fue aceptada por el equipo de CCM.

En los próximos días te escribimos con los detalles de la fecha, el lugar y lo que tenés que llevar.
Si tenés alguna consulta, respondé este mail.`
    : `Sobre tu postulación.

Hola ${nombre}. Gracias por postularte a ${convocatoria}.

Esta vez no pudimos darte un lugar. Recibimos muchas más postulaciones que cupos, y la decisión fue difícil.

Nos gustaría verte en las próximas convocatorias. Seguí atento, que van a salir pronto.`
}

interface OpsDecisionSheetProps {
  app: Application
  status: DecisionStatus
  open: boolean
  onClose: () => void
}

/**
 * Confirmación de una decisión de postulación. Antes "Aceptar"/"Rechazar" decidían en un click,
 * sin vuelta atrás y sin que el organizador viera qué le iba a llegar a la persona — acá se
 * muestra el mail REAL (no una descripción tipo "se enviará un correo"), una nota interna
 * opcional, y un check para no avisar (casos que se manejan a mano). Al confirmar, la ventana de
 * "Deshacer" cubre el ESTADO (`decideApplication(id, 'preinscripta')`), no el mail: el envío
 * ocurre en la misma llamada al servidor que guarda la decisión, así que un mail ya salido no se
 * puede cancelar. Por eso ese matiz se explica ACÁ, antes de confirmar — no en el toast, que es
 * de un renglón y se lee después del hecho.
 */
export function OpsDecisionSheet({ app, status, open, onClose }: OpsDecisionSheetProps) {
  const [note, setNote] = useState('')
  const [skipEmail, setSkipEmail] = useState(false)

  const convocatoria = useStore((s) => s.getConvocatorias().find((c) => c.id === app.convocatoriaId))
  const fields: ConvocatoriaField[] = convocatoria?.fields ?? []
  const { title } = deriveApplicationFields(app, fields)

  // Literal y no heurístico a propósito (ver comentario de bodyFor): es EXACTAMENTE lo que mira
  // el server para decidir si hay a quién escribirle y qué saludo poner.
  const emailReal = typeof app.data.email === 'string' ? app.data.email.trim() : ''
  const nombreReal = typeof app.data.nombre === 'string' && app.data.nombre.trim() ? app.data.nombre.trim() : 'Hola'
  const convocatoriaTitulo = convocatoria?.title ?? 'la convocatoria'

  const puedeEnviar = !app.fromSeed && !!emailReal

  const confirmar = () => {
    store.decideApplication(app.id, status, {
      note: note.trim() || undefined,
      skipEmail,
    })
    onClose()
    toast(status === 'aceptada' ? '✓ Postulación aceptada' : 'Postulación rechazada', {
      tone: status === 'aceptada' ? 'success' : 'info',
      action: {
        label: 'Deshacer',
        onClick: () => store.decideApplication(app.id, 'preinscripta'),
      },
    })
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={status === 'aceptada' ? 'Aceptar postulación' : 'Rechazar postulación'}
      size="lg"
    >
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-ink-soft">
          Postulación de <strong className="font-semibold text-ink">{title}</strong>
          {emailReal && (
            <>
              {' '}
              — se le va a escribir a <span className="text-ink">{emailReal}</span>
            </>
          )}
        </p>

        {puedeEnviar ? (
          <div className="rounded-md border border-line bg-bg/40 p-4">
            <p className="eyebrow text-[10px] text-ink-soft">Mail que se va a mandar</p>
            <p className="mt-2.5 text-[15px] font-semibold text-ink">{subjectFor(status, convocatoriaTitulo)}</p>
            <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
              {bodyFor(status, nombreReal, convocatoriaTitulo)}
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-line bg-bg/40 p-4">
            <p className="eyebrow text-[10px] text-ink-soft">No se va a mandar mail</p>
            <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">
              {app.fromSeed
                ? 'Es una postulación de ejemplo (datos de demo): nunca se le avisa a nadie.'
                : 'No hay un email cargado en los datos de esta postulación.'}{' '}
              La decisión se guarda igual.
            </p>
          </div>
        )}

        <Field label="Nota interna" hint="El postulante NO ve esta nota — queda solo para el equipo.">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Opcional…"
          />
        </Field>

        {puedeEnviar && (
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={skipEmail}
              onChange={(e) => setSkipEmail(e.target.checked)}
              className="mt-0.5 size-4 accent-accent"
            />
            <span className="text-[15px] text-ink">
              No enviar mail <span className="text-ink-soft">— lo aviso yo a mano</span>
            </span>
          </label>
        )}

        {/* Sólo tiene sentido cuando el mail REALMENTE va a salir: si no hay a quién escribirle
         *  o el organizador tildó "no enviar mail", no hay ningún envío que "Deshacer" no pueda
         *  cancelar, y mostrar la advertencia igual sería ruido (o peor, confuso). */}
        {puedeEnviar && !skipEmail && (
          <p className="text-[11px] leading-relaxed text-ink-soft/80">
            Si después tocás &quot;Deshacer&quot;, la postulación vuelve a revisión — pero el mail sale en el mismo
            momento en que confirmás, así que si ya salió, deshacer el estado no lo cancela.
          </p>
        )}

        <div className="flex gap-2.5">
          <Button variant="ghost" className="flex-1 justify-center" onClick={onClose}>
            Cancelar
          </Button>
          {status === 'aceptada' ? (
            <Button className="flex-1 justify-center" onClick={confirmar}>
              Confirmar aceptación
            </Button>
          ) : (
            <OpsDangerButton className="flex-1 justify-center" onClick={confirmar}>
              Confirmar rechazo
            </OpsDangerButton>
          )}
        </div>
      </div>
    </Sheet>
  )
}
