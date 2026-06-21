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

  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),

  // Auth — tres secretos separados (opcionales hasta las fases A/G/H).
  DEVICE_TOKEN_SECRET: z.string().optional(),
  ADMIN_TOKEN_SECRET: z.string().optional(),
  ACCREDITATION_TOKEN_SECRET: z.string().optional(),
  OTP_PEPPER: z.string().optional(),

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
