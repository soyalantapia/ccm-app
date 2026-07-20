import { describe, it, expect, beforeEach } from 'vitest'
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
})
