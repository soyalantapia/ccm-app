# Modelo de datos (schema Prisma)

Traducción 1:1 del dominio de CCM (`src/data/types.ts`) a un schema Prisma sobre PostgreSQL. Define tablas, relaciones, enums, índices y la estrategia de migración del seed estático + `localStorage` a filas reales. Es el contrato que tiene que respetar el `RemoteDataStore` para enchufarse sin tocar pantallas.

---

## 0. Principios de modelado

1. **El `DataStore` es el contrato, no la base.** La UI nunca ve Prisma; ve la interfaz `DataStore`. El schema existe para que el API pueda devolver exactamente las shapes que hoy produce `LocalDataStore`. Donde el tipo del dominio es plano (p.ej. `Sponsor.creatives` como array), acá lo normalizamos a tabla hija y el repositorio lo re-arma.
2. **`id` legible y estable.** Hoy los IDs son strings con prefijo (`ev-...`, `ord_...`, `sp-...`, `gal-...`) y son contrato compartido con el seed (`src/data/ids.ts`). Mantenemos `id String @id` (no `uuid` autogenerado en DB) para no romper deep-links ni el seed; los IDs nuevos los genera la app con el mismo esquema de prefijos. Donde no hay contrato externo (analytics, downloads) usamos `cuid()`.
3. **Identidad sin contraseña, anclada al `deviceId`.** UNA sola entidad raíz: `Device` (con `id` cuid + `publicId` único). Es la raíz de casi todo lo "del usuario" (inscripciones, órdenes, membresía, favoritos, descargas, analytics). No hay tabla `User` separada en Fase 1: el `Device` ES el usuario. **No existe una tabla `DeviceProfile`**: el tipo TS `DeviceProfile` que consume el front se serializa desde `Device` + sus `ProfileField` en el repositorio. TODAS las FKs del usuario (Registration, TicketOrder, Membership, AnalyticsEvent, Payment) referencian `Device.id`. 🔶 [DECISIÓN ABIERTA] si más adelante se quiere "reclamar" un dispositivo con email/PIN para unificar dispositivos de una misma persona.
4. **PII separada y auditada.** Ningún dato personal va en columnas planas de `Device`. Los campos de perfil (email, DNI, teléfono, etc.) van a `ProfileField` con su `source` y `capturedAt` para captura progresiva, segmentación, trazabilidad de origen y poder borrar/exportar por persona (derecho de acceso/baja). Ver §3.
5. **Plata = inmutable + auditable.** `TicketOrder`, `Membership` y `AdCampaign` registran montos. Nunca se recalculan desde el plan actual; el monto se congela al crear (igual que hoy: `total = (price + serviceCharge) * qty`).
6. **Pago centralizado y polimórfico.** Toda la plomería de Mercado Pago (preferencia, id de pago, estado del cobro, raw del webhook) vive en UNA tabla `Payment` polimórfica (`kind` + `resourceId`). Los recursos cobrables (`TicketOrder`, `Membership`, `AdCampaign`) **no llevan columnas `mpPreferenceId`/`mpPaymentId`**; conservan su PROPIO enum de estado (su máquina de estados de negocio) que el webhook actualiza. Ver §1 (Pagos) y doc 07 (pagos-mercadopago).
7. **Borrado seguro.** Las entidades con datos reales asociados no se hard-deletean: o se bloquea con 409, o se archiva (soft-delete con `archivedAt`). Las FKs hacia recursos referenciados conservan integridad (`onDelete: Restrict` donde corresponde). Ver §1 (nota de borrado) y canon 16.
8. **Enums en DB.** Donde el dominio usa uniones de strings (`OrderStatus`, `AdSlot`, `EventType`, `MembershipTier`, `AdminRole`, …) usamos enums Postgres. Da validación en la base y se mapea directo al union TS.

---

## 1. Schema completo

```prisma
// schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────────────────────
//  ENUMS
// ─────────────────────────────────────────────────────────

enum EventType {
  principal
  camino
  capacitacion
}

enum RegistrationStatus {
  confirmada
  cancelada
}

enum PlanDay {
  sabado
  domingo
  combo
}

enum PlanKind {
  general
  vip
}

enum OrderStatus {
  iniciada
  redirigida_mp
  confirmada
  cancelada
}

enum SponsorLevel {
  Principal
  Oro
  Plata
}

enum AdSlot {
  S1
  S2
  S3
  S4
  S6 // S5 no existe en el dominio: hueco intencional, no agregar
}

enum MembershipTier {
  free
  socio
}

enum ApplicationStatus {
  preinscripta
  aceptada
  rechazada
}

enum CampaignStatus {
  pendiente_pago // orden creada, esperando confirmación de MP
  activa
  expirada
  rechazada
}

// Rol del panel admin (canon 6). STAFF = personal de puerta (solo escanea QR).
enum AdminRole {
  OWNER
  EDITOR
  STAFF
  VIEWER
}

// Tipo de recurso que paga una fila Payment (canon 7).
enum PaymentKind {
  ticket_order
  membership
  ad_campaign
}

// Estado del cobro en MP (independiente del estado de negocio del recurso).
enum PaymentStatus {
  pending
  approved
  rejected
  refunded
}
```

### Identidad / perfil

`Device` es la **única entidad raíz** del usuario. No hay tabla `DeviceProfile`: el tipo TS `DeviceProfile` que consume el front se serializa en el repositorio desde `Device` + sus filas `ProfileField`.

```prisma
model Device {
  id        String   @id @default(cuid())
  // identificador público estable que viaja al cliente (deep-links, QR payload).
  publicId  String   @unique
  createdAt DateTime @default(now())

  // Consentimientos: ISO string en el dominio ("aceptado el ..."), acá DateTime.
  consentTerms    DateTime?
  consentNews     DateTime?
  consentSponsors DateTime?

  fields         ProfileField[]
  registrations  Registration[]
  orders         TicketOrder[]
  membership     Membership?
  tickets        Ticket[]
  favorites      PhotoFavorite[]
  downloads      PhotoDownload[]
  applications   Application[]
  analytics      AnalyticsEvent[]
  payments       Payment[]

  @@index([createdAt])
}

enum ProfileFieldKey {
  firstName
  lastName
  email
  profession
  phone
  dni
  city
  instagram
}

// Captura progresiva de PII. Un valor por (device, key); upsert con re-captura.
// `source` = la acción que lo capturó (oro para segmentación + trazabilidad, PRD §7).
model ProfileField {
  id         String          @id @default(cuid())
  deviceId   String
  key        ProfileFieldKey
  value      String
  source     String
  capturedAt DateTime        @default(now())

  device Device @relation(fields: [deviceId], references: [id], onDelete: Cascade)

  @@unique([deviceId, key]) // un valor vigente por campo
  @@index([key, value])     // segmentación: "todos los de Córdoba", "este email"
}
```

> **PII aislada:** `email`, `phone`, `dni` viven en `ProfileField` como filas, **nunca como columnas planas de `Device`**. Eso permite (a) borrar/exportar por persona de un saco, (b) cifrar en reposo a nivel columna `value` si se decide, y (c) auditar el `source` (trazabilidad de origen de cada dato). 🔶 [DECISIÓN ABIERTA] cifrado de PII en reposo (pgcrypto / cifrado app-side) — depende de cuánto DNI/teléfono real se capture y del marco legal (Ley 25.326 de Datos Personales, Argentina).

### Eventos, bloques e inscripciones

```prisma
model Event {
  id          String    @id // ej. "ev-principal-2026"
  slug        String    @unique // ruta /eventos/:slug
  type        EventType
  title       String
  subtitle    String?
  dateLabel   String    // texto mostrable ("19 y 20 de septiembre")
  startDate   DateTime  // ISO real, para ordenar/filtrar
  timeLabel   String?
  venue       String
  address     String
  mapsUrl     String
  description String    @db.Text
  cover       String
  price       Int?      // centavos o pesos enteros; ver nota de dinero §6
  past        Boolean   @default(false)
  // Gate de acceso a nivel EVENTO (canon 17). El bloque NO tiene flag propio:
  // hereda este. `register(eventId, blockId)` chequea el socioOnly del evento.
  socioOnly   Boolean   @default(false)

  blocks        EventBlock[]
  registrations Registration[]
  sponsors      EventSponsor[]   // sponsorIds[] del dominio → N:M
  convocatorias Convocatoria[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([type, startDate])
  @@index([past])
}

// EventItem.sponsorIds[] → tabla puente (un evento luce varios sponsors).
model EventSponsor {
  eventId   String
  sponsorId String

  event   Event   @relation(fields: [eventId], references: [id], onDelete: Cascade)
  sponsor Sponsor @relation(fields: [sponsorId], references: [id], onDelete: Cascade)

  @@id([eventId, sponsorId])
}

model EventBlock {
  id          String  @id
  eventId     String
  title       String
  kind        String  // 'Charla' | 'Masterclass' | 'Desfile' | 'Workshop' ...
  day         String  // etiqueta '19/09'
  start       String  // '17:00'
  end         String
  room        String
  capacity    Int
  // NO hay flag socioOnly acá (canon 17): el gate es a nivel Event y el bloque lo hereda.
  // seedTaken: inscriptos "de arranque" que NO son filas Registration.
  // Sigue existiendo como baseline; el cupo real = seedTaken + confirmadas.
  seedTaken   Int     @default(0)
  speakers    String[] // array de Postgres; lista corta, no amerita tabla
  description String?  @db.Text

  event         Event          @relation(fields: [eventId], references: [id], onDelete: Cascade)
  registrations Registration[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([eventId])
}

model Registration {
  id        String             @id // "reg_..."
  deviceId  String
  eventId   String
  blockId   String?
  status    RegistrationStatus @default(confirmada)
  ts        DateTime           @default(now())

  device Device      @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  event  Event       @relation(fields: [eventId], references: [id], onDelete: Cascade)
  block  EventBlock? @relation(fields: [blockId], references: [id], onDelete: Cascade)

  // Una persona no se inscribe dos veces al mismo (evento, bloque).
  // blockId null = inscripción a evento sin bloque.
  @@unique([deviceId, eventId, blockId])
  @@index([blockId, status]) // contar cupo de un bloque
  @@index([eventId, status])
}
```

#### Cómo se cuenta el cupo (resolución del `seedTaken`)

Hoy `LocalDataStore.blockAvailability` hace:

```ts
const taken = Math.min(block.capacity, block.seedTaken + localConfirmadas)
```

En el backend el equivalente exacto, **contando solo `status = confirmada`**:

```ts
const confirmadas = await prisma.registration.count({
  where: { blockId, status: 'confirmada' },
})
const taken = Math.min(block.capacity, block.seedTaken + confirmadas)
const left = Math.max(0, block.capacity - taken)
const full = left === 0
```

- `seedTaken` se conserva como **baseline histórico** (inscriptos que llegaron por otro canal / arranque). No lo eliminamos: si lo bajáramos a 0 al migrar, los bloques con cupo "pre-vendido" mostrarían disponibilidad falsa.
- **Condición de carrera del cupo:** el `count` + `insert` debe ir dentro de una transacción con bloqueo, o validar post-insert. Patrón recomendado:

```ts
await prisma.$transaction(async (tx) => {
  const block = await tx.eventBlock.findUniqueOrThrow({ where: { id: blockId } })
  const confirmadas = await tx.registration.count({ where: { blockId, status: 'confirmada' } })
  if (block.seedTaken + confirmadas >= block.capacity) throw new BlockFullError()
  await tx.registration.create({ data: { id, deviceId, eventId, blockId, status: 'confirmada' } })
})
```

> Para volumen de evento (cupos chicos, picos en apertura de inscripción) esto alcanza. Si un bloque tipo masterclass se vuelve hot, subir a `SELECT ... FOR UPDATE` sobre la fila del bloque (`tx.$queryRaw`) o un contador `confirmedCount` con `UPDATE ... WHERE confirmedCount < capacity` atómico. 🔶 [DECISIÓN ABIERTA] solo si aparece contención real.

### Entradas, planes y órdenes

```prisma
model TicketPlan {
  id            String   @id // PlanId: "sab-general" | "sab-night-vip" | "combo-vip" | "dom-general" | "dom-sunset-vip"
  name          String
  tagline       String
  price         Int?     // null = precio pendiente de confirmar 🔶
  serviceCharge Int      @default(0) // cargo por servicio por unidad
  mpLink        String?  // link MP (preventa) o null
  perks         String[]
  featured      Boolean  @default(false)
  day           PlanDay
  kind          PlanKind
  preventa      Boolean  @default(false)

  orders TicketOrder[]

  updatedAt DateTime @updatedAt
}

model TicketOrder {
  id         String      @id // "ord_..."
  deviceId   String?     // quién compró (puede ser anónimo al iniciar)
  planId     String
  status     OrderStatus @default(iniciada)
  qty        Int         @default(1)
  // total congelado al crear = (price + serviceCharge) * qty. No recalcular.
  total      Int
  buyerName  String?
  buyerEmail String?
  ts         DateTime @default(now())

  // La plomería de Mercado Pago (preferencia, id de pago, raw del webhook) NO vive
  // acá: vive en la tabla polimórfica `Payment` (kind='ticket_order', resourceId=id).
  // Esta tabla solo conserva su propio enum de estado (OrderStatus), que el webhook
  // actualiza al confirmar/rechazar. Ver §1 (Pagos) y canon 7.

  device  Device?    @relation(fields: [deviceId], references: [id], onDelete: SetNull)
  plan    TicketPlan @relation(fields: [planId], references: [id])
  tickets Ticket[]   // QRs de acreditación tras confirmar (uno por jornada/holder)

  @@index([status, ts])
  @@index([planId])
  @@index([buyerEmail])
}
```

**Máquina de estados de `TicketOrder`** (transiciones válidas; cualquier otra es error 409):

```
iniciada ──(usuario va a pagar)──▶ redirigida_mp ──(webhook approved)──▶ confirmada
   │                                     │
   └──────────(timeout/abandono)─────────┴──────────────▶ cancelada
```

- `iniciada`: orden creada, total congelado, sin pago.
- `redirigida_mp`: se creó la preferencia y se mandó al usuario a MP (`POST /api/v1/orders/:id/redirected`). El `mpPreferenceId` se guarda en la fila `Payment` (kind='ticket_order'), no en la orden.
- `confirmada`: la **fuente de verdad es el webhook de MP** (`POST /api/v1/webhooks/mp` con `status=approved`), no el redirect de vuelta. Al confirmar se emite el `Ticket` (QR). La idempotencia del webhook vive en la tabla `Payment` (`mpPaymentId @unique`), no acá. Ver §1 (Pagos) y doc 07.
- `cancelada`: pago rechazado, expirado o abandono.

> Hoy `setOrderStatus` acepta cualquier transición (demo). El `RemoteDataStore` debe rechazar saltos inválidos. El paso a `confirmada` solo lo dispara el webhook server-side; el cliente nunca puede auto-confirmarse.

```prisma
// Acreditación: el ESTADO de uso del QR en la puerta. El QR en sí NO es esta fila:
// es un JWT firmado con ACCREDITATION_TOKEN_SECRET (payload: deviceId, ticketId,
// jornada; exp = fin del evento). Esta fila guarda el estado server-side para poder
// validar "un solo uso por jornada". Detalle completo en doc 13 (acreditación-en-puerta).
model Ticket {
  id          String   @id @default(cuid())
  deviceId    String
  // null si es entrada GRATIS (emitida desde una Registration confirmada, sin pago).
  orderId     String?
  jornada     String   // a qué jornada habilita ('sabado' | 'domingo' | ...)
  // jti del JWT de acreditación: ata esta fila al token concreto que viaja en el QR.
  qrToken     String   @unique
  checkedIn   Boolean  @default(false)
  checkedInAt DateTime?
  createdAt   DateTime @default(now())

  device Device       @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  order  TicketOrder? @relation(fields: [orderId], references: [id], onDelete: Cascade)

  // Un solo ticket por (device, jornada): garantiza "una entrada por jornada".
  @@unique([deviceId, jornada])
  @@index([checkedIn])
}
```

> `Ticket` es **nuevo** (no existe en el dominio Fase 0, donde el QR es mock). Lo metemos acá porque el objetivo declarado es "que el QR de acreditación sirva en la puerta".
>
> **El QR es un JWT, no un id opaco.** El contenido del QR es un `accreditationToken` (JWT firmado con `ACCREDITATION_TOKEN_SECRET`); esta fila solo guarda el `jti` (`qrToken`) + el estado de check-in para validar el uso. En puerta **online** se valida contra esta tabla (`POST /api/v1/admin/checkin`, rol STAFF); **offline** se valida la firma del JWT y se sincroniza el check-in después. Toda la mecánica vive en doc 13.
>
> **Dos disparadores de emisión** (canon 12), ambos terminan en `Ticket` + JWT:
> - **(a) entrada GRATIS:** una `Registration` confirmada emite token + `Ticket` con `orderId = null`.
> - **(b) entrada VIP PAGA:** el webhook MP `approved` sobre el `TicketOrder` emite token + `Ticket` con `orderId` poblado.
>
> 🔶 [DECISIÓN ABIERTA] si una orden de `qty=N` genera **un** QR para N personas o **N** tickets individuales. El modelo ya es N:1 con la orden (`orderId` nullable, FK→TicketOrder); si es N personas se agrega `holderName` a `Ticket`.

### Catálogo (expositores)

```prisma
model CatalogProfile {
  id            String   @id // "cat-..."
  slug          String   @unique
  name          String
  role          String   // 'Diseñadora' | 'Artista' | 'Influencer' | 'Marca'
  platform      String   // 'Moda' | 'Belleza' | 'Arte'
  city          String
  bio           String   @db.Text
  photo         String
  instagram     String?
  verified      Boolean  @default(false)
  participatesIn String[] // ids/labels de eventos en los que participa

  portfolio PortfolioPiece[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([role])
  @@index([platform])
}

model PortfolioPiece {
  id        String  @id @default(cuid())
  profileId String
  image     String
  title     String
  caption   String?
  order     Int     @default(0) // preserva orden del array original

  profile CatalogProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@index([profileId, order])
}
```

### Fotos (galerías, favoritos, descargas)

```prisma
model Gallery {
  id         String   @id // "gal-..."
  slug       String   @unique
  title      String
  eventLabel String
  date       String   // etiqueta mostrable
  cover      String
  sponsorId  String   // cada galería patrocinada por un sponsor (1 sponsor : N galerías)

  // onDelete: Restrict (canon 16): no se puede borrar un Sponsor que tiene galerías.
  // Hay que reasignar o archivar primero. Borrado seguro de datos reales.
  sponsor Sponsor @relation(fields: [sponsorId], references: [id], onDelete: Restrict)
  photos  Photo[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([sponsorId])
}

model Photo {
  id        String @id // "ph-..."
  galleryId String
  src       String
  alt       String
  order     Int    @default(0)

  gallery   Gallery         @relation(fields: [galleryId], references: [id], onDelete: Cascade)
  favorites PhotoFavorite[]
  downloads PhotoDownload[]

  @@index([galleryId, order])
}

// Favorito = (device, photo). Hoy es un array de photoIds en localStorage.
model PhotoFavorite {
  deviceId String
  photoId  String
  ts       DateTime @default(now())

  device Device @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  photo  Photo  @relation(fields: [photoId], references: [id], onDelete: Cascade)

  @@id([deviceId, photoId]) // toggle = upsert/delete
}

// Descarga registrada: alimenta el valor para el sponsor (impresiones de marca).
model PhotoDownload {
  id        String   @id @default(cuid())
  deviceId  String
  photoId   String
  galleryId String
  sponsorId String // desnormalizado: a qué sponsor "le suma" esta descarga
  ts        DateTime @default(now())

  device Device @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  photo  Photo  @relation(fields: [photoId], references: [id], onDelete: Cascade)

  @@index([sponsorId, ts]) // reporte de descargas por sponsor
  @@index([galleryId])
}
```

> `sponsorId` en `PhotoDownload` está desnormalizado a propósito: es el `sponsorId` de la galería al momento de la descarga (igual que hoy lo arma `recordDownload`). Si la galería cambia de sponsor después, el reporte histórico no se distorsiona.

### Sponsors y publicidad

```prisma
model Sponsor {
  id        String       @id // "sp-..."
  name      String
  industry  String
  level     SponsorLevel
  exclusive Boolean      @default(false) // exclusividad de rubro (D20)
  tagline   String

  creatives  SponsorCreative[]
  galleries  Gallery[]
  events     EventSponsor[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([level])
  @@index([industry]) // chequeo de exclusividad de rubro
}

// Sponsor.creatives[] → tabla hija. Un sponsor puede tener varios creativos,
// uno por slot (o varios). getCreative(slot, index) rota sobre estos.
model SponsorCreative {
  id        String  @id @default(cuid())
  sponsorId String
  slot      AdSlot
  headline  String
  sub       String?
  cta       String?
  order     Int     @default(0)

  sponsor Sponsor @relation(fields: [sponsorId], references: [id], onDelete: Cascade)

  @@index([slot, sponsorId])
}

// Publicidad autogestionada (self-serve): una marca compra un slot por X horas.
model AdCampaign {
  id        String         @id // "camp_..."
  slot      AdSlot
  brand     String
  headline  String
  cta       String?
  tagline   String?
  status    CampaignStatus @default(pendiente_pago)

  // Vigencia: hoy el dominio guarda `hours` (cuántas horas se compró). Eso NO
  // alcanza para saber si está activa AHORA. Materializamos la ventana:
  hours     Int       // lo comprado (se conserva por trazabilidad/factura)
  startsAt  DateTime? // se setea al confirmar el pago
  expiresAt DateTime? // = startsAt + hours

  total     Int       // monto congelado
  // La plomería MP NO vive acá (canon 7): vive en `Payment` (kind='ad_campaign',
  // resourceId=id). El webhook actualiza `status` (CampaignStatus), su máquina propia.
  ts        DateTime  @default(now()) // creación

  // Una sola campaña 'activa' por slot a la vez: constraint que respalda el patrón
  // transaccional de slot libre (canon 18). El índice parcial garantiza unicidad.
  @@index([slot, status, expiresAt]) // "campaña activa para este slot, ahora"
}
```

> **Slot self-serve (canon 18):** "una campaña `activa` por slot a la vez" se garantiza con un índice único parcial en SQL crudo (Prisma no expresa unique parciales): `CREATE UNIQUE INDEX one_active_per_slot ON "AdCampaign" (slot) WHERE status = 'activa';`. La activación corre en la misma transacción que verifica el slot libre.

#### Resolución de `getActiveCampaign(slot)`

Hoy la demo devuelve **la última comprada** para el slot (`forSlot[forSlot.length - 1]`), sin mirar las horas. En real:

```ts
getActiveCampaign(slot: AdSlot) {
  const now = new Date()
  return prisma.adCampaign.findFirst({
    where: { slot, status: 'activa', startsAt: { lte: now }, expiresAt: { gt: now } },
    orderBy: { startsAt: 'desc' },
  })
}
```

- `getActiveCampaign` filtra `status='activa'` **AND** `now` entre `startsAt`/`expiresAt` (canon 8). Nunca un flag booleano `paid` ni `activeFrom/activeTo`.
- `hours` se queda (es lo que el cliente pagó / lo que va en la factura), pero la verdad de "está al aire" la dan `startsAt`/`expiresAt`.
- **Solapamiento resuelto (canon 18):** un slot = un anunciante a la vez. La compra que pisaría una campaña `activa` se rechaza (constraint único parcial + transacción). No hay rotación ni cola en v1.
- `startsAt` arranca cuando MP confirma el pago (no al crear la orden), por eso es nullable.

### Contenido (videos)

```prisma
model ContentItem {
  id          String   @id // "ct-..."
  type        String   @default("video") // solo 'video' hoy; dejar abierto
  title       String
  description String   @db.Text
  youtubeId   String
  duration    String?
  platform    String?
  sponsorId   String?
  publishedAt DateTime
  socioOnly   Boolean  @default(false) // exclusivo Socio CCM

  sponsor Sponsor? @relation("ContentSponsor", fields: [sponsorId], references: [id], onDelete: SetNull)

  @@index([publishedAt])
  @@index([socioOnly])
}
```

> Agregar la relación inversa en `Sponsor`: `contents ContentItem[] @relation("ContentSponsor")`.

### Membresía (Socio CCM)

```prisma
model Membership {
  // PK propia `id` (canon 7) para que Payment.resourceId pueda referenciarla.
  id       String         @id @default(cuid())
  // Una membresía por dispositivo → deviceId es FK + único.
  deviceId String         @unique
  tier     MembershipTier @default(free)
  since    DateTime?      // alta de la membresía paga (null en free)
  paid     Int            @default(0) // total abonado, alimenta ingresos del panel
  expiresAt DateTime?     // 🔶 si la membresía es anual/por-edición vs perpetua

  // La plomería MP NO vive acá (canon 7): vive en `Payment` (kind='membership',
  // resourceId=id). Membership conserva su propia máquina de estado (tier free→socio),
  // que el webhook eleva a 'socio' solo con pago 'approved'.

  device Device @relation(fields: [deviceId], references: [id], onDelete: Cascade)

  @@index([tier])
}
```

> Hoy `becomeSocio(paid)` setea `tier=socio` + `since` + `paid`. Mismo shape. **El tier no se puede subir a `socio` sin un pago confirmado por webhook** (igual que las órdenes). 🔶 [DECISIÓN ABIERTA] vigencia: ¿la membresía es perpetua, por edición (caduca post-evento) o anual? De eso depende `expiresAt` y si `isSocio()` debe chequear fecha. 🔶 [DECISIÓN ABIERTA] ¿"niveles de suscripción" (la memoria del proyecto menciona niveles) implica más de un tier pago? Si sí, `MembershipTier` crece y conviene una tabla `MembershipPlan`.

### Pagos (Mercado Pago) — tabla polimórfica

Toda la plomería de cobro vive en UNA tabla `Payment` (canon 7). Los tres recursos cobrables (`TicketOrder`, `Membership`, `AdCampaign`) **no** llevan columnas MP: cada uno conserva su propio enum de estado de negocio, que el webhook (`POST /api/v1/webhooks/mp`) actualiza al confirmar/rechazar. El detalle del flujo MP está en doc 07.

```prisma
model Payment {
  id            String        @id @default(cuid())
  kind          PaymentKind   // ticket_order | membership | ad_campaign
  // id del recurso pagado (TicketOrder.id, Membership.id o AdCampaign.id).
  // Polimórfico: no hay FK formal, el repositorio resuelve por (kind, resourceId).
  resourceId    String
  deviceId      String?       // quién paga (puede faltar en compras anónimas iniciales)

  mpPreferenceId String?      // id de preferencia creada en MP
  mpPaymentId    String? @unique // id del pago real; idempotencia del webhook
  externalRef    String?      // external_reference que mandamos a MP para reconciliar
  amount         Int          // monto del cobro (unidad mínima; ver §3 dinero)
  status         PaymentStatus @default(pending)
  raw            Json?        // payload crudo del webhook, para auditoría/reproceso
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  device Device? @relation(fields: [deviceId], references: [id], onDelete: SetNull)

  @@index([kind, resourceId]) // resolver el pago de un recurso
  @@index([status])
  @@index([deviceId])
}
```

> **Por qué polimórfica y no 3 columnas en cada recurso:** centraliza la idempotencia del webhook (`mpPaymentId @unique` en un solo lugar), guarda el `raw` para reproceso/auditoría sin ensuciar las tablas de negocio, y deja a cada recurso con SU máquina de estados (`OrderStatus`, `tier`, `CampaignStatus`). El webhook hace, en una transacción: upsert del `Payment` por `mpPaymentId` + transición del recurso correspondiente. `resourceId` no tiene FK formal de Prisma (apunta a tres tablas distintas según `kind`); la integridad la garantiza el repositorio. Por eso `Membership` necesita PK propia `id` (canon 7): para que `resourceId` la pueda referenciar igual que a `TicketOrder` y `AdCampaign`.

### Convocatorias y postulaciones

```prisma
model Convocatoria {
  id       String   @id // "conv-..."
  slug     String   @unique
  title    String
  intro    String   @db.Text
  deadline DateTime
  eventId  String

  event  Event              @relation(fields: [eventId], references: [id])
  fields ConvocatoriaField[]
  applications Application[]

  @@index([eventId])
}

// Formulario dinámico de la convocatoria.
model ConvocatoriaField {
  id             String  @id @default(cuid())
  convocatoriaId String
  key            String  // clave del campo (matchea Application.data)
  label          String
  type           String  // 'text'|'textarea'|'select'|'url'|'tel'|'email'
  required       Boolean @default(false)
  options        String[] // para 'select'
  placeholder    String?
  help           String?
  // showIf: { key, equals } → condicional. Plano para no anidar JSON.
  showIfKey      String?
  showIfEquals   String?
  order          Int     @default(0)

  convocatoria Convocatoria @relation(fields: [convocatoriaId], references: [id], onDelete: Cascade)

  @@unique([convocatoriaId, key])
  @@index([convocatoriaId, order])
}

model Application {
  id             String            @id // "app_..."
  convocatoriaId String
  deviceId       String?           // quién postuló (puede faltar en seed importado)
  status         ApplicationStatus @default(preinscripta)
  // Respuestas del form dinámico. JSON: las claves dependen de la convocatoria,
  // no vale la pena una tabla EAV. Indexable con GIN si hace falta filtrar.
  data           Json
  fromSeed       Boolean           @default(false)
  ts             DateTime          @default(now())
  decidedAt      DateTime?

  convocatoria Convocatoria @relation(fields: [convocatoriaId], references: [id], onDelete: Cascade)
  device       Device?      @relation(fields: [deviceId], references: [id], onDelete: SetNull)

  @@index([convocatoriaId, status])
  @@index([status, ts])
}
```

> `data` queda como `Json` (no EAV) porque las claves las define cada convocatoria y la UI ya las renderiza desde `ConvocatoriaField`. `fromSeed` se conserva tal cual del dominio (distingue históricos importados de postulaciones reales). `decideApplication` solo permite `preinscripta → aceptada|rechazada` y setea `decidedAt`.

### Analytics (alto volumen)

```prisma
// Event bus first-party. Alimenta el dashboard en vivo y el export CSV.
// Esta es la tabla que más crece: una fila por cada acción trackeada.
model AnalyticsEvent {
  id       String   @id @default(cuid())
  // `event` usa la taxonomía canónica (doc 05): user_created, registration_created,
  // ticket_order_created, ticket_order_redirected_mp, ticket_order_confirmed,
  // membership_purchased, ad_impression, ad_click, profile_field_captured, etc.
  // Se ingiere por batch vía POST /api/v1/analytics.
  event    String
  deviceId String?
  payload  Json?    // shape libre por tipo de evento
  seed     Boolean  @default(false) // históricos importados (dashboard no nace vacío)
  ts       DateTime @default(now())

  device Device? @relation(fields: [deviceId], references: [id], onDelete: SetNull)

  // El índice clave: el dashboard agrupa por tipo de evento en ventanas de tiempo.
  @@index([event, ts])
  @@index([ts])
  @@index([deviceId])
}
```

**Tratamiento de alto volumen:**

- **Índices:** `(event, ts)` cubre el 90% de las queries del dashboard (conteo por tipo de evento en una ventana). `(ts)` para barridos temporales globales; `(deviceId)` para el journey de una persona.
- **`payload` como `Json` (jsonb):** suficiente para empezar. Si una métrica concreta se consulta seguido (p.ej. `payload->>'planId'`), se agrega un índice GIN parcial o se promueve esa clave a columna. No hacerlo preventivamente.
- **Retención / particionado:** 🔶 [DECISIÓN ABIERTA] política de retención. Recomendado: tabla particionada por rango de `ts` (mensual) usando `PARTITION BY RANGE` nativo de Postgres — Prisma no lo gestiona, se crea por migración SQL cruda (`Unsupported`/`prisma migrate` + SQL manual). Para el volumen de un evento de 2 días no es urgente, pero conviene dejarlo listo:
  - **Antes del evento:** la tabla cabe en una sola partición; no tocar nada.
  - **Si CCM se vuelve recurrente / multi-edición:** particionar por mes y archivar particiones viejas a almacenamiento frío (o a un agregado pre-computado para el dashboard).
- **Escritura desacoplada (opcional):** `track()` no debe bloquear la request del usuario. En Fase 1, insert directo está bien. Si el dashboard escala, mover a `fire-and-forget` + buffer/cola. 🔶 [DECISIÓN ABIERTA] solo si la latencia de escritura molesta.
- **Pre-agregados para el dashboard:** si el polling (TanStack Query) sobre `(event, ts)` se vuelve caro, materializar una tabla `AnalyticsDaily { date, event, count }` actualizada por trigger o job. No para el MVP.

### Admin (organizador)

```prisma
// Hoy el gate admin acepta cualquier clave (demo). En real, auth con rol.
model AdminUser {
  id        String    @id @default(cuid())
  email     String    @unique
  name      String?
  role      AdminRole @default(EDITOR) // enum AdminRole (canon 9)
  createdAt DateTime  @default(now())
  lastLogin DateTime?
}
```

> `role` es el enum `AdminRole { OWNER, EDITOR, STAFF, VIEWER }` (canon 9), nunca String ni el vocabulario viejo `organizer`/`staff_puerta`. **STAFF = personal de puerta**: solo escanea QR (`POST /api/v1/admin/checkin`), no ve plata ni edita catálogo. Auth passwordless coherente con la app (magic link / OTP por email, o PIN tipo Norte); el detalle y los secretos viven en doc 06 (auth) — que define `ADMIN_TOKEN_SECRET` separado del `DEVICE_TOKEN_SECRET` y del `ACCREDITATION_TOKEN_SECRET`.

---

## 2. Mapa de relaciones (resumen)

```
Device (id) ─1:N─▶ ProfileField               (PII por campo, con source)
       ├─1:N─▶ Registration ─N:1─▶ Event, EventBlock
       ├─1:N─▶ TicketOrder ─N:1─▶ TicketPlan ; ─1:N─▶ Ticket
       ├─1:1─▶ Membership
       ├─1:N─▶ Ticket  (orderId nullable: directo si la entrada es gratis)
       ├─1:N─▶ PhotoFavorite ─N:1─▶ Photo
       ├─1:N─▶ PhotoDownload ─N:1─▶ Photo
       ├─1:N─▶ Application ─N:1─▶ Convocatoria
       ├─1:N─▶ AnalyticsEvent
       └─1:N─▶ Payment

Payment (polimórfica) ─(kind, resourceId)─▶ TicketOrder | Membership | AdCampaign
        (toda la plomería MP; los recursos solo guardan su propio estado de negocio)

Event ─1:N─▶ EventBlock ─1:N─▶ Registration
      ─N:M─▶ Sponsor (vía EventSponsor)
      ─1:N─▶ Convocatoria ─1:N─▶ ConvocatoriaField / Application

Sponsor ─1:N─▶ SponsorCreative (por slot)
        ─1:N─▶ Gallery ─1:N─▶ Photo   (Gallery.sponsorId onDelete: Restrict)
        ─1:N─▶ ContentItem (opcional, sponsorId nullable)

AdCampaign  (self-serve, ligada a slot, no a Sponsor; arma un "sponsor virtual" al vuelo)
```

> **Nota sobre `AdCampaign` vs `Sponsor`:** en el dominio, `getCreative` arma un `Sponsor` sintético desde la campaña (`campaignSponsor`). No persistimos esa síntesis: `AdCampaign` es su propia tabla y el repositorio la adapta a la shape `{ sponsor, creative }` que espera la UI. Así no ensuciamos `Sponsor` con anunciantes self-serve.

---

## 3. Notas de migración (seed estático → filas reales)

El objetivo es que **el primer arranque del backend deje la DB en el estado que hoy ve la demo**, para que el frontend conmutado a `RemoteDataStore` se vea idéntico.

1. **Seed script (`prisma db seed`)** que importa los mismos datos de `src/data/seed/*` a filas reales:
   - Eventos, bloques, planes, sponsors, galerías, fotos, catálogo, contenidos, convocatorias y sus campos. Reusar los IDs/slugs canónicos de `src/data/ids.ts` (`ev-principal-2026`, `ccm-2026`, `sp-banco-distrito`, etc.) — **no regenerar IDs**, son contrato de deep-links.
   - `AnalyticsEvent` históricos: importar con `seed: true` (igual que hoy el flag `seed`) para que el dashboard no nazca vacío.
   - `Application` con `fromSeed: true` para las postulaciones de arranque.
2. **`seedTaken` se preserva tal cual** del seed de bloques. No se convierte en `Registration`. El cupo real = `seedTaken + count(confirmadas)`. (Ver §1.)
3. **`localStorage` del usuario NO migra.** Es estado por-dispositivo de la demo (perfil, favoritos, órdenes mock). Al pasar a real, cada dispositivo arranca limpio contra el backend; lo que el usuario tenía en localStorage de la demo se descarta. Es el comportamiento deseado: la demo era mock.
4. **Overlay → CRUD real.** El sistema de overlay (`created/edited/deleted` en localStorage del admin) desaparece: pasa a ser INSERT/UPDATE/DELETE directos contra Postgres. El seed equivale al estado base; las ediciones del admin ahora persisten en la DB para todos.
5. **Dinero (`price`, `serviceCharge`, `total`, `paid`, `Payment.amount`):** 🔶 [DECISIÓN ABIERTA] unidad. Hoy en el dominio son `number` sueltos. Recomendación: **enteros en la unidad mínima** (centavos de ARS) para evitar floats, o `Decimal @db.Money` si se prefiere legibilidad. Definir antes del seed para no migrar dos veces. El schema arriba usa `Int`; cambiar a `Decimal` es una migración de columna si se decide lo contrario.

6.5. **Borrado seguro (canon 16):** las entidades con datos reales (Event/EventBlock con Registrations u órdenes confirmadas; Sponsor con Galerías) **no se hard-deletean**. El CRUD admin: (a) bloquea con `409` si hay dependientes, o (b) archiva con soft-delete (campo `archivedAt`, a agregar en las tablas que lo necesiten). `Gallery.sponsorId` usa `onDelete: Restrict` (no se puede borrar un Sponsor con galerías). Esto reemplaza el `delete` libre de la demo.
6. **Precios reales pendientes:** varios `TicketPlan.price` están en `null` (precio a confirmar) y la membresía no tiene monto fijado. 🔶 [DECISIÓN ABIERTA] precios de entradas y de la membresía Socio CCM — los define Gastón/Alan. El schema soporta `price = null` sin romper.
7. **Cuenta de cobro MP, dominio y sponsors reales:** 🔶 [DECISIÓN ABIERTA] cuenta de Mercado Pago para los 3 flujos (entradas, membresía, publicidad), dominio productivo, y qué sponsors reales se cargan. No afectan el schema, sí el seed y la config.

---

## 4. Índices clave (checklist)

| Tabla | Índice | Para qué |
|---|---|---|
| `AnalyticsEvent` | `(event, ts)` | dashboard: conteo por tipo en ventana de tiempo |
| `Registration` | `(blockId, status)` | cupo de un bloque (count confirmadas) |
| `Registration` | `(deviceId, eventId, blockId)` unique | evitar doble inscripción |
| `TicketOrder` | `(status, ts)` | panel de órdenes / pendientes de confirmar |
| `Payment` | `mpPaymentId` unique | idempotencia del webhook MP (un solo lugar) |
| `Payment` | `(kind, resourceId)` | resolver el pago de un recurso |
| `AdCampaign` | `(slot, status, expiresAt)` | campaña activa para un slot AHORA |
| `AdCampaign` | unique parcial `(slot) WHERE status='activa'` | un anunciante activo por slot (canon 18) |
| `ProfileField` | `(key, value)` | segmentación (ciudad, email, profesión) |
| `PhotoDownload` | `(sponsorId, ts)` | valor entregado a cada sponsor |
| `Sponsor` | `(industry)` | exclusividad de rubro (D20) |
| `Ticket` | `qrToken` unique | validación en la puerta (jti del JWT) |
| `Ticket` | `(deviceId, jornada)` unique | una entrada por jornada |

---

## 5. Qué es nuevo respecto del dominio Fase 0

Tablas/columnas que no existen en `types.ts` y se agregan porque el backend real las necesita:

- **`Ticket`** — el estado de acreditación real (Fase 0 es mock). El QR es un JWT firmado con `ACCREDITATION_TOKEN_SECRET`; la fila guarda `jti` + check-in. Detalle en doc 13.
- **`AdminUser`** — auth de organizador con `role` enum `AdminRole` (Fase 0 acepta cualquier clave).
- **`AdCampaign.startsAt/expiresAt/status`** — vigencia real (Fase 0 solo tiene `hours`).
- **`Payment`** (polimórfica) — toda la integración Mercado Pago centralizada (canon 7); los recursos cobrables ya **no** llevan columnas MP propias.
- **`Membership.id`** — PK propia (antes el PK era `deviceId`), para que `Payment.resourceId` la referencie.
- **`EventSponsor`** — normalización de `EventItem.sponsorIds[]`.
- **Tablas hijas** (`SponsorCreative`, `PortfolioPiece`, `ConvocatoriaField`, `ProfileField`, `PhotoFavorite`, `PhotoDownload`) — normalización de arrays/records que el dominio tiene inline; el repositorio las re-arma a la shape que espera la UI.

> **Identidad:** `Device` reemplaza al `DeviceProfile` del dominio como única entidad raíz. El tipo TS `DeviceProfile` del front se serializa desde `Device` + `ProfileField` en el repositorio; no hay tabla `DeviceProfile`.

Todo lo demás es traducción directa de `src/data/types.ts`.
