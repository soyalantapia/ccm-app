import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '../lib/prisma.js'
import { linkPerson } from './personService.js'

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
