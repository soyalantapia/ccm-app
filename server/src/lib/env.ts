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

  // Auth — tres secretos separados (opcionales hasta las fases A/G/H).
  DEVICE_TOKEN_SECRET: z.string().optional(),
  ADMIN_TOKEN_SECRET: z.string().optional(),
  ACCREDITATION_TOKEN_SECRET: z.string().optional(),
  OTP_PEPPER: z.string().optional(),
  // Fase G (auth temporal del organizador): shared secret Bearer hasta que entre el
  // login OTP por email (RESEND). El front lo manda en Authorization: Bearer <token>.
  ADMIN_TOKEN: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional(),

  // Mercado Pago (fases C/D/F)
  MP_ACCESS_TOKEN: z.string().optional(),
  MP_WEBHOOK_SECRET: z.string().optional(),

  // Object storage (fase E)
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_REGION: z.string().default('auto'),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_PUBLIC_URL: z.string().optional(),
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
  if (missing.length > 0) {
    console.error('❌ [assertProd] Faltan variables obligatorias en producción:\n  - ' + missing.join('\n  - '))
    process.exit(1)
  }
}
