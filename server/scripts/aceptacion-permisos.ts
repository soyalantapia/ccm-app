/**
 * Suite de aceptación del sistema de permisos, usuarios e invitaciones.
 *
 * Ejercita los circuitos REALES contra la API corriendo (no mocks): pide códigos, los canjea,
 * usa las sesiones, cambia roles, da de baja, invita. Parte de un estado conocido —limpia las
 * tablas de admin y siembra su propio elenco— así que es reproducible y se puede correr las
 * veces que haga falta.
 *
 *   API_URL=http://localhost:4020 npx tsx scripts/aceptacion-permisos.ts
 *
 * Sale con código 1 si algo falla, para poder usarla como gate antes de un deploy.
 */
import { prisma } from '../src/lib/prisma.js'
import { env } from '../src/lib/env.js'
import { hashOtp, otpExpiry } from '../src/lib/adminOtp.js'
import type { AdminRole } from '@prisma/client'

const API = (process.env.API_URL ?? 'http://localhost:4020') + '/api/v1'
const LEGACY = env.ADMIN_TOKEN ?? ''

/* ─── Andamiaje mínimo de aserciones ─── */

interface Resultado {
  bloque: string
  nombre: string
  ok: boolean
  detalle: string
}
const resultados: Resultado[] = []
let bloqueActual = ''

const bloque = (n: string) => {
  bloqueActual = n
  console.log(`\n\x1b[1m${n}\x1b[0m`)
}

function afirmar(nombre: string, ok: boolean, detalle = '') {
  resultados.push({ bloque: bloqueActual, nombre, ok, detalle })
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${nombre}${detalle ? `  \x1b[2m${detalle}\x1b[0m` : ''}`)
}

const igual = (nombre: string, real: unknown, esperado: unknown) =>
  afirmar(nombre, real === esperado, `esperado ${JSON.stringify(esperado)}, obtuve ${JSON.stringify(real)}`)

/* ─── Cliente HTTP ─── */

async function req(
  metodo: string,
  ruta: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: any }> {
  const res = await fetch(API + ruta, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const body = res.status === 204 ? null : await res.json().catch(() => null)
  return { status: res.status, body }
}

/* ─── Utilidades de escenario ─── */

const EMAILS = {
  owner: 'acept.owner@ccm.test',
  owner2: 'acept.owner2@ccm.test',
  editor: 'acept.editor@ccm.test',
  content: 'acept.content@ccm.test',
  staff: 'acept.staff@ccm.test',
  baja: 'acept.baja@ccm.test',
  invitado: 'acept.invitado@ccm.test',
}

/** Emite un código canjeable sin pasar por el mail y devuelve el token de sesión tras canjearlo.
 *  Ejercita el verify-otp REAL: es el mismo camino que usa una persona. */
async function entrar(email: string): Promise<string | null> {
  const user = await prisma.adminUser.findUnique({ where: { email } })
  if (!user || !env.OTP_PEPPER) return null
  const code = '424242'
  await prisma.adminLoginCode.create({
    data: { userId: user.id, codeHash: hashOtp(code, user.id, env.OTP_PEPPER), expiresAt: otpExpiry(new Date()) },
  })
  const r = await req('POST', '/auth/admin/verify-otp', { body: { email, code } })
  return r.status === 200 ? r.body.token : null
}

async function idDe(email: string): Promise<string> {
  const u = await prisma.adminUser.findUnique({ where: { email } })
  return u!.id
}

async function sembrar() {
  // Borrar sólo el elenco de esta suite (deja intactos los usuarios reales del entorno).
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: 'acept.' } } })
  const crear = (email: string, role: AdminRole, status: 'active' | 'invited' | 'disabled' = 'active') =>
    prisma.adminUser.create({ data: { email, name: `Prueba ${role}`, role, status } })
  await crear(EMAILS.owner, 'OWNER')
  await crear(EMAILS.owner2, 'OWNER')
  await crear(EMAILS.editor, 'EDITOR')
  await crear(EMAILS.content, 'CONTENT')
  await crear(EMAILS.staff, 'STAFF')
  await crear(EMAILS.baja, 'EDITOR', 'disabled')
}

/** Endpoints representativos de cada capacidad, para probar la matriz contra la API real. */
const SUPERFICIE: { nombre: string; metodo: string; ruta: string; permiso: string }[] = [
  { nombre: 'ver postulaciones (PII/DNI)', metodo: 'GET', ruta: '/admin/applications', permiso: 'applications:read' },
  { nombre: 'ver métricas', metodo: 'GET', ruta: '/admin/analytics', permiso: 'analytics:read' },
  { nombre: 'ver los KPIs del dashboard', metodo: 'GET', ruta: '/admin/stats', permiso: 'analytics:read' },
  { nombre: 'ver novedades del panel', metodo: 'GET', ruta: '/admin/notas', permiso: 'content:write' },
  { nombre: 'ver beneficios del panel', metodo: 'GET', ruta: '/admin/benefits', permiso: 'content:write' },
  { nombre: 'ver banners del panel', metodo: 'GET', ruta: '/admin/banners', permiso: 'content:write' },
  { nombre: 'ver convocatorias', metodo: 'GET', ruta: '/admin/convocatorias', permiso: 'convocatorias:write' },
  { nombre: 'gestionar el equipo', metodo: 'GET', ruta: '/admin/team', permiso: 'team:manage' },
]

/** Qué permisos tiene cada rol, según el contrato del dominio. La suite lo verifica contra la API. */
const MATRIZ: Record<string, string[]> = {
  OWNER: ['applications:read', 'analytics:read', 'content:write', 'convocatorias:write', 'team:manage'],
  EDITOR: ['applications:read', 'analytics:read', 'content:write', 'convocatorias:write'],
  CONTENT: ['analytics:read', 'content:write'],
}

async function main() {
  console.log(`\n\x1b[1m═══ Aceptación de permisos · ${API} ═══\x1b[0m`)
  await sembrar()

  /* ══ 1. LOGIN ══ */
  bloque('1. Entrar al panel')

  const tOwner = await entrar(EMAILS.owner)
  afirmar('un dueño entra con su código', !!tOwner)

  const me = await req('GET', '/auth/admin/me', { token: tOwner! })
  igual('la sesión dice quién es', me.body?.user?.email, EMAILS.owner)
  igual('y con qué rol', me.body?.user?.role, 'OWNER')

  // El código es de un solo uso: re-canjearlo tiene que fallar.
  const u = await prisma.adminUser.findUnique({ where: { email: EMAILS.owner } })
  const reuso = await req('POST', '/auth/admin/verify-otp', { body: { email: EMAILS.owner, code: '424242' } })
  igual('un código usado ya no sirve', reuso.status, 401)
  void u

  const malo = await req('POST', '/auth/admin/verify-otp', { body: { email: EMAILS.owner, code: '000000' } })
  igual('un código equivocado no entra', malo.status, 401)

  const sinToken = await req('GET', '/admin/team')
  igual('sin sesión no se entra a nada', sinToken.status, 401)

  const inventado = await req('GET', '/auth/admin/me', { token: 'inventado.no.firmado' })
  afirmar('un token inventado no sirve', inventado.status === 401 || inventado.status === 403, `HTTP ${inventado.status}`)

  /* ══ 2. NO SE PUEDE ENUMERAR QUIÉN ES DEL EQUIPO ══ */
  bloque('2. No se filtra quién tiene acceso')

  const pedirExiste = await req('POST', '/auth/admin/request-otp', { body: { email: EMAILS.owner } })
  const pedirNoExiste = await req('POST', '/auth/admin/request-otp', { body: { email: 'nadie@nada.test' } })
  igual('pedir código: mismo status exista o no', pedirExiste.status, pedirNoExiste.status)
  igual(
    'pedir código: mismo cuerpo exista o no',
    JSON.stringify(pedirExiste.body),
    JSON.stringify(pedirNoExiste.body),
  )

  const canjeNoExiste = await req('POST', '/auth/admin/verify-otp', { body: { email: 'nadie@nada.test', code: '000000' } })
  const canjeExiste = await req('POST', '/auth/admin/verify-otp', { body: { email: EMAILS.owner, code: '999999' } })
  igual('canjear: mismo status exista o no', canjeExiste.status, canjeNoExiste.status)
  igual('canjear: mismo código de error', canjeExiste.body?.error?.code, canjeNoExiste.body?.error?.code)

  const canjeBaja = await req('POST', '/auth/admin/verify-otp', { body: { email: EMAILS.baja, code: '000000' } })
  igual('una cuenta dada de baja no se distingue', canjeBaja.body?.error?.code, canjeNoExiste.body?.error?.code)

  /* ══ 3. ROLES SIN PANTALLA NO ENTRAN ══ */
  bloque('3. Roles todavía sin superficie')

  const tStaff = await entrar(EMAILS.staff)
  afirmar('el rol de puerta NO puede entrar (no tiene pantalla)', tStaff === null)

  const tBaja = await entrar(EMAILS.baja)
  afirmar('una cuenta dada de baja NO puede entrar', tBaja === null)

  /* ══ 4. LA MATRIZ DE PERMISOS, CONTRA LA API ══ */
  bloque('4. Qué puede hacer cada rol (probado endpoint por endpoint)')

  const tokens: Record<string, string> = {}
  for (const [rol, email] of [
    ['OWNER', EMAILS.owner],
    ['EDITOR', EMAILS.editor],
    ['CONTENT', EMAILS.content],
  ] as const) {
    const t = await entrar(email)
    if (!t) {
      afirmar(`${rol} puede entrar`, false)
      continue
    }
    tokens[rol] = t
    const perms = (await req('GET', '/auth/admin/me', { token: t })).body?.user?.permissions ?? []
    for (const esperado of MATRIZ[rol]) {
      afirmar(`${rol} declara ${esperado}`, perms.includes(esperado))
    }
  }

  for (const s of SUPERFICIE) {
    for (const rol of ['OWNER', 'EDITOR', 'CONTENT']) {
      const t = tokens[rol]
      if (!t) continue
      const deberia = MATRIZ[rol].includes(s.permiso)
      const r = await req(s.metodo, s.ruta, { token: t })
      const pudo = r.status >= 200 && r.status < 300
      afirmar(
        `${rol} ${deberia ? 'SÍ' : 'NO'} puede ${s.nombre}`,
        pudo === deberia,
        `HTTP ${r.status}`,
      )
    }
  }

  /* ══ 5. INVITACIONES ══ */
  bloque('5. Invitar gente al equipo')

  const inv = await req('POST', '/admin/team/invite', {
    token: tokens.OWNER,
    body: { email: EMAILS.invitado, name: 'Invitada Prueba', role: 'CONTENT' },
  })
  igual('un dueño puede invitar', inv.status, 201)
  igual('la persona queda como invitada', inv.body?.user?.status, 'invited')
  igual('con el rol elegido', inv.body?.user?.role, 'CONTENT')
  afirmar('queda registrado quién la invitó', !!inv.body?.user?.invitedBy, `invitó: ${inv.body?.user?.invitedBy}`)
  afirmar('se le manda el aviso por mail', inv.body?.email?.sent === true, `sent=${inv.body?.email?.sent}`)

  const repetido = await req('POST', '/admin/team/invite', {
    token: tokens.OWNER,
    body: { email: EMAILS.invitado, name: 'Otra', role: 'EDITOR' },
  })
  igual('no se puede invitar dos veces al mismo email', repetido.status, 409)

  const invPorEditor = await req('POST', '/admin/team/invite', {
    token: tokens.EDITOR,
    body: { email: 'colado@ccm.test', name: 'Colado', role: 'CONTENT' },
  })
  igual('un organizador NO puede invitar', invPorEditor.status, 403)

  const invPorContent = await req('POST', '/admin/team/invite', {
    token: tokens.CONTENT,
    body: { email: 'colado2@ccm.test', name: 'Colado', role: 'CONTENT' },
  })
  igual('alguien de contenido NO puede invitar', invPorContent.status, 403)

  const rolMalo = await req('POST', '/admin/team/invite', {
    token: tokens.OWNER,
    body: { email: 'puerta@ccm.test', name: 'Puerta', role: 'STAFF' },
  })
  afirmar('no se puede invitar a un rol sin pantalla', rolMalo.status >= 400, `HTTP ${rolMalo.status}`)

  // La invitada entra por el circuito normal: pide su código como cualquiera.
  const tInvitada = await entrar(EMAILS.invitado)
  afirmar('la invitada entra con el circuito normal', !!tInvitada)
  const meInv = await req('GET', '/auth/admin/me', { token: tInvitada! })
  igual('y entra con el rol que le dieron', meInv.body?.user?.role, 'CONTENT')
  const estadoInv = await prisma.adminUser.findUnique({ where: { email: EMAILS.invitado } })
  igual('su estado pasa solo a activo al entrar', estadoInv?.status, 'active')

  const reenvio = await req('POST', `/admin/team/${await idDe(EMAILS.invitado)}/resend`, { token: tokens.OWNER })
  igual('se le puede reenviar el aviso', reenvio.status, 200)

  /* ══ 6. CAMBIOS DE PERMISOS EN VIVO ══ */
  bloque('6. Los cambios pegan al instante')

  const idContent = await idDe(EMAILS.content)
  const antes = await req('GET', '/admin/applications', { token: tokens.CONTENT })
  igual('contenido no ve postulaciones', antes.status, 403)

  await req('PATCH', `/admin/team/${idContent}`, { token: tokens.OWNER, body: { role: 'EDITOR' } })
  const despues = await req('GET', '/admin/applications', { token: tokens.CONTENT })
  igual('al subirle el rol, ve postulaciones SIN volver a entrar', despues.status, 200)

  await req('PATCH', `/admin/team/${idContent}`, { token: tokens.OWNER, body: { role: 'CONTENT' } })
  const revertido = await req('GET', '/admin/applications', { token: tokens.CONTENT })
  igual('al bajarle el rol, deja de verlas en el acto', revertido.status, 403)

  const idEditor = await idDe(EMAILS.editor)
  await req('PATCH', `/admin/team/${idEditor}`, { token: tokens.OWNER, body: { status: 'disabled' } })
  const trasBaja = await req('GET', '/admin/analytics', { token: tokens.EDITOR })
  igual('dar de baja saca a la persona en el acto', trasBaja.status, 401)
  const sesionesTrasBaja = await prisma.adminSession.count({ where: { userId: idEditor } })
  igual('y le borra las sesiones abiertas', sesionesTrasBaja, 0)

  await req('PATCH', `/admin/team/${idEditor}`, { token: tokens.OWNER, body: { status: 'active' } })
  const tEditor2 = await entrar(EMAILS.editor)
  afirmar('se le puede devolver el acceso', !!tEditor2)

  /* ══ 7. NO QUEDARSE SIN DUEÑOS ══ */
  bloque('7. Redes para no quedarse afuera')

  const idOwner = await idDe(EMAILS.owner)
  const autoBaja = await req('PATCH', `/admin/team/${idOwner}`, { token: tokens.OWNER, body: { status: 'disabled' } })
  igual('un dueño no puede darse de baja a sí mismo', autoBaja.status, 422)

  const autoDegradar = await req('PATCH', `/admin/team/${idOwner}`, { token: tokens.OWNER, body: { role: 'CONTENT' } })
  igual('ni bajarse el rol a sí mismo', autoDegradar.status, 422)

  // Dejar un solo dueño y probar que no se lo puede sacar.
  const idOwner2 = await idDe(EMAILS.owner2)
  await req('PATCH', `/admin/team/${idOwner2}`, { token: tokens.OWNER, body: { role: 'EDITOR' } })
  const owners = await prisma.adminUser.count({
    where: { email: { startsWith: 'acept.' }, role: 'OWNER', status: { not: 'disabled' } },
  })
  igual('queda un solo dueño en el elenco', owners, 1)

  // El caso del ÚLTIMO dueño es el más importante de todos: si falla, la plataforma queda sin
  // nadie que pueda administrarla. Para probarlo de verdad hay que ser el único owner del
  // sistema, así que degradamos temporalmente a los owners reales del entorno y los restauramos
  // pase lo que pase. Sin este aislamiento el caso quedaba sin probar, que es peor.
  if (LEGACY) {
    const otrosOwners = await prisma.adminUser.findMany({
      where: { role: 'OWNER', status: { not: 'disabled' }, email: { not: EMAILS.owner } },
      select: { id: true, role: true },
    })
    try {
      if (otrosOwners.length) {
        await prisma.adminUser.updateMany({
          where: { id: { in: otrosOwners.map((o) => o.id) } },
          data: { role: 'EDITOR' },
        })
      }
      const quedan = await prisma.adminUser.count({ where: { role: 'OWNER', status: { not: 'disabled' } } })
      igual('escenario aislado: queda un único dueño en todo el sistema', quedan, 1)

      // El token legacy vale como OWNER pero no es "uno mismo", así que esquiva la guarda de
      // auto-bloqueo y prueba específicamente la del último dueño.
      const baja = await req('PATCH', `/admin/team/${idOwner}`, { token: LEGACY, body: { status: 'disabled' } })
      igual('NO se puede dar de baja al último dueño', baja.status, 422)
      igual('y el motivo lo dice claro', baja.body?.error?.code, 'LAST_OWNER')

      const degradar = await req('PATCH', `/admin/team/${idOwner}`, { token: LEGACY, body: { role: 'CONTENT' } })
      igual('NI cambiarle el rol al último dueño', degradar.status, 422)

      const siguenSiendo = await prisma.adminUser.count({ where: { role: 'OWNER', status: { not: 'disabled' } } })
      igual('el sistema NUNCA queda sin dueños', siguenSiendo, 1)
    } finally {
      // Restaurar el entorno pase lo que pase: si esto no corre, el usuario se queda sin owners.
      for (const o of otrosOwners) {
        await prisma.adminUser.update({ where: { id: o.id }, data: { role: o.role } })
      }
    }
  }

  /* ══ 8. SESIONES ══ */
  bloque('8. Sesiones')

  const tParaCerrar = await entrar(EMAILS.owner)
  const cerrar = await req('POST', '/auth/admin/logout', { token: tParaCerrar! })
  igual('cerrar sesión responde ok', cerrar.status, 204)
  const trasCerrar = await req('GET', '/auth/admin/me', { token: tParaCerrar! })
  igual('y el token deja de servir en el acto', trasCerrar.status, 401)

  const otraSesion = await entrar(EMAILS.owner)
  afirmar('cerrar una sesión no afecta a las demás', !!otraSesion)

  /* ══ 9. EL PANEL NO SE ABRE POR LA URL ══ */
  bloque('9. Los permisos se aplican en el servidor')

  const escrituras: { nombre: string; metodo: string; ruta: string; body: unknown }[] = [
    { nombre: 'crear un evento', metodo: 'POST', ruta: '/admin/events', body: { id: 'x-test' } },
    { nombre: 'crear una convocatoria', metodo: 'POST', ruta: '/admin/convocatorias', body: { id: 'x-test' } },
  ]
  for (const e of escrituras) {
    const r = await req(e.metodo, e.ruta, { token: tokens.CONTENT, body: e.body })
    igual(`contenido NO puede ${e.nombre}`, r.status, 403)
  }

  /* ── Resumen ── */
  const fallos = resultados.filter((r) => !r.ok)
  console.log(`\n\x1b[1m═══ ${resultados.length - fallos.length}/${resultados.length} verificaciones pasaron ═══\x1b[0m`)
  if (fallos.length) {
    console.log(`\n\x1b[31mFallaron ${fallos.length}:\x1b[0m`)
    for (const f of fallos) console.log(`  ✗ [${f.bloque}] ${f.nombre}\n      ${f.detalle}`)
  }

  await prisma.adminUser.deleteMany({ where: { email: { startsWith: 'acept.' } } })
  await prisma.$disconnect()
  process.exit(fallos.length ? 1 : 0)
}

void main()
