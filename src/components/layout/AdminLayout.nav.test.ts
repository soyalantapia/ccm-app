import { describe, it, expect } from 'vitest'
import { SECTIONS, NAV_LEFT, NAV_CENTER, NAV_RIGHT, MORE } from './AdminLayout'

/**
 * INVARIANTE: toda sección del panel es alcanzable desde el celular.
 *
 * El bug que blinda este test ya pasó, y su cicatriz está en el comentario de MORE: Convocatorias
 * estaba declarada en SECTIONS —o sea existía, se veía en escritorio y tenía su ruta— pero no
 * figuraba en ninguno de los cuatro arrays del nav de celular. Desde el teléfono no había forma de
 * llegar salvo tipear /admin/convocatorias a mano, y es justo la sección que se le muestra a las
 * universidades.
 *
 * Es un bug silencioso por naturaleza: nada falla, nada tira error, la sección simplemente no está.
 * Sólo se descubre cuando alguien la busca desde el teléfono y no la encuentra. Por eso hace falta
 * un test y no alcanza con revisarlo al agregar cada sección nueva.
 */

const enNav = new Set([...NAV_LEFT, ...NAV_RIGHT, ...MORE].map((i) => i.to))
const enSections = new Map(SECTIONS.map((s) => [s.to, s]))

describe('nav del panel — ninguna sección queda huérfana en el celular', () => {
  for (const s of SECTIONS) {
    // El Dashboard es el botón central del nav de celular, así que no está en los arrays laterales.
    if (s.to === NAV_CENTER.to) continue
    it(`"${s.label}" se puede alcanzar desde el celular`, () => {
      expect(
        enNav.has(s.to),
        `"${s.label}" (${s.to}) está en SECTIONS pero en ningún nav de celular: ` +
          `hay que agregarla a NAV_LEFT, NAV_RIGHT o MORE, o no se llega desde el teléfono.`,
      ).toBe(true)
    })
  }

  it('el Dashboard es el botón central', () => {
    expect(NAV_CENTER.to).toBe('/admin')
    expect(enSections.has(NAV_CENTER.to)).toBe(true)
  })
})

describe('nav del panel — los atajos no inventan secciones', () => {
  for (const item of [...NAV_LEFT, ...NAV_RIGHT, ...MORE]) {
    it(`el atajo "${item.label}" apunta a una sección que existe`, () => {
      expect(
        enSections.has(item.to),
        `el atajo "${item.label}" apunta a ${item.to}, que no está en SECTIONS: ` +
          `o la ruta quedó vieja, o falta declarar la sección.`,
      ).toBe(true)
    })
  }
})

describe('nav del panel — un atajo no puede pedir menos permiso que su sección', () => {
  /**
   * Si el atajo del celular no pide el mismo permiso que la sección, un rol sin acceso ve la
   * pestaña, la toca y se come el 403 del backend. Ya pasó con "Usuarios": en celular un rol de
   * prensa veía el CRM con datos personales.
   */
  for (const item of [...NAV_LEFT, ...NAV_RIGHT, ...MORE]) {
    const seccion = enSections.get(item.to)
    if (!seccion) continue // lo cubre el bloque anterior
    it(`"${item.label}" pide el mismo permiso que su sección`, () => {
      expect(
        item.needs,
        `el atajo "${item.label}" pide ${item.needs ?? 'nada'} y su sección pide ` +
          `${seccion.needs ?? 'nada'}: quien no llega a la sección vería la pestaña y se comería un 403.`,
      ).toBe(seccion.needs)
    })
  }
})

describe('nav del panel — no hay atajos duplicados', () => {
  it('ninguna sección aparece dos veces entre los atajos', () => {
    const todos = [...NAV_LEFT, ...NAV_RIGHT, ...MORE].map((i) => i.to)
    const repetidos = todos.filter((t, i) => todos.indexOf(t) !== i)
    expect(repetidos, `secciones repetidas en el nav: ${repetidos.join(', ')}`).toEqual([])
  })
})
