# Dashboard del admin: métricas reales y accionables

**Fecha:** 2026-07-20
**Estado:** aprobado, listo para plan de implementación

## El problema

El Dashboard del panel de organizador no cuenta entidades: cuenta **eventos de analytics**, y los cuenta **en el navegador**. Eso rompe de tres maneras.

**Los números tienen un techo invisible.** `GET /admin/analytics` devuelve como máximo 500 filas (`analyticsService.list`, tope duro de 2000). El Dashboard descarga esa lista y filtra sobre ella, así que "1189 registrados" significa en realidad *"cuántos `user_created` hay entre los últimos 500 eventos"*. Apenas la base supere ese volumen, todos los KPIs quedan subcontados — y son los números con los que se le vende a un sponsor.

**Contar eventos no es contar hechos.** Si un evento no se emitió (fetch fallido, tab cerrada antes del flush, bug en el front), el hecho ocurrió pero el número no lo refleja. La fuente de verdad son las tablas, no la telemetría best-effort.

**El botón "Simular actividad en vivo" escribe en la base de producción.** `LiveSimulator` usa `store.track(...)`, que en modo remoto bufferea y hace `POST /analytics`. Cada demo frente a un cliente inyecta eventos sintéticos que después se cuentan como reales.

Además, el Dashboard responde mal la pregunta que importa. Muestra volumen acumulado, pero no dice **qué hacer hoy**: qué postulación quedó sin responder, qué compra se cayó a mitad de camino, qué bloque no se está llenando, qué convocatoria vence esta semana.

## Decisiones tomadas

| Decisión | Elegido |
|---|---|
| Audiencia | Operación primero; sponsors como sección secundaria |
| Origen de datos | Solo base real, **sin fallback al seed** |
| Actualización | Cada carga trae datos frescos; sin polling |
| Postulaciones `fromSeed` | Excluidas de lo accionable |
| `EventBlock.seedTaken` | Se mantiene, mostrado separado |

Sobre `seedTaken`: no es ficción. Es el cupo que el organizador cargó como tomado fuera de la app (inscripciones por WhatsApp, invitaciones). Se sigue mostrando como "N previos + M por la app", que es como el organizador ya lo lee.

Sobre el seed en la base: `prisma/seed.ts` siembra **catálogo** (eventos, bloques, sponsors, galerías, planes, convocatorias, notas, beneficios, banners) y **postulaciones** marcadas con `fromSeed: true`. No siembra devices, registrations, órdenes, membresías ni descargas — esas seis métricas son 100% reales desde el día uno.

## Arquitectura

Un endpoint agregado: **`GET /api/v1/admin/stats`**, protegido con `requireAdmin`.

El servidor calcula todo con `COUNT`/`groupBy`/`aggregate` de Prisma y devuelve un solo objeto. Una request, un único instante: los KPIs no pueden contradecirse entre sí.

Se descartaron dos alternativas. Un endpoint por dominio (`/stats/overview`, `/stats/applications`, …) reintroduce el fan-out N+1 que ya se corrigió en `AdminEventos` y hace que cada panel llegue de un momento distinto. Subir el límite de analytics no ataca la causa: seguiría contando eventos en lugar de hechos, y las cuatro listas accionables no se pueden armar con eventos — necesitan las tablas.

### Contrato de la respuesta

```ts
interface AdminStats {
  generatedAt: string            // ISO — alimenta el "actualizado hace X"
  kpis: {
    registrados: number
    inscripciones: number
    socios: number
    ingresoSocios: number        // pesos enteros (Membership.paid; formatMoney no usa decimales)
    ordenesConfirmadas: number   // SOLO status:'confirmada' — ver nota abajo
    postulaciones: number        // total real, sin fromSeed
    descargas: number
  }
  postulacionesPendientes: {
    total: number
    masAntiguaDias: number | null
    items: { id, convocatoriaTitulo, diasEsperando, ts }[]   // top 5
  }
  plataTrabada: {
    montoTotal: number
    cantidad: number
    porEstado: { status: 'iniciada' | 'redirigida_mp', cantidad: number, monto: number }[]
  }
  bloquesFlojos: {
    items: { id, titulo, eventoTitulo, dia, capacity, taken, faltan, ocupacion }[]  // top 5
  }
  convocatoriasPorCerrar: {
    items: { id, slug, titulo, deadline, diasRestantes, postulaciones }[]
  }
  sponsors: {
    items: { sponsorId, nombre, nivel, descargas }[]
  }
}
```

### Queries

Todas en `server/src/services/statsService.ts`, una función por bloque para que el archivo no se convierta en un monolito. El router solo compone.

**El KPI de órdenes cambia de significado, a propósito.** Hoy "Órdenes VIP" suma todas las órdenes sin distinguir estado, así que mezcla las cobradas con las que se cayeron a mitad de camino — un número que no sirve para decidir nada. Pasa a contar solo `confirmada`, es decir plata efectivamente cobrada. Las trabadas no desaparecen: son el bloque "plata trabada", donde tienen una acción asociada. El rótulo pasa a ser "Órdenes cobradas" para que el cambio sea evidente y nadie compare peras con manzanas contra capturas viejas.

**KPIs** — `Promise.all` de siete conteos:
```ts
prisma.device.count()
prisma.registration.count({ where: { status: 'confirmada' } })
prisma.membership.count({ where: { tier: 'socio' } })
prisma.membership.aggregate({ _sum: { paid: true }, where: { tier: 'socio' } })
prisma.ticketOrder.count({ where: { status: 'confirmada' } })
prisma.application.count({ where: { fromSeed: false } })
prisma.photoDownload.count()
```

**Postulaciones pendientes** — `status: 'preinscripta'`, `fromSeed: false`, `orderBy: { ts: 'asc' }`, `take: 5`, con `include` del título de la convocatoria. `diasEsperando` se calcula en el servidor contra `generatedAt`, no en el cliente, para que no dependa del reloj del navegador.

**Plata trabada** — `groupBy` por `status` sobre `TicketOrder` filtrando `status IN ('iniciada','redirigida_mp')`, con `_sum: { total: true }` y `_count`. `montoTotal` es la suma de ambos grupos.

**Bloques flojos** — bloques de eventos con `startDate >= hoy`. El cupo tomado sale de un `groupBy` por `blockId` sobre registraciones confirmadas, igual que `getEventAvailability`, más `seedTaken`. Se ordenan por urgencia: primero menor ocupación, y a igual ocupación, fecha más cercana. `take: 5`. Se excluyen los bloques con `capacity === 0` para no dividir por cero.

**Convocatorias por cerrar** — `deadline` entre hoy y hoy + 14 días, con `_count` de postulaciones. Ordenadas por `deadline` ascendente. El corte del día usa el offset de Córdoba (UTC−3), igual que `applicationService`, porque Railway corre en UTC.

**Sponsors** — `groupBy` por `sponsorId` sobre `PhotoDownload`, resuelto contra `Sponsor` para el nombre y el nivel. Impresiones y clics siguen siendo telemetría (viven en `AnalyticsEvent`) y quedan fuera de esta primera versión: mezclarlos volvería a meter conteos con techo en la misma pantalla.

## Frontend

`src/pages/admin/Dashboard.tsx` deja de derivar de `useStore(s => s.getAnalytics())`.

**Acceso al dato.** Se agrega `getAdminStats()` al contrato de `DataStore`. `RemoteDataStore` la implementa contra `/admin/stats`; `LocalDataStore` devuelve `null`, que la UI interpreta como "no hay backend" y muestra el estado vacío. Esto respeta el invariante ya documentado en `RemoteDataStore`: **las lecturas pueden caer a super, pero acá no queremos el seed**, así que el fallback es explícitamente nulo en vez de un número inventado.

**Frescura.** El Dashboard dispara el fetch **al montar**, no en el constructor del store. Hoy el store hidrata una sola vez al arrancar la app, así que navegar al Dashboard desde otra pantalla mostraba el caché viejo; recargar con F5 sí traía datos nuevos. Con el fetch en el mount se cumple lo pedido —cada entrada trae datos actualizados— sin polling.

**Layout.** Arriba los KPIs. Debajo, los cuatro bloques accionables, cada uno con su enlace a la pantalla donde se resuelve (`/admin/postulaciones`, `/admin/ordenes`, `/admin/eventos/:id`, `/admin/convocatorias`). El bloque de sponsors va último.

### Qué se elimina

- `src/features/admin/LiveSimulator.tsx` — el archivo entero
- El botón Exportar CSV y su import de `downloadAnalyticsCsv`
- El panel "Actividad en vivo" (`CoreLiveFeed` en el Dashboard) y el cartel `live` del header

`CoreLiveFeed`, `isSignal` y `downloadAnalyticsCsv` se borran solo si no los usa nadie más; hay que verificarlo con grep antes, no asumirlo.

## Estados

Tres, y ninguno muestra un número inventado:

- **Cargando** — esqueleto en los KPIs y los bloques.
- **Error** — se dice que el backend no respondió, con opción de reintentar. Nunca un cero que parezca un dato.
- **Vacío real** — "0 postulaciones sin responder" es una buena noticia y se muestra como tal ("todo al día"), no como error.

La distinción importa: un cero porque no hay nada y un cero porque falló el fetch se ven igual y significan lo opuesto.

## Testing

`server/src/services/statsService.test.ts`, con Prisma mockeado (mismo patrón que `eventService.test.ts`):

1. Las postulaciones `fromSeed: true` no entran en el KPI ni en las pendientes.
2. La plata trabada suma solo `iniciada` + `redirigida_mp`, y excluye `confirmada` y `cancelada`.
3. Un bloque con `capacity: 0` no aparece en flojos y no produce `NaN`.
4. El orden de bloques flojos es por ocupación ascendente, desempatando por fecha más cercana.
5. Convocatorias: entra una que vence en 3 días, no entra una que venció ayer ni una a 30 días.
6. `ingresoSocios` suma solo membresías con `tier: 'socio'`.

Cada test debe fallar si se rompe la condición que blinda — se verifica por mutación, como se hizo con el batch de cupos.

## Riesgos

**Los números van a bajar mucho.** De "1189 registrados" a lo que realmente haya. Es el objetivo, pero conviene avisarlo antes de mostrar la pantalla a alguien.

**El Dashboard queda vacío en modo demo local.** Consecuencia directa de "sin fallback". Si en algún momento hace falta una demo comercial con volumen, se resuelve con un modo explícito y rotulado, no reintroduciendo el seed por defecto.

**Requiere deploy del backend.** El endpoint es nuevo; hasta que esté en producción el Dashboard mostrará el estado de error. El front debe tolerar el 404 sin romperse, igual que se hizo con `/events/with-blocks`.

## Fuera de alcance

Impresiones y clics por sponsor (siguen en telemetría), series temporales y gráficos de evolución, export en cualquier formato, y filtros por rango de fechas. Si hacen falta, son un spec aparte.
