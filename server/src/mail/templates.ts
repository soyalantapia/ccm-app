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

export interface EmailMsg {
  subject: string
  html: string
  text: string
}

/** Escapa lo que venga de la base antes de meterlo en el HTML del mail. */
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const INK = '#33261d' // bordó oscuro de la marca
const ACCENT = '#a8442a' // terracota
const PAPER = '#f5f0e8' // crema del fondo
const MUTED = '#7a6a5d'

/** Envoltorio común: fondo, tarjeta central, pie. `preview` es la línea que se ve en la bandeja. */
function shell({ preview, inner }: { preview: string; inner: string }): string {
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
      Te llega este mail porque alguien del equipo de CCM pidió acceso para esta dirección.<br>Si no fuiste vos, podés ignorarlo.
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
