import 'dotenv/config'
import { z } from 'zod'

/**
 * Contrato de entorno validado con zod (canon 10: tres secretos JWT separados).
 * En Fase 0 solo DATABASE_URL es obligatoria para arrancar /health; los secretos
 * y credenciales de MP/storage son opcionales acá y los van exigiendo las fases
 * que los usan (A→H). En producción se valida que estén (ver `assertProd`).
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default('*'),

  // Rate limiting (por IP/min). Tuneables sin redeploy. OJO: en el venue cientos de
  // asistentes comparten una sola IP pública (NAT de la WiFi), por eso NO limitamos GETs
  // y los límites de escritura son holgados; subirlos/bajarlos el día del evento por env.
  RATE_LIMIT_WRITES: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_ANALYTICS: z.coerce.number().int().positive().default(600),

  // Si está seteada, el server sirve la SPA (front buildeado) desde esta carpeta + fallback
  // a index.html para rutas no-API → un solo servicio Railway sirve front + /api/v1.
  FRONT_DIST: z.string().optional(),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),

  // Auth — tres secretos separados (canon 10). Hoy SOLO se consume DEVICE_TOKEN_SECRET
  // (lib/deviceToken.ts). Los tres de abajo están RESERVADOS para fases futuras y todavía
  // ningún módulo los lee: ADMIN_TOKEN_SECRET + OTP_PEPPER = login OTP del organizador (Fase G,
  // reemplaza al shared secret ADMIN_TOKEN); ACCREDITATION_TOKEN_SECRET = JWT del QR de puerta (Fase H).
  DEVICE_TOKEN_SECRET: z.string().optional(),
  // Login del organizador (OTP por email). Opcionales para no romper el arranque en dev, pero
  // exigidos por assertProd en producción y con largo mínimo: un secreto corto no protege nada.
  // Los módulos que los consumen tiran error si faltan, sin caer a ningún valor por defecto.
  ADMIN_TOKEN_SECRET: z.string().min(32, 'ADMIN_TOKEN_SECRET debe tener al menos 32 caracteres').optional(),
  OTP_PEPPER: z.string().min(32, 'OTP_PEPPER debe tener al menos 32 caracteres').optional(),
  ACCREDITATION_TOKEN_SECRET: z.string().optional(), // ⏳ sin usar aún (Fase H: acreditación QR)
  // Firma el token del link de una entrada regalada (lib/grantToken.ts). El token se DERIVA de
  // este secreto y nunca se guarda: sin él no se puede fabricar ni verificar un link de cortesía.
  GRANT_TOKEN_SECRET: z.string().min(32, 'GRANT_TOKEN_SECRET debe tener al menos 32 caracteres').optional(),

  // Email. Resolución: SMTP si hay host → Resend si hay clave → consola. Sin nada configurado
  // el circuito de login sigue andando y el código sale por el log (ver mail/mailer.ts).
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(), // ej: 'CCM <no-reply@dominio-verificado.com>'
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  // Base pública del sitio, para armar el link del email de invitación. Sin esto el mail
  // llegaría con un link a ninguna parte.
  PUBLIC_BASE_URL: z.string().optional(),
  // Email del primer OWNER: se crea al arrancar si todavía no hay ninguno (bootstrap).
  ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional(),

  // Mercado Pago. La app se crea en el panel de developers; sin estas tres, /admin/mp/connect
  // responde 503 y la venta sigue con el link manual.
  MP_CLIENT_ID: z.string().optional(),
  MP_CLIENT_SECRET: z.string().optional(),
  MP_REDIRECT_URI: z.string().optional(),
  MP_ACCESS_TOKEN: z.string().optional(), // ⏳ solo para el plan B (token pegado, sin OAuth)
  MP_WEBHOOK_SECRET: z.string().optional(),

  // Object storage (fase E — S3-compatible, Cloudflare R2, etc.)
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_REGION: z.string().default('auto'),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_PUBLIC_URL: z.string().optional(),

  // Uploads locales (Volume Railway). Si está seteado, POST /admin/upload guarda aquí.
  // UPLOAD_DIR:        path absoluto al volumen montado (ej. /app/uploads).
  // UPLOAD_URL_PREFIX: prefijo con que el server expone los archivos (ej. /uploads).
  //                    En Railway, el servicio ya tiene RAILWAY_PUBLIC_DOMAIN → la URL
  //                    final queda https://<domain><UPLOAD_URL_PREFIX>/<filename>.
  UPLOAD_DIR: z.string().optional(),
  UPLOAD_URL_PREFIX: z.string().default('/uploads'),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
export const corsOrigins =
  env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',').map((s) => s.trim())

/**
 * Guardia de producción: aborta el arranque si falta config crítica en prod, en vez de
 * bootear "sano" con CORS abierto o el panel admin caído (503 silencioso). Cada fase suma
 * sus secretos requeridos acá (Fase C: MP_ACCESS_TOKEN + MP_WEBHOOK_SECRET, etc.).
 * Se llama en index.ts antes de listen().
 */
export function assertProd(): void {
  if (env.NODE_ENV !== 'production') return
  const missing: string[] = []
  if (env.CORS_ORIGINS === '*') missing.push('CORS_ORIGINS — no puede ser "*" en producción (CORS abierto a cualquier origen)')
  // ADMIN_TOKEN ya no existe: el panel se entra con sesiones personales (login por código).
  // Lo que hace falta ahora es poder FIRMAR esas sesiones y HASHEAR los códigos.
  if (!env.DEVICE_TOKEN_SECRET) missing.push('DEVICE_TOKEN_SECRET — sin él, no se pueden emitir ni verificar tokens de device (identidad rota)')
  // Login del organizador: sin estos dos, o no se pueden firmar sesiones o los códigos OTP
  // quedarían hasheados con un pepper débil. Nada de fallback silencioso a un valor de juguete.
  if (!env.ADMIN_TOKEN_SECRET) missing.push('ADMIN_TOKEN_SECRET — sin él no se pueden firmar las sesiones del panel (nadie entra)')
  if (!env.OTP_PEPPER) missing.push('OTP_PEPPER — sin él los códigos OTP no se pueden hashear de forma segura')
  // Entradas regaladas: el link de cortesía se firma con este secreto (lib/grantToken.ts). Sin
  // él, otorgar una entrada tira 500 al intentar derivar el token, y un link ya emitido no se
  // puede verificar. Se exige en prod para que el fallo salga en el arranque, no en el primer
  // regalo. En dev es opcional: sin la feature de regalos configurada, no molesta.
  if (!env.GRANT_TOKEN_SECRET) missing.push('GRANT_TOKEN_SECRET — sin él no se pueden firmar ni verificar los links de entradas regaladas')
  // Correo: el código por mail es el ÚNICO login del panel (no hay contraseña de respaldo),
  // así que un deploy sin correo deja al organizador afuera de su propio sistema. Y con un
  // proveedor configurado pero sin MAIL_FROM es PEOR que no tener nada: el default apunta a
  // corazondemoda.com, un dominio que todavía no existe, y el servidor rechaza cada envío con
  // "450 Sender address rejected: Domain not found" (verificado contra Hostinger el 22/07/2026).
  // Autentica bien, parece configurado, y no sale un solo mail.
  const correoConfigurado = !!(env.SMTP_HOST || env.RESEND_API_KEY)
  if (!correoConfigurado) {
    missing.push('SMTP_HOST o RESEND_API_KEY — sin proveedor de correo el mailer cae a consola y NADIE puede entrar al panel (el código por mail es el único login)')
  } else if (!env.MAIL_FROM) {
    missing.push('MAIL_FROM — con proveedor configurado y sin remitente propio se usa un dominio inexistente y el servidor rechaza el 100% de los envíos')
  }
  // Cobros: se exigen SÓLO si Mercado Pago está configurado — un deploy que no cobra nada tiene
  // que poder arrancar sin ninguna de estas. Lo que no puede existir es MP a medias, que es el
  // estado más peligroso: el panel dice "conectado", el comprador paga de verdad y no se activa
  // nada. Sin MP_WEBHOOK_SECRET la firma NUNCA valida y se descarta el 100% de los avisos; sin
  // PUBLIC_BASE_URL el notification_url apunta a localhost y MP no tiene a dónde avisar. Los dos
  // fallan en silencio y sólo se descubren cuando alguien reclama la entrada que pagó.
  const mpConfigurado = !!(env.MP_CLIENT_ID || env.MP_CLIENT_SECRET || env.MP_ACCESS_TOKEN)
  if (mpConfigurado) {
    if (!env.MP_WEBHOOK_SECRET) missing.push('MP_WEBHOOK_SECRET — con MP configurado y sin este secreto, la firma de los avisos nunca valida: se cobra y no se entrega nada')
    if (!env.PUBLIC_BASE_URL) missing.push('PUBLIC_BASE_URL — con MP configurado, sin esto el aviso de pago apunta a localhost y nunca llega')
  }

  if (missing.length > 0) {
    console.error('❌ [assertProd] Faltan variables obligatorias en producción:\n  - ' + missing.join('\n  - '))
    process.exit(1)
  }
}
