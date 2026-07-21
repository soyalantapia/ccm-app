import { describe, it, expect } from 'vitest'
import {
  fechaEnTexto,
  esTextoAutomatico,
  textoContradiceLaFecha,
  yaPaso,
  estaPorVenir,
  hoyISO,
} from './eventDate'

/** Los cuatro eventos que estaban mal en producción, tal cual estaban. */
const REALES = {
  masterclass: { iso: '2026-08-21', textoViejo: 'Jueves 21 de agosto' }, // era viernes
  taller: { iso: '2026-09-05', textoViejo: 'Viernes 5 de septiembre' }, // era sábado
  caminoJunio: { iso: '2026-06-18', past: false },
  principal: { iso: '2026-09-19', texto: '19 y 20 de septiembre' }, // multi-día legítimo
}

describe('fechaEnTexto — el texto sale de la fecha, no de los dedos', () => {
  it('escribe el día de la semana correcto', () => {
    expect(fechaEnTexto('2026-08-21')).toBe('Viernes 21 de agosto')
    expect(fechaEnTexto('2026-09-05')).toBe('Sábado 5 de septiembre')
    expect(fechaEnTexto('2026-06-18')).toBe('Jueves 18 de junio')
  })

  it('produce lo que el equipo venía escribiendo a mano cuando acertaba', () => {
    expect(fechaEnTexto('2026-05-16')).toBe('Sábado 16 de mayo')
    expect(fechaEnTexto('2026-06-30')).toBe('Martes 30 de junio')
  })

  it('NO habría dejado escribir los dos errores que estaban publicados', () => {
    expect(fechaEnTexto(REALES.masterclass.iso)).not.toBe(REALES.masterclass.textoViejo)
    expect(fechaEnTexto(REALES.taller.iso)).not.toBe(REALES.taller.textoViejo)
  })

  it('acepta un ISO con hora y usa la parte de fecha', () => {
    expect(fechaEnTexto('2026-08-21T00:00:00.000Z')).toBe('Viernes 21 de agosto')
  })

  it('NO se corre un día por zona horaria (el ISO no se parsea como UTC)', () => {
    // new Date('2026-06-18') es medianoche UTC = 17/06 21:00 en Argentina. Si se parseara así,
    // el día de la semana saldría el anterior. Es el mismo error que ya nos mordió antes.
    expect(fechaEnTexto('2026-01-01')).toBe('Jueves 1 de enero')
    expect(fechaEnTexto('2026-12-31')).toBe('Jueves 31 de diciembre')
  })

  it('devuelve vacío si la fecha no se puede leer, en vez de inventar', () => {
    expect(fechaEnTexto('')).toBe('')
    expect(fechaEnTexto('mañana')).toBe('')
  })
})

describe('esTextoAutomatico — distinguir lo derivado de lo escrito a mano', () => {
  it('reconoce el texto que genera el sistema', () => {
    expect(esTextoAutomatico('2026-08-21', 'Viernes 21 de agosto')).toBe(true)
  })

  it('reconoce un texto personalizado (el multi-día del evento principal)', () => {
    expect(esTextoAutomatico(REALES.principal.iso, REALES.principal.texto)).toBe(false)
  })

  it('ignora mayúsculas y espacios de más', () => {
    expect(esTextoAutomatico('2026-08-21', '  viernes 21 DE AGOSTO ')).toBe(true)
  })
})

describe('textoContradiceLaFecha — avisar antes de publicar', () => {
  it('detecta los dos errores que estuvieron publicados', () => {
    expect(textoContradiceLaFecha(REALES.masterclass.iso, REALES.masterclass.textoViejo))
      .toContain('viernes')
    expect(textoContradiceLaFecha(REALES.taller.iso, REALES.taller.textoViejo)).toContain('sábado')
  })

  it('no se queja cuando el texto acierta', () => {
    expect(textoContradiceLaFecha('2026-08-21', 'Viernes 21 de agosto')).toBeNull()
  })

  it('NO se queja de un texto sin día de la semana: "19 y 20 de septiembre" es válido', () => {
    expect(textoContradiceLaFecha(REALES.principal.iso, REALES.principal.texto)).toBeNull()
  })

  it('tolera cómo se escriba el día (con o sin tilde)', () => {
    expect(textoContradiceLaFecha('2026-09-05', 'Sabado 5 de septiembre')).toBeNull()
    expect(textoContradiceLaFecha('2026-05-16', 'Miercoles 16 de mayo')).toContain('sábado')
  })
})

describe('yaPaso — lo decide la fecha, no un tilde que alguien puede olvidar', () => {
  const hoy = new Date(2026, 6, 20) // 20 de julio de 2026

  it('un evento de ayer ya pasó, aunque nadie lo haya tildado', () => {
    // Exactamente lo que estaba publicado: dos Caminos de junio anunciados como próximos.
    expect(yaPaso({ startDate: '2026-06-18', past: false }, hoy)).toBe(true)
    expect(yaPaso({ startDate: '2026-06-30', past: false }, hoy)).toBe(true)
  })

  it('un evento futuro no pasó', () => {
    expect(yaPaso({ startDate: '2026-09-19' }, hoy)).toBe(false)
  })

  it('el evento de HOY todavía no pasó (se hace hoy)', () => {
    expect(yaPaso({ startDate: '2026-07-20' }, hoy)).toBe(false)
  })

  it('el tilde manual sigue valiendo para cerrar antes de tiempo (una suspensión)', () => {
    expect(yaPaso({ startDate: '2026-12-31', past: true }, hoy)).toBe(true)
  })

  it('sin fecha, no se asume nada', () => {
    expect(yaPaso({ startDate: '' }, hoy)).toBe(false)
  })

  it('estaPorVenir es lo contrario', () => {
    for (const e of [{ startDate: '2026-06-18' }, { startDate: '2026-09-19' }]) {
      expect(estaPorVenir(e, hoy)).toBe(!yaPaso(e, hoy))
    }
  })
})

describe('hoyISO', () => {
  it('usa el reloj local, no UTC (a las 21 en Argentina sigue siendo hoy)', () => {
    // 20/07/2026 21:30 local. En UTC ya sería el 21.
    expect(hoyISO(new Date(2026, 6, 20, 21, 30))).toBe('2026-07-20')
  })
})
