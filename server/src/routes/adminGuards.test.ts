import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Red de seguridad estructural: NINGUNA ruta /admin puede quedar sin guard de permiso.
 *
 * Antes había un solo `router.use('/admin', requireAdmin)` que cubría todo el prefijo. Era
 * cómodo pero mentiroso: daba la sensación de que estaba protegido y no permitía distinguir
 * quién puede hacer qué. Ahora cada ruta declara su permiso — y el precio de esa granularidad
 * es que alguien puede olvidarse de una. Este test es el que no deja que eso pase: lee los
 * archivos de rutas y falla si encuentra una ruta /admin sin `requirePermission`.
 *
 * Se hace por texto y no levantando la app a propósito: así detecta el olvido en el momento
 * de escribirlo, sin depender de que exista un test de integración para esa ruta puntual.
 */

const ROUTES_DIR = join(import.meta.dirname, '.')

/** Rutas que NO llevan guard de permiso, con su razón. Agregar acá es una decisión consciente. */
const SIN_GUARD_JUSTIFICADO: Record<string, string> = {
  '/auth/admin/request-otp': 'pública por definición: es el pedido del código para poder entrar',
  '/auth/admin/verify-otp': 'pública por definición: es el canje del código por una sesión',
  '/auth/admin/logout': 'usa requireAdmin (autenticar alcanza; no requiere ningún permiso)',
  '/auth/admin/me': 'usa requireAdmin (autenticar alcanza; devuelve los permisos propios)',
}

interface RutaEncontrada {
  archivo: string
  metodo: string
  path: string
  linea: number
  protegida: boolean
}

function escanear(): RutaEncontrada[] {
  const out: RutaEncontrada[] = []
  const archivos = readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))

  for (const archivo of archivos) {
    const texto = readFileSync(join(ROUTES_DIR, archivo), 'utf8')
    texto.split('\n').forEach((linea, i) => {
      const m = linea.match(/(\w*Router)\.(get|post|patch|delete|put)\(\s*'([^']+)'\s*,(.*)$/)
      if (!m) return
      const [, , metodo, path, resto] = m
      // Sólo interesan las rutas del panel.
      if (!path.startsWith('/admin') && !path.startsWith('/auth/admin')) return
      const protegida = /requirePermission\(|requireAdmin\b/.test(resto)
      out.push({ archivo, metodo: metodo.toUpperCase(), path, linea: i + 1, protegida })
    })
  }
  return out
}

const RUTAS = escanear()

describe('cobertura de guards en las rutas del panel', () => {
  it('encuentra las rutas (si esto falla, el escaneo se rompió y el resto no prueba nada)', () => {
    expect(RUTAS.length).toBeGreaterThan(25)
  })

  it('TODAS las rutas /admin exigen un permiso', () => {
    const desprotegidas = RUTAS.filter(
      (r) => !r.protegida && SIN_GUARD_JUSTIFICADO[r.path] === undefined,
    )
    const detalle = desprotegidas.map((r) => `  ${r.metodo} ${r.path} — ${r.archivo}:${r.linea}`).join('\n')
    expect(desprotegidas, `Rutas del panel SIN guard:\n${detalle}`).toEqual([])
  })

  it('las únicas sin guard de permiso son las del login, y están justificadas', () => {
    const sinGuard = RUTAS.filter((r) => !r.protegida).map((r) => r.path)
    for (const p of sinGuard) {
      expect(SIN_GUARD_JUSTIFICADO[p], `${p} no tiene guard ni justificación`).toBeTruthy()
    }
  })

  it('ya no queda un guard global sobre el prefijo /admin (esconde rutas sin permiso)', () => {
    const adminTs = readFileSync(join(ROUTES_DIR, 'admin.ts'), 'utf8')
    expect(adminTs).not.toMatch(/adminRouter\.use\(\s*'\/admin'\s*,\s*requireAdmin\s*\)/)
  })

  it('las postulaciones (PII) sólo se leen con applications:read', () => {
    const lectura = RUTAS.find((r) => r.path === '/admin/applications' && r.metodo === 'GET')
    expect(lectura, 'no está la ruta de lectura de postulaciones').toBeTruthy()
    const texto = readFileSync(join(ROUTES_DIR, lectura!.archivo), 'utf8').split('\n')[lectura!.linea - 1]
    expect(texto).toContain("requirePermission('applications:read')")
  })

  it('subir imágenes exige el permiso de upload', () => {
    const up = RUTAS.find((r) => r.path === '/admin/upload')
    expect(up?.protegida).toBe(true)
  })
})
