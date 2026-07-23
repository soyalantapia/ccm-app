import { prisma } from '../lib/prisma.js'
import { notFound } from '../lib/errors.js'
import { getMailer } from '../mail/mailer.js'
import { ticketGrantEmail } from '../mail/templates.js'
import { qrPng } from '../lib/qrPng.js'
import { linkDeGrant } from './grantService.js'

/**
 * Arma y manda el mail de una entrada regalada: genera el QR, lo incrusta y lo envía.
 *
 * Es la misma operación para el envío inicial (al crear el grant) y para el REENVÍO desde el
 * panel — por eso vive acá, tomando sólo el grantId. El resultado dice honestamente si el mail
 * salió: el organizador tiene que enterarse de un "no se pudo", no descubrirlo el día del evento.
 *
 * best-effort: no revienta si el mail falla ni si la persona no tiene email — devuelve el motivo.
 */

export type EnvioGrant =
  | { enviado: true; to: string }
  | { enviado: false; motivo: 'sin_email' | 'fallo_envio'; detalle?: string }

/** El nombre visible de una persona (de los campos de perfil de su primer dispositivo). */
function nombreDePersona(devices: { fields: { key: string; value: string }[] }[]): string | null {
  const fields = devices.flatMap((d) => d.fields)
  const val = (k: string) => fields.find((f) => f.key === k)?.value?.trim()
  const nom = [val('firstName'), val('lastName')].filter(Boolean).join(' ').trim()
  return nom || null
}

export async function enviarMailDeGrant(grantId: string): Promise<EnvioGrant> {
  const grant = await prisma.ticketGrant.findUnique({
    where: { id: grantId },
    include: {
      event: { select: { title: true, dateLabel: true, timeLabel: true, venue: true, address: true } },
      person: {
        select: { email: true, devices: { select: { fields: { select: { key: true, value: true } } } } },
      },
    },
  })
  if (!grant) throw notFound('GRANT_NOT_FOUND', 'Esa entrada regalada no existe.')

  const to = grant.person.email
  if (!to) {
    // La persona no tiene email en el CRM: no hay a dónde mandar. El link igual existe (se puede
    // copiar desde la ficha y pasar por WhatsApp), así que no es un error fatal — pero el
    // organizador tiene que saberlo.
    return { enviado: false, motivo: 'sin_email' }
  }

  const claimUrl = linkDeGrant(grant.id, grant.tokenVersion)
  const cuando = [grant.event.dateLabel, grant.event.timeLabel].filter(Boolean).join(' · ')
  const donde = [grant.event.venue, grant.event.address].filter(Boolean).join(' · ')
  const qrCid = `qr-${grant.id}@ccm`

  const msg = ticketGrantEmail({
    name: nombreDePersona(grant.person.devices) ?? undefined,
    eventTitle: grant.event.title,
    eventWhen: cuando,
    eventVenue: donde,
    qty: grant.qty,
    claimUrl,
    qrCid,
  })
  msg.attachments = [
    { filename: 'entrada-ccm.png', content: await qrPng(claimUrl), contentType: 'image/png', cid: qrCid },
  ]

  try {
    const res = await getMailer().send(to, msg)
    // delivered es false cuando el mailer cayó a consola (dev, o prod sin proveedor): no mentir
    // diciendo que salió. Con SMTP/Resend reales viene true.
    if (!res.delivered) return { enviado: false, motivo: 'fallo_envio', detalle: 'el mailer no confirmó la entrega' }
    return { enviado: true, to }
  } catch (err) {
    return { enviado: false, motivo: 'fallo_envio', detalle: err instanceof Error ? err.message : String(err) }
  }
}
