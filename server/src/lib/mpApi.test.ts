import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApiError } from './errors.js'
import { exchangeCodeForTokens, getPayment } from './mpApi.js'

/**
 * Mock de fetch que NUNCA resuelve por su cuenta — simula MP colgado. Solo rechaza si alguien
 * abortea el AbortSignal que le pasamos (como haría un fetch real frente a un AbortController),
 * que es justo lo que fetchConTimeout dispara a los 10s. Con fake timers no esperamos ese lapso
 * de verdad: lo adelantamos con vi.advanceTimersByTimeAsync.
 */
function fetchQueSeCuelga() {
  return vi.fn((_url: string, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const err = new Error('The operation was aborted')
        err.name = 'AbortError'
        reject(err)
      })
    })
  })
}

/**
 * Mock de fetch que SÍ resuelve enseguida con los headers (res.ok = true), pero cuya lectura
 * del cuerpo (`json()`/`text()`) nunca resuelve por su cuenta — simula a MP mandando los
 * headers y colgándose mientras transmite el body. Igual que `fetchQueSeCuelga`, la lectura del
 * cuerpo solo rechaza si se abortea el signal que fetch recibió.
 */
function fetchQueEntregaHeadersPeroSeCuelgaEnElCuerpo() {
  return vi.fn((_url: string, init?: RequestInit) => {
    const cuerpoQueNuncaLlega = () =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted')
          err.name = 'AbortError'
          reject(err)
        })
      })
    const res = {
      ok: true,
      status: 200,
      json: cuerpoQueNuncaLlega,
      text: cuerpoQueNuncaLlega,
    } as unknown as Response
    return Promise.resolve(res)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('mpApi — timeout a Mercado Pago', () => {
  it('post() (ej. exchangeCodeForTokens) no se cuelga: a los 10s falla con MP_API_ERROR', async () => {
    vi.stubGlobal('fetch', fetchQueSeCuelga())

    const promesa = exchangeCodeForTokens('CODE-1')
    const expectativa = expect(promesa).rejects.toMatchObject({
      code: 'MP_API_ERROR',
      message: expect.stringContaining('no respondió a tiempo'),
    })

    await vi.advanceTimersByTimeAsync(10_000)
    await expectativa
  })

  it('getPayment() (fetch directo, no pasa por post()) también timeoutea sin colgarse', async () => {
    vi.stubGlobal('fetch', fetchQueSeCuelga())

    const promesa = getPayment('TOKEN', 'PAY-1')
    const expectativa = expect(promesa).rejects.toBeInstanceOf(ApiError)

    await vi.advanceTimersByTimeAsync(10_000)
    await expectativa
  })

  // Caso que reprodujo el revisor: el timeout original solo cubría el fetch() inicial
  // (limpiaba el timer en cuanto llegaban los headers), así que si MP entregaba los headers
  // pero se colgaba transmitiendo el cuerpo, la promesa quedaba viva para siempre.
  it('post() (ej. exchangeCodeForTokens) no se cuelga si los headers llegan a tiempo pero el cuerpo nunca llega', async () => {
    vi.stubGlobal('fetch', fetchQueEntregaHeadersPeroSeCuelgaEnElCuerpo())

    const promesa = exchangeCodeForTokens('CODE-1')
    const expectativa = expect(promesa).rejects.toMatchObject({
      code: 'MP_API_ERROR',
      message: expect.stringContaining('no respondió a tiempo'),
    })

    await vi.advanceTimersByTimeAsync(10_000)
    await expectativa
  })

  it('getPayment() tampoco se cuelga si los headers llegan a tiempo pero el cuerpo nunca llega', async () => {
    vi.stubGlobal('fetch', fetchQueEntregaHeadersPeroSeCuelgaEnElCuerpo())

    const promesa = getPayment('TOKEN', 'PAY-1')
    const expectativa = expect(promesa).rejects.toMatchObject({
      code: 'MP_API_ERROR',
      message: expect.stringContaining('no respondió a tiempo'),
    })

    await vi.advanceTimersByTimeAsync(10_000)
    await expectativa
  })
})
