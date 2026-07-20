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
  // Fase G (auth temporal del organizador): shared secret Bearer hasta que entre el
  // login OTP por email (RESEND). El front lo manda en Authorization: Bearer <token>.
  ADMIN_TOKEN: z.string().optional(),

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

  // Mercado Pago (fases C/D/F)
  MP_ACCESS_TOKEN: z.string().optional(),
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
  if (!env.ADMIN_TOKEN) missing.push('ADMIN_TOKEN — sin él, todo /admin/* responde 503 (panel del organizador caído)')
  if (!env.DEVICE_TOKEN_SECRET) missing.push('DEVICE_TOKEN_SECRET — sin él, no se pueden emitir ni verificar tokens de device (identidad rota)')
  // Login del organizador: sin estos dos, o no se pueden firmar sesiones o los códigos OTP
  // quedarían hasheados con un pepper débil. Nada de fallback silencioso a un valor de juguete.
  if (!env.ADMIN_TOKEN_SECRET) missing.push('ADMIN_TOKEN_SECRET — sin él no se pueden firmar las sesiones del panel (nadie entra)')
  if (!env.OTP_PEPPER) missing.push('OTP_PEPPER — sin él los códigos OTP no se pueden hashear de forma segura')
  if (missing.length > 0) {
    console.error('❌ [assertProd] Faltan variables obligatorias en producción:\n  - ' + missing.join('\n  - '))
    process.exit(1)
  }
}
