import sanitizeHtml from 'sanitize-html'
import { prisma } from '../lib/prisma.js'
import { badRequest, notFound } from '../lib/errors.js'
import { EDITABLE_TEMPLATES, renderEditable, type EmailMsg } from '../mail/templates.js'

/**
 * Plantillas de email editables desde el panel (pestaña Automatizaciones).
 *
 * El registry (mail/templates.ts) define el DEFAULT de cada mail con tokens {{variable}}. Acá se
 * guarda/lee el OVERRIDE que escribió el organizador y se arma el mail efectivo (override o default).
 * Diseño de seguridad — quién puede meter qué:
 *   - el HTML del override se SANEA con allowlist al guardarse (nada de <script>, on*, javascript:),
 *   - los VALORES se escapan al interpolar (renderEditable), así un {{evento}} con <b> no inyecta,
 *   - el envoltorio de marca, el pie y el QR los pone el server, no el admin.
 * Ausencia de fila = usar el default del código. Por eso "restaurar el original" es borrar la fila.
 */

/** Allowlist para HTML de email: tablas + estilos en línea (lo único que renderiza parejo en los
 *  clientes de correo), sin nada ejecutable. `cid` habilitado por si el admin referencia el QR. */
const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    'div', 'span', 'p', 'a', 'strong', 'b', 'em', 'i', 'u', 's', 'br', 'hr',
    'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'small', 'sub', 'sup',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'img',
  ],
  allowedAttributes: {
    '*': ['style', 'align', 'valign', 'width', 'height', 'bgcolor'],
    a: ['href', 'target', 'rel', 'style'],
    img: ['src', 'width', 'height', 'alt', 'style'],
    table: ['role', 'cellpadding', 'cellspacing', 'border', 'width', 'align', 'bgcolor', 'style'],
    td: ['colspan', 'rowspan', 'align', 'valign', 'width', 'bgcolor', 'style'],
    th: ['colspan', 'rowspan', 'align', 'valign', 'width', 'bgcolor', 'style'],
  },
  // cid: el QR embebido. NADA de javascript:/data: (data: abre la puerta a payloads).
  allowedSchemes: ['http', 'https', 'mailto', 'tel', 'cid'],
  allowedSchemesByTag: { img: ['http', 'https', 'cid'] },
  disallowedTagsMode: 'discard',
  // Los tokens {{qr}} etc. son texto: sanitize-html los deja pasar tal cual.
}

/** Sanea un HTML de email escrito por un admin. Exportado para poder testearlo suelto. */
export function sanitizarHtmlEmail(html: string): string {
  return sanitizeHtml(html, SANITIZE)
}

/** Arma el EmailMsg efectivo de una plantilla: si hay override guardado, pisa; si no, el default. */
export async function renderMail(
  key: string,
  opts: Record<string, unknown>,
  o: { qrCid?: string } = {},
): Promise<EmailMsg> {
  const def = EDITABLE_TEMPLATES[key]
  if (!def) throw new Error(`Plantilla de email desconocida: ${key}`)
  const row = await prisma.emailTemplate.findUnique({ where: { key } })
  const override = row ? { subject: row.subject, html: row.html } : null
  return renderEditable(key, def.valores(opts), { qrCid: o.qrCid, override })
}

export interface PlantillaAdmin {
  key: string
  nombre: string
  descripcion: string
  variables: { token: string; descripcion: string; ejemplo: string }[]
  hasQr: boolean
  /** Efectivos (override si hay, si no el default): lo que se edita en el panel. */
  subject: string
  html: string
  /** El original del código, para "restaurar". */
  defaultSubject: string
  defaultHtml: string
  isOverridden: boolean
  updatedAt: string | null
}

/** Todas las plantillas editables con su estado efectivo, para pintar la pestaña Automatizaciones. */
export async function listarPlantillas(): Promise<PlantillaAdmin[]> {
  const rows = await prisma.emailTemplate.findMany()
  const byKey = new Map(rows.map((r) => [r.key, r]))
  return Object.values(EDITABLE_TEMPLATES).map((def) => {
    const ov = byKey.get(def.key)
    return {
      key: def.key,
      nombre: def.nombre,
      descripcion: def.descripcion,
      variables: def.variables,
      hasQr: !!def.hasQr,
      subject: ov?.subject ?? def.defaultSubject,
      html: ov?.html ?? def.defaultInner,
      defaultSubject: def.defaultSubject,
      defaultHtml: def.defaultInner,
      isOverridden: !!ov,
      updatedAt: ov?.updatedAt.toISOString() ?? null,
    }
  })
}

/** Guarda (upsert) el override de una plantilla. Sanea el HTML antes de persistir. */
export async function guardarPlantilla(
  key: string,
  input: { subject?: string; html?: string },
  adminId: string | null,
): Promise<PlantillaAdmin> {
  const def = EDITABLE_TEMPLATES[key]
  if (!def) throw notFound('PLANTILLA_NOT_FOUND', 'Esa plantilla de email no existe.')
  const subject = (input.subject ?? '').trim()
  if (!subject) throw badRequest('SUBJECT_VACIO', 'El asunto no puede quedar vacío.')
  const html = sanitizarHtmlEmail(input.html ?? '')
  if (!html.trim()) throw badRequest('HTML_VACIO', 'El cuerpo del email no puede quedar vacío.')
  await prisma.emailTemplate.upsert({
    where: { key },
    create: { key, subject, html, updatedById: adminId },
    update: { subject, html, updatedById: adminId },
  })
  return (await listarPlantillas()).find((p) => p.key === key)!
}

/** Restaura la plantilla a su original (borra el override). Idempotente. */
export async function restaurarPlantilla(key: string): Promise<PlantillaAdmin> {
  if (!EDITABLE_TEMPLATES[key]) throw notFound('PLANTILLA_NOT_FOUND', 'Esa plantilla de email no existe.')
  await prisma.emailTemplate.deleteMany({ where: { key } })
  return (await listarPlantillas()).find((p) => p.key === key)!
}

/** Caja gris que ocupa el lugar del QR en el preview (en el mail real va el código embebido). */
const QR_PLACEHOLDER = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;"><tr><td align="center" style="padding:6px 0 14px;">
  <div style="width:220px;height:220px;border-radius:10px;border:1px dashed #c9bcaa;background:#f0e9df;color:#9a8b7c;font-family:sans-serif;font-size:13px;line-height:220px;text-align:center;">Código QR</div>
</td></tr></table>`

/**
 * Renderiza un BORRADOR (sin guardarlo) con valores de EJEMPLO, para el preview del panel. Sanea el
 * HTML igual que al guardar, así el organizador ve exactamente lo que se persistiría. El {{qr}} se
 * muestra como una caja "Código QR" (en el mail real va el código embebido de cada entrada).
 */
export async function previewPlantilla(
  key: string,
  draft: { subject?: string; html?: string },
): Promise<{ subject: string; html: string }> {
  const def = EDITABLE_TEMPLATES[key]
  if (!def) throw notFound('PLANTILLA_NOT_FOUND', 'Esa plantilla de email no existe.')
  const html = sanitizarHtmlEmail(draft.html ?? '')
  const subject = (draft.subject ?? '').trim() || def.defaultSubject
  const valores: Record<string, string> = {}
  for (const v of def.variables) if (v.token !== 'qr') valores[v.token] = v.ejemplo
  const msg = renderEditable(key, valores, { override: { subject, html }, qrImg: def.hasQr ? QR_PLACEHOLDER : '' })
  return { subject: msg.subject, html: msg.html }
}
