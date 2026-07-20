import { describe, it, expect } from 'vitest'
import {
  can,
  canLogin,
  permissionsOf,
  homePathFor,
  PERMISSIONS,
  LOGIN_ENABLED_ROLES,
  ROLE_LABEL,
  ROLE_BLURB,
  ROLE_CAPS,
} from './adminRoles.js'
import type { AdminRole } from '@prisma/client'

const TODOS: AdminRole[] = ['OWNER', 'EDITOR', 'CONTENT', 'STAFF', 'VIEWER']

describe('OWNER', () => {
  it('puede absolutamente todo, sin listar permiso por permiso', () => {
    for (const p of PERMISSIONS) expect(can('OWNER', p)).toBe(true)
  })

  it('es el ÚNICO que gestiona el equipo', () => {
    for (const r of TODOS) {
      expect(can(r, 'team:manage')).toBe(r === 'OWNER')
    }
  })
})

describe('separación de PII — la razón de ser de la matriz', () => {
  it('sólo OWNER y EDITOR ven las postulaciones (ahí está el DNI)', () => {
    expect(can('OWNER', 'applications:read')).toBe(true)
    expect(can('EDITOR', 'applications:read')).toBe(true)
    expect(can('CONTENT', 'applications:read')).toBe(false)
    expect(can('STAFF', 'applications:read')).toBe(false)
    expect(can('VIEWER', 'applications:read')).toBe(false)
  })

  it('quien no puede LEER postulaciones tampoco puede DECIDIRLAS', () => {
    // Poder aceptar/rechazar sin poder leer sería incoherente, y al revés sería una fuga.
    for (const r of TODOS) {
      if (!can(r, 'applications:read')) expect(can(r, 'applications:decide')).toBe(false)
    }
  })
})

describe('CONTENT (prensa y marketing)', () => {
  it('publica contenido', () => {
    expect(can('CONTENT', 'content:write')).toBe(true)
    expect(can('CONTENT', 'upload')).toBe(true)
  })

  it('NO toca la operación del evento ni el catálogo ni los sponsors', () => {
    expect(can('CONTENT', 'events:write')).toBe(false)
    expect(can('CONTENT', 'convocatorias:write')).toBe(false)
    expect(can('CONTENT', 'catalog:write')).toBe(false)
    expect(can('CONTENT', 'sponsors:write')).toBe(false)
    expect(can('CONTENT', 'orders:read')).toBe(false)
  })
})

describe('EDITOR (organizador)', () => {
  it('maneja toda la operación del evento', () => {
    for (const p of ['events:write', 'convocatorias:write', 'catalog:write', 'sponsors:write', 'orders:read'] as const) {
      expect(can('EDITOR', p)).toBe(true)
    }
  })

  it('no gestiona el equipo', () => {
    expect(can('EDITOR', 'team:manage')).toBe(false)
  })
})

describe('roles todavía sin superficie', () => {
  it('STAFF y VIEWER no tienen NINGÚN permiso (no existe su pantalla todavía)', () => {
    for (const p of PERMISSIONS) {
      expect(can('STAFF', p)).toBe(false)
      expect(can('VIEWER', p)).toBe(false)
    }
  })

  it('y por eso tampoco pueden iniciar sesión', () => {
    expect(canLogin('STAFF')).toBe(false)
    expect(canLogin('VIEWER')).toBe(false)
  })

  it('los tres roles con superficie sí pueden entrar', () => {
    expect(canLogin('OWNER')).toBe(true)
    expect(canLogin('EDITOR')).toBe(true)
    expect(canLogin('CONTENT')).toBe(true)
  })

  it('un rol habilitado para entrar tiene al menos un permiso (si no, entra a la nada)', () => {
    for (const r of LOGIN_ENABLED_ROLES) {
      expect(permissionsOf(r).length, `${r} puede entrar pero no puede hacer nada`).toBeGreaterThan(0)
    }
  })
})

describe('permissionsOf', () => {
  it('a OWNER le da la lista completa', () => {
    expect(permissionsOf('OWNER').sort()).toEqual([...PERMISSIONS].sort())
  })

  it('coincide siempre con can()', () => {
    for (const r of TODOS) {
      const lista = permissionsOf(r)
      for (const p of PERMISSIONS) {
        expect(lista.includes(p), `${r} / ${p}`).toBe(can(r, p))
      }
    }
  })

  it('devuelve una copia: mutarla no corrompe la matriz', () => {
    const l = permissionsOf('CONTENT')
    l.push('team:manage')
    expect(can('CONTENT', 'team:manage')).toBe(false)
    expect(permissionsOf('CONTENT')).not.toContain('team:manage')
  })
})

describe('metadatos de la UI y del email', () => {
  it('todos los roles tienen etiqueta, descripción y capacidades', () => {
    for (const r of TODOS) {
      expect(ROLE_LABEL[r], `falta etiqueta de ${r}`).toBeTruthy()
      expect(ROLE_BLURB[r], `falta descripción de ${r}`).toBeTruthy()
      expect(ROLE_CAPS[r]?.length, `faltan capacidades de ${r}`).toBeGreaterThan(0)
    }
  })

  it('cada rol aterriza en una ruta del panel', () => {
    for (const r of TODOS) expect(homePathFor(r)).toMatch(/^\/admin/)
  })

  it('CONTENT aterriza donde puede trabajar, no en el dashboard', () => {
    expect(homePathFor('CONTENT')).toBe('/admin/novedades')
  })
})
