/**
 * Diagnóstico de SMTP: prueba autenticar contra el servidor en los dos modos usuales
 * (465 con TLS implícito, 587 con STARTTLS) y reporta qué responde cada uno.
 *
 * No manda ningún mail — sólo abre la conexión y autentica. Sirve para separar
 * "las credenciales están mal" de "el mail no llega".
 *
 *   npx tsx scripts/probar-smtp.ts
 */
import nodemailer from 'nodemailer'
import { env } from '../src/lib/env.js'

async function main() {
  if (!env.SMTP_HOST) {
    console.log('No hay SMTP_HOST configurado.')
    return
  }
  console.log(`\nservidor: ${env.SMTP_HOST}`)
  console.log(`usuario:  ${env.SMTP_USER ?? '(sin usuario)'}\n`)

  for (const [port, secure] of [
    [465, true],
    [587, false],
  ] as const) {
    const tx = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      secure,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 8000,
    })
    try {
      await tx.verify()
      console.log(`  puerto ${port} (${secure ? 'TLS' : 'STARTTLS'}): AUTENTICA ✓`)
    } catch (err) {
      const e = err as { responseCode?: number; code?: string; message?: string }
      console.log(
        `  puerto ${port} (${secure ? 'TLS' : 'STARTTLS'}): falla — ${e.responseCode ?? e.code ?? ''} ${String(e.message).slice(0, 80)}`,
      )
    } finally {
      tx.close()
    }
  }
}

void main()
