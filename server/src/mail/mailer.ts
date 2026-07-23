import { env } from '../lib/env.js'
import type { EmailMsg } from './templates.js'

/**
 * Envío de email. Un puerto con tres implementaciones y una regla de resolución simple:
 * SMTP si hay host, si no Resend si hay clave, y si no la consola.
 *
 * Que el fallback sea la CONSOLA y no un error es deliberado: sin ninguna credencial
 * configurada el circuito de login funciona igual y el código sale por el log del server.
 * Eso permite probar invitación y OTP de punta a punta en local, y que un deploy sin
 * proveedor no deje a nadie afuera sin explicación.
 *
 * El envío es best-effort desde el punto de vista de quien llama: nunca debería tumbar
 * un request. Quien lo usa decide qué hacer si `delivered` viene en false.
 */

export interface Mailer {
  send(to: string, msg: EmailMsg): Promise<{ id: string; delivered: boolean }>
}

/** Emails "enviados" en dev, en memoria. Sirve para inspeccionarlos desde un test. */
const devOutbox: { to: string; msg: EmailMsg; at: string }[] = []
export const getDevOutbox = () => devOutbox
export const clearDevOutbox = () => void devOutbox.splice(0, devOutbox.length)

class ConsoleMailer implements Mailer {
  async send(to: string, msg: EmailMsg) {
    devOutbox.push({ to, msg, at: new Date().toISOString() })
    // Se loguea el cuerpo en texto plano a propósito: es lo que hace visible el código OTP
    // cuando no hay proveedor configurado.
    console.log(`\n[mail:dev] → ${to}\n[mail:dev] asunto: ${msg.subject}\n${msg.text}\n`)
    return { id: `dev-${devOutbox.length}`, delivered: false }
  }
}

class ResendMailer implements Mailer {
  constructor(
    private apiKey: string,
    private from: string,
  ) {}
  async send(to: string, msg: EmailMsg) {
    // Resend embebe imágenes inline vía adjuntos con content_id: el HTML las referencia con
    // `cid:...` y se ven sin pedir "mostrar imágenes".
    const attachments = msg.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content.toString('base64'),
      content_type: a.contentType,
      content_id: a.cid,
    }))
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: this.from,
        to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        ...(attachments?.length ? { attachments } : {}),
      }),
    })
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text().catch(() => '')}`)
    const data = (await res.json().catch(() => ({}))) as { id?: string }
    return { id: data.id ?? 'sent', delivered: true }
  }
}

class SmtpMailer implements Mailer {
  constructor(
    private from: string,
    private opts: { host: string; port: number; user?: string; pass?: string; secure: boolean },
  ) {}
  async send(to: string, msg: EmailMsg) {
    // Import dinámico: nodemailer sólo se carga si realmente hay SMTP configurado.
    const nodemailer = (await import('nodemailer')).default
    const tx = nodemailer.createTransport({
      host: this.opts.host,
      port: this.opts.port,
      secure: this.opts.secure, // 465 = TLS implícito; 587 = STARTTLS
      auth: this.opts.user ? { user: this.opts.user, pass: this.opts.pass } : undefined,
      // Timeouts explícitos: sin esto un SMTP inalcanzable cuelga el envío varios minutos.
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    })
    // nodemailer embebe imágenes inline con `cid`: el HTML las referencia con `cid:...`.
    const attachments = msg.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
      cid: a.cid,
    }))
    const info = await tx.sendMail({
      from: this.from,
      to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      ...(attachments?.length ? { attachments } : {}),
    })
    return { id: info.messageId ?? 'sent', delivered: true }
  }
}

/**
 * ⚠️ Este default apunta a un dominio que TODAVÍA NO EXISTE (corazondemoda.com está sin
 * comprar). Si se usa de verdad, el servidor SMTP rechaza cada envío con
 * `450 4.1.8 Sender address rejected: Domain not found` — verificado contra Hostinger el
 * 22/07/2026. O sea: sin MAIL_FROM no sale un solo mail, y el código por mail es el ÚNICO
 * login del panel. Por eso assertProd lo exige (lib/env.ts) en vez de dejar que degrade solo.
 * Cuando se compre el dominio, además de cambiar MAIL_FROM hay que configurarle SPF y DKIM.
 */
const DEFAULT_FROM = 'CCM <no-reply@corazondemoda.com>'

let override: Mailer | null = null
let singleton: Mailer | null = null

/** El mailer que corresponde según el entorno. */
export function getMailer(): Mailer {
  if (override) return override
  if (singleton) return singleton
  const from = env.MAIL_FROM ?? DEFAULT_FROM
  if (env.SMTP_HOST) {
    const port = env.SMTP_PORT ?? 465
    singleton = new SmtpMailer(from, {
      host: env.SMTP_HOST,
      port,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      secure: port === 465,
    })
  } else if (env.RESEND_API_KEY) {
    singleton = new ResendMailer(env.RESEND_API_KEY, from)
  } else {
    singleton = new ConsoleMailer()
  }
  return singleton
}

/** Qué proveedor quedó activo — para loguearlo al arrancar y no adivinar en producción. */
export function mailerKind(): 'smtp' | 'resend' | 'console' {
  if (env.SMTP_HOST) return 'smtp'
  if (env.RESEND_API_KEY) return 'resend'
  return 'console'
}

/** Inyecta un mailer falso (tests). Tiene prioridad sobre todo. */
export function setMailer(m: Mailer | null) {
  override = m
}

/** Olvida el mailer cacheado (tests, o si cambia la config). */
export function resetMailer() {
  singleton = null
}
