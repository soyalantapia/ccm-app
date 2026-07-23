import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Mail, RotateCcw } from 'lucide-react'
import { Badge, Button, Card, Field, Input, SectionTitle, Sheet, inputClass, toast } from '../../components/ui'
import { IS_REMOTE } from '../../data/store'
import { ApiError } from '../../lib/api'
import {
  guardarPlantillaEmail,
  previewPlantillaEmail,
  restaurarPlantillaEmail,
  useEmailTemplates,
  type EmailTemplateAdmin,
} from '../../data/queries'

/**
 * Automatizaciones — editar el HTML de los mails que salen solos (cortesía, postulación
 * aceptada/rechazada). Lo que pidió el cliente: "que el día de mañana puedan cambiar el email en
 * HTML". El organizador edita el CUERPO y el ASUNTO; el server pone el envoltorio de marca, escapa
 * los valores y sanea el HTML al guardar. La vista previa se renderiza en el server (con valores de
 * ejemplo) y se muestra en un iframe aislado (sandbox, sin scripts).
 */
export default function AdminAutomatizaciones() {
  const { data: plantillas, isLoading, isError } = useEmailTemplates()
  const [editando, setEditando] = useState<EmailTemplateAdmin | null>(null)

  return (
    <div className="px-5 py-8 md:px-10">
      <SectionTitle
        eyebrow="Admin · Automatizaciones"
        title="Automatizaciones"
        lead="Los correos que se mandan solos. Editá el asunto y el cuerpo en HTML; la marca, el pie y los datos los pone el sistema."
      />

      {!IS_REMOTE && (
        <p className="mt-6 max-w-2xl rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink-soft">
          Estás en la demo sin backend: acá vas a poder ver las plantillas, pero para editarlas hace
          falta el sistema conectado.
        </p>
      )}

      {isLoading && <p className="mt-8 text-sm text-ink-soft">Cargando plantillas…</p>}
      {isError && <p className="mt-8 text-sm text-danger">No se pudieron cargar las plantillas.</p>}

      <div className="mt-8 grid max-w-3xl gap-3">
        {(plantillas ?? []).map((t) => (
          <Card key={t.key} className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <Mail className="size-4 shrink-0 text-accent-strong" strokeWidth={1.75} />
                <h3 className="type-title text-base text-ink">{t.nombre}</h3>
                {t.isOverridden ? (
                  <Badge tone="accent">Personalizado</Badge>
                ) : (
                  <Badge tone="neutral">Original</Badge>
                )}
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{t.descripcion}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditando(t)}>
              Editar
            </Button>
          </Card>
        ))}
      </div>

      <EditorPlantilla plantilla={editando} onClose={() => setEditando(null)} />
    </div>
  )
}

function EditorPlantilla({ plantilla, onClose }: { plantilla: EmailTemplateAdmin | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [subject, setSubject] = useState('')
  const [html, setHtml] = useState('')
  const [preview, setPreview] = useState('')
  const [guardando, setGuardando] = useState(false)
  const htmlRef = useRef<HTMLTextAreaElement>(null)

  // Al abrir una plantilla, cargar sus valores efectivos (override o default) en el editor.
  useEffect(() => {
    if (plantilla) {
      setSubject(plantilla.subject)
      setHtml(plantilla.html)
      setPreview('')
    }
  }, [plantilla])

  // Preview con debounce: se renderiza en el server (saneado, valores de ejemplo) y va al iframe.
  useEffect(() => {
    if (!plantilla) return
    const t = setTimeout(() => {
      previewPlantillaEmail(plantilla.key, { subject, html })
        .then((r) => setPreview(r.html))
        .catch(() => {})
    }, 500)
    return () => clearTimeout(t)
  }, [plantilla, subject, html])

  function insertarToken(token: string) {
    const el = htmlRef.current
    const marca = `{{${token}}}`
    if (!el) {
      setHtml((h) => h + marca)
      return
    }
    const ini = el.selectionStart ?? html.length
    const fin = el.selectionEnd ?? html.length
    const nuevo = html.slice(0, ini) + marca + html.slice(fin)
    setHtml(nuevo)
    // devolver el foco con el cursor después del token insertado
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = ini + marca.length
    })
  }

  async function guardar() {
    if (!plantilla) return
    setGuardando(true)
    try {
      const actualizada = await guardarPlantillaEmail(plantilla.key, { subject, html })
      qc.setQueryData<EmailTemplateAdmin[]>(['email-templates'], (prev) =>
        (prev ?? []).map((p) => (p.key === actualizada.key ? actualizada : p)),
      )
      toast('Plantilla guardada. Los próximos correos usan esta versión.')
      onClose()
    } catch (err) {
      toast(err instanceof ApiError ? err.userMessage : 'No se pudo guardar. Probá de nuevo.', 'info')
    } finally {
      setGuardando(false)
    }
  }

  async function restaurar() {
    if (!plantilla) return
    if (!window.confirm('¿Restaurar el texto original de este correo? Se pierde tu versión personalizada.')) return
    setGuardando(true)
    try {
      const original = await restaurarPlantillaEmail(plantilla.key)
      qc.setQueryData<EmailTemplateAdmin[]>(['email-templates'], (prev) =>
        (prev ?? []).map((p) => (p.key === (original as EmailTemplateAdmin).key ? (original as EmailTemplateAdmin) : p)),
      )
      // recargar el editor con el original
      const orig = original as EmailTemplateAdmin
      setSubject(orig.subject)
      setHtml(orig.html)
      toast('Restaurado al texto original.')
    } catch {
      toast('No se pudo restaurar. Probá de nuevo.', 'info')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Sheet open={plantilla !== null} onClose={onClose} title={plantilla?.nombre ?? 'Plantilla'} size="xl">
      {plantilla && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* ── Editor ── */}
            <div className="space-y-4">
              <Field label="Asunto">
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </Field>

              <div>
                <p className="eyebrow mb-1.5 text-[10px] text-ink-soft">Variables — tocá una para insertarla</p>
                <div className="flex flex-wrap gap-1.5">
                  {plantilla.variables.map((v) => (
                    <button
                      key={v.token}
                      type="button"
                      onClick={() => insertarToken(v.token)}
                      title={`${v.descripcion} (ej: ${v.ejemplo})`}
                      className="rounded-sm border border-line bg-surface px-2 py-1 font-mono text-[11px] text-ink transition-colors hover:border-accent hover:text-accent-strong"
                    >
                      {`{{${v.token}}}`}
                    </button>
                  ))}
                </div>
              </div>

              <Field label="Cuerpo del correo (HTML)" hint="El encabezado con el logo, el pie y el fondo los agrega el sistema.">
                <textarea
                  ref={htmlRef}
                  value={html}
                  onChange={(e) => setHtml(e.target.value)}
                  rows={16}
                  spellCheck={false}
                  className={`${inputClass} resize-y font-mono !text-[12px] leading-relaxed`}
                />
              </Field>
            </div>

            {/* ── Vista previa ── */}
            <div>
              <p className="eyebrow mb-1.5 text-[10px] text-ink-soft">Vista previa (con datos de ejemplo)</p>
              <div className="overflow-hidden rounded-md border border-line bg-white">
                <iframe
                  // sandbox vacío: el preview NUNCA ejecuta scripts ni formularios, aunque el HTML los tuviera.
                  sandbox=""
                  title="Vista previa del correo"
                  srcDoc={preview}
                  className="h-[520px] w-full border-0"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            {plantilla.isOverridden ? (
              <Button variant="ghost" size="sm" onClick={() => void restaurar()} disabled={guardando} className="gap-1.5 text-ink-soft">
                <RotateCcw className="size-3.5" strokeWidth={1.75} /> Restaurar original
              </Button>
            ) : (
              <span className="text-xs text-ink-soft">Estás viendo el texto original.</span>
            )}
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={guardando}>
                Cancelar
              </Button>
              <Button size="sm" onClick={() => void guardar()} disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  )
}
