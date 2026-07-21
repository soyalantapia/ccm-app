import { describe, it, expect } from 'vitest'
import { otpEmail, accessGrantedEmail, applicationAcceptedEmail, applicationRejectedEmail } from './templates.js'
import { ROLE_LABEL } from '../domain/adminRoles.js'
import type { AdminRole } from '@prisma/client'

const TODOS: AdminRole[] = ['OWNER', 'EDITOR', 'CONTENT', 'STAFF', 'VIEWER']

describe('otpEmail', () => {
  const msg = otpEmail({ name: 'Gastón', code: '048372', ttlMin: 10 })

  it('lleva el código en el asunto (se ve desde la notificación, sin abrir el mail)', () => {
    expect(msg.subject).toContain('048372')
  })

  it('muestra el código en el cuerpo, en HTML y en texto plano', () => {
    expect(msg.html).toContain('048372')
    expect(msg.text).toContain('048372')
  })

  it('avisa cuánto dura', () => {
    expect(msg.html).toContain('10')
    expect(msg.text).toContain('10 minutos')
  })

  it('conserva los ceros a la izquierda del código', () => {
    const m = otpEmail({ name: 'X', code: '000123', ttlMin: 10 })
    expect(m.subject).toContain('000123')
    expect(m.html).toContain('000123')
  })

  it('trae versión de texto plano no vacía (es lo que se ve en el log en desarrollo)', () => {
    expect(msg.text.trim().length).toBeGreaterThan(20)
    expect(msg.text).not.toContain('<')
  })
})

describe('accessGrantedEmail', () => {
  const msg = accessGrantedEmail({
    name: 'Ana',
    role: 'CONTENT',
    loginUrl: 'https://ccm.example.com/admin/login',
    invitedBy: 'Gastón',
  })

  it('NO lleva ningún token ni credencial: sólo el link al login de siempre', () => {
    // La invitación no crea una segunda clase de credencial. Si esto cambiara, habría que
    // mantener, expirar y poder revocar tokens de invitación — superficie que hoy no existe.
    expect(msg.html).toContain('https://ccm.example.com/admin/login')
    expect(msg.html).not.toMatch(/token=|invite=|[?&]t=/)
    expect(msg.text).not.toMatch(/token=|invite=|[?&]t=/)
  })

  it('dice el rol y quién invitó', () => {
    expect(msg.html).toContain(ROLE_LABEL.CONTENT)
    expect(msg.html).toContain('Gastón')
    expect(msg.text).toContain('Gastón')
  })

  it('explica que no hay contraseña', () => {
    expect(msg.text.toLowerCase()).toContain('código de un solo uso')
  })

  it('funciona sin saber quién invitó', () => {
    const sinQuien = accessGrantedEmail({ name: 'Ana', role: 'EDITOR', loginUrl: 'https://x.com/admin/login' })
    expect(sinQuien.text).toContain('Te sumaron')
    expect(sinQuien.text).not.toContain('undefined')
  })

  it('sirve para todos los roles, con sus capacidades', () => {
    for (const r of TODOS) {
      const m = accessGrantedEmail({ name: 'X', role: r, loginUrl: 'https://x.com/admin/login' })
      expect(m.html, `${r} sin etiqueta`).toContain(ROLE_LABEL[r])
      expect(m.text.length, `${r} sin cuerpo`).toBeGreaterThan(50)
      expect(m.html).not.toContain('undefined')
    }
  })
})

describe('seguridad de las plantillas', () => {
  it('escapa el HTML del nombre: un nombre malicioso no inyecta markup', () => {
    const m = accessGrantedEmail({
      name: '<script>alert(1)</script>',
      role: 'EDITOR',
      loginUrl: 'https://x.com/admin/login',
    })
    expect(m.html).not.toContain('<script>alert(1)</script>')
    expect(m.html).toContain('&lt;script&gt;')
  })

  it('escapa también el nombre de quien invita', () => {
    const m = accessGrantedEmail({
      name: 'Ana',
      role: 'EDITOR',
      loginUrl: 'https://x.com/admin/login',
      invitedBy: '<img src=x onerror=alert(1)>',
    })
    expect(m.html).not.toContain('<img src=x')
    expect(m.html).toContain('&lt;img')
  })

  it('escapa el nombre en el mail del código', () => {
    const m = otpEmail({ name: '<b>x</b>', code: '111111', ttlMin: 10 })
    expect(m.html).not.toContain('<b>x</b>')
  })
})

describe('forma del mail', () => {
  it('los dos traen asunto, HTML y texto', () => {
    const ms = [
      otpEmail({ name: 'X', code: '123456', ttlMin: 10 }),
      accessGrantedEmail({ name: 'X', role: 'OWNER', loginUrl: 'https://x.com/admin/login' }),
    ]
    for (const m of ms) {
      expect(m.subject.trim()).toBeTruthy()
      expect(m.html).toContain('<!doctype html>')
      expect(m.text.trim()).toBeTruthy()
    }
  })

  it('el HTML usa estilos en línea (Gmail y Outlook descartan las hojas de estilo)', () => {
    const m = otpEmail({ name: 'X', code: '123456', ttlMin: 10 })
    expect(m.html).toContain('style="')
    expect(m.html).not.toContain('<style')
    expect(m.html).not.toContain('<link')
  })
})

describe('applicationAcceptedEmail', () => {
  const msg = applicationAcceptedEmail({ name: 'Lautaro', convocatoria: 'Camino a CCM 2026' })

  it('saluda por el nombre y nombra la convocatoria', () => {
    expect(msg.html).toContain('Lautaro')
    expect(msg.html).toContain('Camino a CCM 2026')
    expect(msg.text).toContain('Lautaro')
  })

  it('el asunto dice que quedó seleccionado, sin que haya que abrirlo', () => {
    expect(msg.subject.toLowerCase()).toContain('camino a ccm 2026')
  })
})

describe('applicationRejectedEmail', () => {
  const msg = applicationRejectedEmail({ name: 'Abril', convocatoria: 'Camino a CCM 2026' })

  it('es cordial y nombra a la persona', () => {
    expect(msg.html).toContain('Abril')
    expect(msg.text).toContain('Abril')
  })

  // El motivo es interno del equipo. Que se filtre a un mail es el peor bug posible acá.
  it('NUNCA incluye la nota interna, ni aunque se la pasen', () => {
    const conNota = applicationRejectedEmail({
      name: 'Abril',
      convocatoria: 'Camino a CCM 2026',
      // @ts-expect-error — la firma no acepta nota; el test blinda que siga siendo así
      note: 'no cumple el perfil, portfolio flojo',
    })
    expect(conNota.html).not.toContain('portfolio flojo')
    expect(conNota.text).not.toContain('portfolio flojo')
    expect(conNota.subject).not.toContain('portfolio flojo')
  })

  it('escapa el HTML de lo que venga de la base', () => {
    const m = applicationRejectedEmail({ name: '<script>x</script>', convocatoria: 'C' })
    expect(m.html).not.toContain('<script>x</script>')
  })
})
