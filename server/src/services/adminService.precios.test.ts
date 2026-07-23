import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Ninguna capa de la cadena admin acotaba los precios: ni el input, ni el submit
 * (`Number(raw)` crudo), ni la ruta (el helper `create` solo valida que venga un id). Las tres
 * columnas price del schema son Int?, así que un decimal, un negativo, un NaN o un número fuera
 * del rango de int4 llegaban tal cual a Prisma y salían como 500 en vez de un 400 de validación
 * — o peor, se persistía un precio absurdo que después se le muestra al público en la ficha.
 *
 * Va en un archivo aparte de adminService.test.ts porque necesita su propio mock de prisma
 * (ese cubre el contrato de no-destrucción al guardar, con otra forma de $transaction).
 */

const mockPrisma = {
  ticketPlan: { update: vi.fn(), findUnique: vi.fn() },
}

vi.mock('../lib/prisma.js', () => ({ prisma: mockPrisma }))

const { updatePlan } = await import('./adminService.js')

beforeEach(() => {
  vi.clearAllMocks()
  // updatePlan lee la fila actual para chequear que el tipo y el precio no se contradigan.
  mockPrisma.ticketPlan.findUnique.mockResolvedValue({ kind: 'vip', price: null })
})

describe('updatePlan — el precio se valida antes de llegar a una columna Int', () => {
  it('acepta un precio normal y lo redondea a entero', async () => {
    await updatePlan('general' as never, { price: 15000.4 })
    expect(mockPrisma.ticketPlan.update.mock.calls[0][0].data.price).toBe(15000)
  })

  it('acepta null (precio pendiente)', async () => {
    await updatePlan('general' as never, { price: null })
    expect(mockPrisma.ticketPlan.update.mock.calls[0][0].data.price).toBeNull()
  })

  it('RECHAZA negativos, NaN, Infinity y valores fuera del rango de int4', async () => {
    for (const malo of [-1, NaN, Infinity, -Infinity, 3_000_000_000, 'abc']) {
      await expect(
        updatePlan('general' as never, { price: malo as never }),
        `${String(malo)} debería rechazarse`,
      ).rejects.toThrow()
    }
    expect(mockPrisma.ticketPlan.update, 'un precio inválido no puede llegar a Prisma').not.toHaveBeenCalled()
  })
})
