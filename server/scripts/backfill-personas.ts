import { prisma } from '../src/lib/prisma.js'
import { normalizeEmail, normalizeDni, keysFromApplicationData } from '../src/domain/personIdentity.js'
import { linkPerson } from '../src/services/personService.js'

/**
 * Crea las Personas de los datos que ya existían antes de la tabla.
 * Idempotente: solo mira lo que todavía no tiene personId, así que volver a correrlo no duplica.
 *
 * Manejo por registro: `linkPerson` puede tirar excepción en casos límite (una carrera que,
 * tras reintentar, no encuentra a la ganadora). Si un dispositivo o postulación puntual falla,
 * se registra y se sigue con el resto del lote — un solo registro problemático no debe abortar
 * todo el backfill y perder el progreso ya hecho sobre los demás.
 */
export async function backfillPersonas(): Promise<{ creadas: number; enlazados: number; fallidos: number }> {
  const antes = await prisma.person.count()
  let enlazados = 0
  let fallidos = 0

  const devices = await prisma.device.findMany({
    where: { personId: null },
    include: { fields: { where: { key: { in: ['email', 'dni'] } } } },
  })
  for (const d of devices) {
    try {
      const email = normalizeEmail(d.fields.find((f) => f.key === 'email')?.value)
      const dni = normalizeDni(d.fields.find((f) => f.key === 'dni')?.value)
      const personId = await linkPerson({ email, dni })
      if (personId) {
        await prisma.device.update({ where: { id: d.id }, data: { personId } })
        enlazados++
      }
    } catch (err) {
      fallidos++
      console.error('[backfill] no se pudo enganchar el dispositivo', d.id, err)
    }
  }

  const apps = await prisma.application.findMany({ where: { personId: null } })
  for (const a of apps) {
    try {
      const personId = await linkPerson(keysFromApplicationData(a.data))
      if (personId) {
        await prisma.application.update({ where: { id: a.id }, data: { personId } })
        enlazados++
      }
    } catch (err) {
      fallidos++
      console.error('[backfill] no se pudo enganchar la postulación', a.id, err)
    }
  }

  return { creadas: (await prisma.person.count()) - antes, enlazados, fallidos }
}

// Permite correrlo a mano: `npx tsx scripts/backfill-personas.ts`
if (process.argv[1]?.endsWith('backfill-personas.ts')) {
  backfillPersonas()
    .then((r) =>
      console.log(
        `✓ personas creadas: ${r.creadas} · registros enlazados: ${r.enlazados} · fallidos: ${r.fallidos}`,
      ),
    )
    .finally(() => prisma.$disconnect())
}
