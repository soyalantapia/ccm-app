import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '../lib/prisma.js'
import { linkPerson } from './personService.js'

/** `prisma.person` es un Proxy (no un objeto plano): el descriptor que `vi.spyOn` logra leer
 *  para "guardar y restaurar más tarde" con `spy.mockRestore()` viene incompleto (sin getter ni
 *  value utilizables), así que restaurar así deja `findMany` en `undefined` para el resto de la
 *  suite. Restauramos a mano con un data property real apuntando a la función original. */
function restaurarFindMany(original: typeof prisma.person.findMany) {
  Object.defineProperty(prisma.person, 'findMany', {
    value: original,
    writable: true,
    configurable: true,
    enumerable: true,
  })
}

describe('linkPerson', () => {
  beforeEach(async () => {
    await prisma.person.deleteMany()
  })

  it('sin claves no crea nada', async () => {
    expect(await linkPerson({ email: null, dni: null })).toBeNull()
    expect(await prisma.person.count()).toBe(0)
  })

  it('crea una persona con el email', async () => {
    const id = await linkPerson({ email: 'ana@x.com', dni: null })
    expect(id).toBeTruthy()
    expect(await prisma.person.count()).toBe(1)
  })

  it('el mismo email dos veces devuelve la MISMA persona', async () => {
    const a = await linkPerson({ email: 'ana@x.com', dni: null })
    const b = await linkPerson({ email: 'ana@x.com', dni: null })
    expect(b).toBe(a)
    expect(await prisma.person.count()).toBe(1)
  })

  it('completa el dni faltante en una persona ya existente', async () => {
    const a = await linkPerson({ email: 'ana@x.com', dni: null })
    await linkPerson({ email: 'ana@x.com', dni: '38456120' })
    const p = await prisma.person.findUniqueOrThrow({ where: { id: a! } })
    expect(p.dni).toBe('38456120')
  })

  it('unifica por dni cuando el email todavía no estaba', async () => {
    const a = await linkPerson({ email: null, dni: '38456120' })
    const b = await linkPerson({ email: 'ana@x.com', dni: '38456120' })
    expect(b).toBe(a)
    expect(await prisma.person.count()).toBe(1)
  })

  it('claves en conflicto: NO fusiona, se queda con la más antigua', async () => {
    const vieja = await linkPerson({ email: 'ana@x.com', dni: null })
    const otra = await linkPerson({ email: null, dni: '38456120' })
    expect(otra).not.toBe(vieja)
    // email de la primera + dni de la segunda: pertenecen a personas distintas
    const r = await linkPerson({ email: 'ana@x.com', dni: '38456120' })
    expect(r).toBe(vieja)                       // gana la más antigua
    expect(await prisma.person.count()).toBe(2) // y la otra sigue existiendo
  })

  it('completar una clave faltante en una persona existente deja rastro con console.warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const a = await linkPerson({ email: 'ana@x.com', dni: null })
      warnSpy.mockClear() // no nos interesa ruido de la creación, solo el completado
      await linkPerson({ email: 'ana@x.com', dni: '38456120' })
      expect(warnSpy).toHaveBeenCalledTimes(1)
      const mensaje = warnSpy.mock.calls[0]?.[0] as string
      expect(mensaje).toContain(a!)
      expect(mensaje).toContain('38456120')
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('el desempate es determinístico cuando dos personas comparten el mismo createdAt', async () => {
    const mismoInstante = new Date('2026-01-01T00:00:00.000Z')
    // Se insertan a propósito con el id "más alto" primero para que un desempate real por id
    // (y no por orden de inserción o de scan) sea lo único que puede hacer pasar el test.
    await prisma.person.create({
      data: { id: 'person-zzz', email: 'ana@x.com', dni: null, createdAt: mismoInstante },
    })
    await prisma.person.create({
      data: { id: 'person-aaa', email: null, dni: '38456120', createdAt: mismoInstante },
    })
    const r = await linkPerson({ email: 'ana@x.com', dni: '38456120' })
    expect(r).toBe('person-aaa')
  })

  it('conflicto detectado recién al reintentar tras la carrera del create: NO lo resuelve callado', async () => {
    // Escenario: dos personas YA existen (una dueña del email, otra del dni) antes de que
    // arranque el linkPerson bajo prueba. Forzamos que la lectura inicial "no vea" a ninguna
    // (como en una carrera real, donde el findMany corrió antes de que cualquiera de las dos
    // commiteara), así el código entra al camino de create(), que va a fallar con P2002 porque
    // el email ya tiene dueño, y el reintento posterior a ESE catch es el que tiene que notar
    // que hay DOS dueñas distintas (no una sola) en vez de quedarse calladamente con la primera.
    const vieja = await linkPerson({ email: 'ana@x.com', dni: null })
    const otra = await linkPerson({ email: null, dni: '38456120' })

    const findManyReal = prisma.person.findMany.bind(prisma.person)
    let llamadas = 0
    vi.spyOn(prisma.person, 'findMany').mockImplementation((...args) => {
      llamadas++
      // Única llamada que mentimos: la lectura inicial de linkPerson (antes de intentar el
      // create). De ahí en más —incluido el reintento dentro del catch— es el findMany real.
      if (llamadas === 1) return Promise.resolve([])
      return findManyReal(...(args as Parameters<typeof findManyReal>))
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const r = await linkPerson({ email: 'ana@x.com', dni: '38456120' })
      // Gana la más antigua, igual que en el camino normal con conflicto...
      expect(r).toBe(vieja)
      expect(await prisma.person.count()).toBe(2) // y no se fusiona ni se crea una tercera
      // ...pero además tiene que quedar RASTRO: este es el mismo tipo de conflicto que en el
      // camino normal dispara un console.warn, así que acá también tiene que dispararlo.
      expect(warnSpy).toHaveBeenCalled()
      const mensaje = warnSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(mensaje).toContain(vieja!)
      expect(mensaje).toContain(otra!)
    } finally {
      restaurarFindMany(findManyReal)
      warnSpy.mockRestore()
    }
  })

  it('conflicto real al completar una clave (P2002) cae en el catch del camino de actualizar', async () => {
    // A ya existe con el email pero SIN dni.
    const idA = await linkPerson({ email: 'ana@x.com', dni: null })
    const personaA = await prisma.person.findUniqueOrThrow({ where: { id: idA! } })
    // B ya tiene el dni que le vamos a intentar completar a A: simula que, entre la lectura
    // inicial de linkPerson y su update, otro proceso se quedó primero con ese dni.
    await prisma.person.create({ data: { email: null, dni: '38456120' } })

    const findManyReal = prisma.person.findMany.bind(prisma.person)
    let llamadas = 0
    vi.spyOn(prisma.person, 'findMany').mockImplementation((...args) => {
      llamadas++
      // Sólo mentimos en la lectura inicial de linkPerson: forzamos que "no vea" a B todavía
      // (como pasaría si B se creó justo después de que corrió ese SELECT), para que el código
      // entre al camino de "completar el dni faltante en A" y su update choque de verdad contra
      // el índice único de dni que B ya tiene. El reintento (dentro del catch) usa el findMany
      // real, que en ese momento sí va a encontrar a B.
      if (llamadas === 1) return Promise.resolve([personaA])
      return findManyReal(...(args as Parameters<typeof findManyReal>))
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const r = await linkPerson({ email: 'ana@x.com', dni: '38456120' })
      expect(r).toBe(idA) // A es más vieja que B → gana ella (no se fusiona)
      const actualizada = await prisma.person.findUniqueOrThrow({ where: { id: idA! } })
      expect(actualizada.dni).toBeNull() // el update de A falló de verdad: no se quedó con el dni de B
      expect(await prisma.person.count()).toBe(2) // A y B siguen siendo personas distintas
      // El update falló: el log de "se completó" no puede haberse emitido, porque mentiría
      // (A nunca se quedó con ese dni).
      const mensajes = warnSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(mensajes).not.toMatch(/se completó/)
    } finally {
      restaurarFindMany(findManyReal)
      warnSpy.mockRestore()
    }
  })

  it('carrera: dos linkPerson concurrentes con el mismo email nuevo no rechazan y devuelven la misma persona', async () => {
    // Una carrera real (dos requests HTTP concurrentes) depende del timing exacto de la red y
    // el pool de conexiones: en la práctica es flaky de reproducir con un simple Promise.all
    // (a veces ambos findMany corren antes de que cualquier create commitee, a veces no). Para
    // que el test sea determinístico forzamos la ventana de la carrera: las primeras DOS
    // lecturas (una por cada linkPerson en vuelo) ven "no hay nadie todavía", como pasaría de
    // verdad si llegan al mismo tiempo. De ahí en más (incluido el reintento del código bajo
    // prueba) se usa el findMany real contra la base.
    const findManyReal = prisma.person.findMany.bind(prisma.person)
    let llamadas = 0
    const spy = vi.spyOn(prisma.person, 'findMany').mockImplementation((...args) => {
      llamadas++
      if (llamadas <= 2) return Promise.resolve([])
      return findManyReal(...(args as Parameters<typeof findManyReal>))
    })
    try {
      const [a, b] = await Promise.all([
        linkPerson({ email: 'carrera@x.com', dni: null }),
        linkPerson({ email: 'carrera@x.com', dni: null }),
      ])
      expect(a).toBeTruthy()
      expect(a).toBe(b)
      expect(await prisma.person.count()).toBe(1)
    } finally {
      spy.mockRestore()
    }
  })
})
