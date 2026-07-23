import type { AdminRole } from '@prisma/client'
import { ROLE_LABEL, ROLE_CAPS } from '../domain/adminRoles.js'

/**
 * Plantillas de email del panel. Dos, y alcanzan: el código para entrar, y el aviso de que
 * alguien ya tiene acceso.
 *
 * HTML con estilos EN LÍNEA y maquetado con tablas, que es lo único que renderizan parejo
 * Gmail, Outlook y compañía. Cada mail lleva además su versión en texto plano: es lo que ve
 * quien tiene el HTML desactivado, lo que indexa el cliente de correo, y —en desarrollo— lo
 * que se imprime en el log del servidor cuando no hay proveedor configurado.
 *
 * Paleta tomada de la identidad de CCM (bordó y crema del panel), no la de Speed.
 */

/**
 * Un adjunto embebido en el cuerpo. `cid` es el identificador con el que el HTML lo referencia
 * (`<img src="cid:...">`) para que la imagen se vea SIN que el cliente de correo tenga que "mostrar
 * imágenes" — es el caso del QR de una entrada regalada. Opcional: las plantillas que no lo usan
 * no cambian.
 */
export interface EmailAttachment {
  filename: string
  content: Buffer
  contentType: string
  cid: string
}

export interface EmailMsg {
  subject: string
  html: string
  text: string
  attachments?: EmailAttachment[]
}

/** Escapa lo que venga de la base antes de meterlo en el HTML del mail. */
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const INK = '#33261d' // bordó oscuro de la marca
const ACCENT = '#a8442a' // terracota
const PAPER = '#f5f0e8' // crema del fondo
const MUTED = '#7a6a5d'

const FOOTER_ACCESO =
  'Te llega este mail porque alguien del equipo de CCM pidió acceso para esta dirección.<br>Si no fuiste vos, podés ignorarlo.'

/** Envoltorio común: fondo, tarjeta central, pie. `preview` es la línea que se ve en la bandeja.
 *  `footer` cambia según el mail (acceso al panel vs. una invitación al evento). */
function shell({ preview, inner, footer = FOOTER_ACCESO }: { preview: string; inner: string; footer?: string }): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CCM</title></head>
<body style="margin:0;padding:0;background-color:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PAPER};padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#ffffff;border-radius:14px;border:1px solid #e6ddd1;">
      <tr><td style="padding:32px 32px 8px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:${ACCENT};">Córdoba Corazón de Moda</div>
      </td></tr>
      <tr><td style="padding:8px 32px 32px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        ${inner}
      </td></tr>
    </table>
    <div style="max-width:520px;margin-top:18px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:${MUTED};text-align:center;">
      ${footer}
    </div>
  </td></tr>
</table>
</body></html>`
}

const h1 = (t: string) =>
  `<h1 style="margin:0 0 12px;color:${INK};font-size:23px;line-height:1.25;font-weight:700;letter-spacing:-0.01em;">${t}</h1>`

const p = (t: string) => `<p style="margin:0 0 18px;color:${MUTED};font-size:15px;line-height:1.65;">${t}</p>`

const button = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 2px;"><tr>
    <td align="center" bgcolor="${ACCENT}" style="background-color:${ACCENT};border-radius:10px;">
      <a href="${href}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${label}</a>
    </td>
  </tr></table>`

/** Lista de "qué vas a poder hacer", con viñetas en el color de la marca. */
const capsList = (items: string[]) => `
  <div style="color:${ACCENT};font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin:0 0 11px;">Qué vas a poder hacer</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">
    ${items
      .map(
        (it) => `<tr>
      <td valign="top" style="width:18px;padding:0 0 9px;color:${ACCENT};font-size:15px;line-height:1.5;">&#9656;</td>
      <td valign="top" style="padding:0 0 9px;color:${INK};font-size:14px;line-height:1.55;">${esc(it)}</td>
    </tr>`,
      )
      .join('')}
  </table>`

/** El código para entrar. Se manda cada vez que alguien lo pide desde el login. */
export function otpEmail(opts: { name: string; code: string; ttlMin: number }): EmailMsg {
  const inner = `
    ${h1('Tu código para entrar')}
    ${p(`Hola ${esc(opts.name)}, usá este código para entrar al panel de CCM.`)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px;"><tr>
      <td align="center" bgcolor="${PAPER}" style="background-color:${PAPER};border:1px solid #e6ddd1;border-radius:12px;padding:22px 16px;">
        <div style="color:${ACCENT};font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;margin:0 0 10px;">Código de acceso</div>
        <div style="font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:38px;line-height:1;font-weight:700;letter-spacing:12px;color:${INK};padding-left:12px;">${esc(opts.code)}</div>
      </td>
    </tr></table>
    <p style="margin:0;color:${MUTED};font-size:13px;line-height:1.6;">Vence en <strong style="color:${INK};">${opts.ttlMin} minutos</strong> y se usa una sola vez. Si no lo pediste, ignorá este mail.</p>`
  const text = `Tu código para entrar al panel de CCM: ${opts.code}

Vence en ${opts.ttlMin} minutos y se usa una sola vez.
Si no lo pediste, podés ignorar este mail.`
  return {
    // El código en el asunto: se ve desde la notificación, sin abrir el mail.
    subject: `${opts.code} es tu código de CCM`,
    html: shell({ preview: `${opts.code} — tu código para entrar (vence en ${opts.ttlMin} min).`, inner }),
    text,
  }
}

/**
 * "Ya tenés acceso" — se manda al invitar a alguien al equipo.
 *
 * No lleva ningún token propio: sólo el link al login de siempre, donde la persona pide su
 * código como cualquier otro día. Un único mecanismo de entrada, sin una segunda clase de
 * credencial que mantener, expirar y poder filtrar.
 */
export function accessGrantedEmail(opts: {
  name: string
  role: AdminRole
  loginUrl: string
  invitedBy?: string
}): EmailMsg {
  const rol = ROLE_LABEL[opts.role]
  const quien = opts.invitedBy ? `${esc(opts.invitedBy)} te sumó` : 'Te sumaron'
  const inner = `
    ${h1('Ya tenés acceso al panel de CCM')}
    ${p(`Hola ${esc(opts.name)}. ${quien} al equipo de Córdoba Corazón de Moda. Este es tu rol y lo que te habilita.`)}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr>
      <td bgcolor="${PAPER}" style="background-color:${PAPER};border:1px solid #e6ddd1;border-radius:999px;padding:7px 15px;">
        <span style="color:${ACCENT};font-size:13px;font-weight:700;">${esc(rol)}</span>
      </td>
    </tr></table>
    ${capsList(ROLE_CAPS[opts.role])}
    ${p('Para entrar no hay contraseña: pedís un <strong style="color:' + INK + ';">código de un solo uso</strong> y te llega por mail.')}
    ${button(opts.loginUrl, 'Entrar al panel')}
    <p style="margin:18px 0 0;color:${MUTED};font-size:12px;line-height:1.6;">O abrí este link: <a href="${opts.loginUrl}" target="_blank" style="color:${ACCENT};text-decoration:none;">${esc(opts.loginUrl)}</a></p>`
  const caps = ROLE_CAPS[opts.role].map((c) => `  - ${c}`).join('\n')
  const text = `Ya tenés acceso al panel de CCM.

Hola ${opts.name}. ${opts.invitedBy ? `${opts.invitedBy} te sumó` : 'Te sumaron'} al equipo de Córdoba Corazón de Moda como ${rol}.

Qué vas a poder hacer:
${caps}

Para entrar no hay contraseña: pedís un código de un solo uso y te llega por mail.
Entrar: ${opts.loginUrl}`
  return {
    subject: 'Ya tenés acceso al panel de CCM',
    html: shell({ preview: `Tu acceso al panel de CCM está listo — ${rol}.`, inner }),
    text,
  }
}

/**
 * Aviso de que la postulación entró. Es el SEGUNDO aviso, no el primero: el postulante ya vio
 * el estado en la app apenas se guardó la decisión. Por eso el mail suma los próximos pasos en
 * vez de limitarse a anunciar.
 */
export function applicationAcceptedEmail(opts: { name: string; convocatoria: string }): EmailMsg {
  const conv = esc(opts.convocatoria)
  const inner = `
    ${h1('Quedaste seleccionado')}
    ${p(`Hola ${esc(opts.name)}. Tu postulación a <strong style="color:${INK};">${conv}</strong> fue aceptada por el equipo de CCM.`)}
    ${p('En los próximos días te escribimos con los detalles de la fecha, el lugar y lo que tenés que llevar. Si tenés alguna consulta, respondé este mail.')}`
  const text = `Quedaste seleccionado.

Hola ${opts.name}. Tu postulación a ${opts.convocatoria} fue aceptada por el equipo de CCM.

En los próximos días te escribimos con los detalles de la fecha, el lugar y lo que tenés que llevar.
Si tenés alguna consulta, respondé este mail.`
  return {
    subject: `Quedaste seleccionado — ${opts.convocatoria}`,
    html: shell({ preview: `Tu postulación a ${opts.convocatoria} fue aceptada.`, inner }),
    text,
  }
}

/**
 * Aviso de que la postulación no entró. Corto y cordial.
 *
 * La firma NO acepta el motivo a propósito: `decisionNote` es una nota interna del equipo y
 * filtrarla sería el peor bug de esta pantalla. Que no exista el parámetro es la garantía.
 */
export function applicationRejectedEmail(opts: { name: string; convocatoria: string }): EmailMsg {
  const conv = esc(opts.convocatoria)
  const inner = `
    ${h1('Sobre tu postulación')}
    ${p(`Hola ${esc(opts.name)}. Gracias por postularte a <strong style="color:${INK};">${conv}</strong>.`)}
    ${p('Esta vez no pudimos darte un lugar. Recibimos muchas más postulaciones que cupos, y la decisión fue difícil.')}
    ${p('Nos gustaría verte en las próximas convocatorias. Seguí atento, que van a salir pronto.')}`
  const text = `Sobre tu postulación.

Hola ${opts.name}. Gracias por postularte a ${opts.convocatoria}.

Esta vez no pudimos darte un lugar. Recibimos muchas más postulaciones que cupos, y la decisión fue difícil.

Nos gustaría verte en las próximas convocatorias. Seguí atento, que van a salir pronto.`
  return {
    subject: `Sobre tu postulación a ${opts.convocatoria}`,
    html: shell({ preview: 'Gracias por postularte a CCM.', inner }),
    text,
  }
}

/**
 * El mail de una entrada REGALADA. Lo que pidió el cliente, textual: "Córdoba Corazón de Moda te
 * ha regalado unas entradas... le mandamos el código QR... y que para usarlo tiene que descargar
 * la aplicación tocando un link".
 *
 * El QR va INCRUSTADO (adjunto inline con cid), no como <img src="http…">, para que se vea sin
 * que el cliente de correo pida "mostrar imágenes". El `cid` que referencia el HTML lo pone quien
 * llama, junto con el buffer PNG del QR (ver grantMailService).
 */
export function ticketGrantEmail(opts: {
  name?: string
  eventTitle: string
  eventWhen: string
  eventVenue: string
  qty: number
  claimUrl: string
  qrCid: string
}): EmailMsg {
  const saludo = opts.name ? `Hola ${esc(opts.name)}. ` : ''
  const entradas = opts.qty === 1 ? 'una entrada' : `${opts.qty} entradas`
  const evento = esc(opts.eventTitle)
  const cuando = esc(opts.eventWhen)
  const donde = esc(opts.eventVenue)

  const inner = `
    ${h1('Te regalaron una entrada 🎟️')}
    ${p(`${saludo}<strong style="color:${INK};">Córdoba Corazón de Moda</strong> te regaló ${entradas} para que puedas participar de:`)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;background-color:${PAPER};border-radius:12px;">
      <tr><td style="padding:18px 20px;">
        <div style="color:${INK};font-size:17px;font-weight:700;line-height:1.3;margin:0 0 6px;">${evento}</div>
        <div style="color:${MUTED};font-size:14px;line-height:1.6;">${cuando}<br>${donde}</div>
      </td></tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
      <tr><td align="center" style="padding:6px 0 14px;">
        <img src="cid:${esc(opts.qrCid)}" width="220" height="220" alt="Tu código QR de acceso" style="display:block;width:220px;height:220px;border-radius:10px;border:1px solid #e6ddd1;">
        <div style="color:${MUTED};font-size:12px;line-height:1.5;margin-top:10px;">Este es tu código de acceso.</div>
      </td></tr>
    </table>
    ${p('Para usarlo, abrí tu entrada en la app de CCM desde este botón:')}
    ${button(opts.claimUrl, 'Abrir mi entrada en la app')}
    ${p(`<span style="font-size:13px;color:${MUTED};">Si el botón no funciona, copiá y pegá este link:<br><span style="color:${INK};word-break:break-all;">${esc(opts.claimUrl)}</span></span>`)}`

  const text = `${opts.name ? `Hola ${opts.name}. ` : ''}Córdoba Corazón de Moda te regaló ${entradas} para participar de:

${opts.eventTitle}
${opts.eventWhen}
${opts.eventVenue}

Para usar tu entrada, abrila en la app de CCM desde este link:
${opts.claimUrl}

(El código QR de acceso va adjunto en la versión con imágenes de este mail.)`

  return {
    subject: `Te regalaron una entrada para ${opts.eventTitle}`,
    html: shell({
      preview: `Córdoba Corazón de Moda te regaló ${entradas}.`,
      inner,
      footer: 'Te llega este mail porque el equipo de CCM te regaló una entrada para su evento.<br>Si creés que fue un error, podés ignorarlo.',
    }),
    text,
  }
}
