import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { OpsMpConnection } from './OpsMpConnection'

const estado = vi.fn()
vi.mock('../../data/store', () => ({
  store: {
    getMpStatus: () => estado(),
    connectMp: vi.fn(),
    disconnectMp: vi.fn(),
  },
  useStore: (sel: (s: unknown) => unknown) => sel({ getMpStatus: () => estado() }),
  IS_REMOTE: true,
}))

// cleanup(): sin esto el DOM de cada render se acumula entre tests (no hay `globals: true` en
// vitest.config.ts, así que RTL no limpia solo) y el 4to test, que agrega uno más, empieza a
// encontrar dos botones "Desconectar" de renders viejos. Mismo patrón que useFocusTrap.stack.test.tsx.
beforeEach(() => {
  vi.clearAllMocks()
  cleanup()
})

describe('OpsMpConnection', () => {
  it('desconectado: ofrece conectar y aclara que la venta sigue con el link manual', () => {
    estado.mockReturnValue({ conectado: false })
    render(<OpsMpConnection />)
    expect(screen.getByRole('button', { name: /conectar con mercado pago/i })).toBeDefined()
    expect(screen.getByText(/link manual/i)).toBeDefined()
  })

  it('conectado: muestra la cuenta y ofrece desconectar', () => {
    estado.mockReturnValue({ conectado: true, cuenta: '1928447', desde: '2026-07-20T14:32:00Z', vence: '2027-01-16T00:00:00Z' })
    render(<OpsMpConnection />)
    expect(screen.getByText(/1928447/)).toBeDefined()
    expect(screen.getByRole('button', { name: /desconectar/i })).toBeDefined()
  })

  it('nunca muestra tokens aunque el backend los mandara por error', () => {
    estado.mockReturnValue({ conectado: true, cuenta: '1928447', accessToken: 'ACCESS-SECRETO' } as never)
    const { container } = render(<OpsMpConnection />)
    expect(container.textContent).not.toContain('ACCESS-SECRETO')
  })

  // No la pide el brief, pero es la parte no-negociable: MP no deja que la app se quite su
  // propio permiso, así que el diálogo tiene que decirlo — y nunca puede decir "revocado",
  // porque acá no se revoca nada, solo se borra del lado de CCM.
  it('el diálogo de desconexión dice la verdad y no promete un "revocado" que no ocurre', () => {
    estado.mockReturnValue({ conectado: true, cuenta: '1928447' })
    render(<OpsMpConnection />)
    fireEvent.click(screen.getByRole('button', { name: /desconectar/i }))
    expect(
      screen.getByText(/no permite que una aplicación se quite a sí misma el permiso/i),
    ).toBeDefined()
    expect(screen.getByText(/aplicaciones autorizadas de tu cuenta/i)).toBeDefined()
    expect(screen.queryByText(/revocad/i)).toBeNull()
  })
})
