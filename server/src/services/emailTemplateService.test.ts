import { describe, it, expect, vi, beforeEach } from 'vitest'

// El registry lee helpers de templates.ts al importar; nada de env acá.
const prismaMock = {
  emailTemplate: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
}
vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }))

const { sanitizarHtmlEmail, renderMail, guardarPlantilla, listarPlantillas } = await import('./emailTemplateService.js')
const { renderEditable, EDITABLE_TEMPLATES } = await import('../mail/templates.js')

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.emailTemplate.findUnique.mockResolvedValue(null) // sin override por defecto
  prismaMock.emailTemplate.findMany.mockResolvedValue([])
})

const GRANT_OPTS = {
  name: 'Ana',
  eventTitle: 'Expo CCM',
  eventWhen: 'Sábado 19 · 17hs',
  eventVenue: 'Quinto Centenario',
  qty: 2,
  claimUrl: 'https://ccm.test/i/abc.def',
}

describe('renderEditable — default (sin override)', () => {
  it('la cortesía arma asunto + cuerpo con QR embebido y link', () => {
    const msg = renderEditable('ticket_grant', EDITABLE_TEMPLATES.ticket_grant.valores(GRANT_OPTS), { qrCid: 'qr-1@ccm' })
    expect(msg.subject).toBe('Te regalaron una entrada para Expo CCM')
    expect(msg.html).toContain('Expo CCM')
    expect(msg.html).toContain('2 entradas')
    expect(msg.html).toContain('cid:qr-1@ccm') // el QR quedó embebido donde iba {{qr}}
    expect(msg.html).toContain('https://ccm.test/i/abc.def')
    expect(msg.text).toContain('https://ccm.test/i/abc.def')
  })

  it('qty=1 dice "una entrada"; sin nombre no saluda', () => {
    const msg = renderEditable('ticket_grant', EDITABLE_TEMPLATES.ticket_grant.valores({ ...GRANT_OPTS, qty: 1, name: undefined }))
    expect(msg.html).toContain('una entrada')
    expect(msg.html).not.toContain('Hola')
  })
})

describe('renderEditable — seguridad', () => {
  it('ESCAPA los valores: un evento con <script> no inyecta un tag', () => {
    const msg = renderEditable('ticket_grant', EDITABLE_TEMPLATES.ticket_grant.valores({ ...GRANT_OPTS, eventTitle: '<script>alert(1)</script>' }))
    expect(msg.html).not.toContain('<script>alert(1)</script>')
    expect(msg.html).toContain('&lt;script&gt;')
  })

  it('un override malicioso igual escapa los valores interpolados', () => {
    const override = { subject: '{{evento}}', html: '<p>{{evento}} — {{nombre}}</p>' }
    const msg = renderEditable(
      'application_accepted',
      EDITABLE_TEMPLATES.application_accepted.valores({ name: '<img src=x onerror=alert(1)>', convocatoria: 'X' }),
      { override },
    )
    expect(msg.html).not.toContain('<img src=x onerror') // no hay tag crudo: quedó escapado
    expect(msg.html).toContain('&lt;img')
  })
})

describe('sanitizarHtmlEmail', () => {
  it('descarta <script> y handlers on*, conserva tablas y estilos en línea', () => {
    const sucio = `<table style="width:100%"><tr><td style="color:red">hola</td></tr></table>
      <script>alert(1)</script><a href="https://x" onclick="evil()">link</a><img src="cid:qr">`
    const limpio = sanitizarHtmlEmail(sucio)
    expect(limpio).not.toContain('<script')
    expect(limpio).not.toContain('onclick')
    expect(limpio).toContain('<table')
    expect(limpio).toContain('style="color:red"')
    expect(limpio).toContain('href="https://x"')
    expect(limpio).toContain('src="cid:qr"')
  })

  it('descarta javascript: en href', () => {
    const limpio = sanitizarHtmlEmail('<a href="javascript:alert(1)">x</a>')
    expect(limpio).not.toContain('javascript:')
  })

  it('deja pasar los tokens {{}} (son texto)', () => {
    expect(sanitizarHtmlEmail('<p>Hola {{nombre}} — {{qr}}</p>')).toContain('{{nombre}}')
  })
})

describe('renderMail — usa el override si existe', () => {
  it('sin fila en DB usa el default', async () => {
    prismaMock.emailTemplate.findUnique.mockResolvedValue(null)
    const msg = await renderMail('ticket_grant', GRANT_OPTS, { qrCid: 'q@ccm' })
    expect(msg.subject).toBe('Te regalaron una entrada para Expo CCM')
  })

  it('con fila en DB pisa asunto y cuerpo', async () => {
    prismaMock.emailTemplate.findUnique.mockResolvedValue({ subject: 'ASUNTO NUEVO {{evento}}', html: '<p>cuerpo nuevo {{cuando}}</p>' })
    const msg = await renderMail('ticket_grant', GRANT_OPTS, { qrCid: 'q@ccm' })
    expect(msg.subject).toBe('ASUNTO NUEVO Expo CCM')
    expect(msg.html).toContain('cuerpo nuevo Sábado 19 · 17hs')
  })
})

describe('guardarPlantilla — sanea al guardar', () => {
  it('persiste el HTML SANEADO (sin script)', async () => {
    prismaMock.emailTemplate.upsert.mockResolvedValue({})
    await guardarPlantilla('ticket_grant', { subject: 'Hola', html: '<p>ok</p><script>evil()</script>' }, 'admin_1')
    const arg = prismaMock.emailTemplate.upsert.mock.calls[0][0]
    expect(arg.create.html).not.toContain('<script')
    expect(arg.create.html).toContain('<p>ok</p>')
  })

  it('rechaza asunto vacío', async () => {
    await expect(guardarPlantilla('ticket_grant', { subject: '  ', html: '<p>x</p>' }, 'a')).rejects.toMatchObject({ code: 'SUBJECT_VACIO' })
  })

  it('rechaza key desconocida', async () => {
    await expect(guardarPlantilla('no_existe', { subject: 'x', html: '<p>y</p>' }, 'a')).rejects.toMatchObject({ code: 'PLANTILLA_NOT_FOUND' })
  })
})

describe('listarPlantillas', () => {
  it('marca isOverridden y devuelve variables + default', async () => {
    prismaMock.emailTemplate.findMany.mockResolvedValue([
      { key: 'ticket_grant', subject: 'S', html: '<p>H</p>', updatedAt: new Date('2026-09-01'), updatedById: 'a' },
    ])
    const list = await listarPlantillas()
    const grant = list.find((p) => p.key === 'ticket_grant')!
    expect(grant.isOverridden).toBe(true)
    expect(grant.subject).toBe('S')
    expect(grant.defaultSubject).toBe('Te regalaron una entrada para {{evento}}')
    expect(grant.variables.some((v) => v.token === 'qr')).toBe(true)
    const rej = list.find((p) => p.key === 'application_rejected')!
    expect(rej.isOverridden).toBe(false)
  })
})
