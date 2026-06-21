# Objetivos, alcance y criterios de éxito

Por qué CCM necesita un backend real, qué tiene que habilitar para la 14ª edición (19–20/09/2026, Hotel Quinto Centenario, Córdoba) y dónde trazamos la línea entre la **v1 que lanza para el evento** y lo que queda **para después**. Este doc fija el norte; los docs siguientes (modelo de datos, API, auth, pagos, deploy) bajan al detalle.

---

## 1. Por qué backend, y por qué ahora

Hoy CCM es 100% frontend (Fase 0): seed estático + `localStorage`, detrás de la interfaz `DataStore` (`src/data/store/DataStore.ts`), con "tiempo real" simulado por el `storage` event entre pestañas del **mismo navegador** (`src/lib/bus.ts`). Eso alcanza para demostrar el producto, pero rompe en cuanto el evento es real, por tres límites estructurales que ningún truco de frontend resuelve:

1. **Los datos viven por dispositivo.** Un socio que paga en su teléfono no existe en el panel del organizador, que corre en otra máquina. La propia `DECISIONS.md` (D3) lo asume: _"los datos viven por dispositivo (localStorage). No hay sincronización entre teléfonos."_ Para un evento con miles de asistentes, esto es inviable.
2. **No hay fuente de verdad compartida.** Cupos de bloques (`blockAvailability`), órdenes de entrada, postulaciones, campañas publicitarias: cada navegador tiene su propia copia divergente. No se puede cerrar cupo, ni cobrar de verdad, ni acreditar en la puerta.
3. **No hay confianza/integridad.** El QR de acreditación es un token por dispositivo con checksum simple (`qrToken()` en `lib/identity.ts`, D15), falsificable; el gate del admin acepta `ccm2026` para cualquiera (`src/config/index.ts`, D16); y los pagos son links placeholder de Mercado Pago (D9, D21) que no confirman nada.

El backend convierte la demo en **plataforma operativa del evento**: un servidor con PostgreSQL que es la única fuente de verdad, al que todos los dispositivos y el panel del organizador se conectan.

La costura ya está puesta: **toda la UI lee y escribe SOLO a través de `DataStore`** (singleton en `src/data/store/index.ts`). La migración consiste en implementar un `RemoteDataStore` contra **esa misma interfaz**, conmutable por env (`VITE_API_URL`) con fallback al `LocalDataStore`, sin tocar pantallas. Eso baja el riesgo del cambio: el backend no reescribe el frontend, lo enchufa.

---

## 2. Objetivos concretos

Lo que el backend tiene que **habilitar** (no cómo — eso va en los docs de modelo/API):

### O1 — Datos compartidos y persistentes (multi-dispositivo)
Una sola base de datos como fuente de verdad. Lo que pasa en un teléfono se ve en el panel del organizador y en cualquier otro dispositivo, sin importar navegador ni máquina. Reemplaza el "tiempo real por pestaña" del `storage` event por estado real compartido.

- Aplica a todo el dominio: `EventItem`, `EventBlock`, `Registration`, `TicketOrder`, `Membership`, `CatalogProfile`, `Gallery`, `Sponsor`, `AdCampaign`, `Application`, `AnalyticsEvent`, `DeviceProfile`.
- **Cupos reales**: `blockAvailability(blockId)` deja de sumar `seedTaken + locales` y pasa a contar inscripciones reales en la DB, con control de concurrencia para no sobrevender un bloque (`capacity`).

### O2 — Acreditación por QR que sirve en la puerta
El QR de cada asistente tiene que ser **verificable por el servidor** y de un solo uso por jornada en la entrada del Hotel Quinto Centenario. Hoy el token es local y falsificable; en v1 lo emite y valida el backend (firma/token contra DB), y el dispositivo de puerta (teléfono del staff con la PWA en modo acreditación) consulta al API: _válido / ya usado / desconocido_.

- Soporta el flujo real del 19–20/09: cola en la puerta, escaneo rápido, sin conexión a internet caída → ver O7 y no-objetivos.
- Distingue acreditación de **entrada gratuita con inscripción** (Sábado/Domingo Primera Pasada $0, D21) vs **entrada VIP pagada** (Night/Sunset/Combo).
- 🔶 **[DECISIÓN ABIERTA]** ¿el QR acredita por jornada (sábado / domingo) o por entrada VIP comprada? ¿Un QR por persona o uno por orden de varias entradas (`TicketOrder.qty`)? Definirlo cambia el modelo de acreditación. (Gastón/operación de puerta.)

### O3 — Pagos reales (los 3 flujos)
Los tres flujos que hoy son mock con QR placeholder pasan a Mercado Pago real, con confirmación server-side por **webhook** (no por el redirect del cliente, que es falsificable):

| Flujo | Hoy (mock) | v1 (real) |
|---|---|---|
| **Entradas** (`TicketOrder`) | `iniciada → redirigida_mp`, link placeholder en pestaña nueva (D8/D9) | preferencia MP por orden; webhook marca `confirmada`; recién ahí se emite QR de acceso |
| **Membresía Socio CCM** (`becomeSocio`) | `Membership.paid` se setea local | cobro MP; webhook activa `tier: 'socio'` y desbloquea contenido/eventos `socioOnly` |
| **Publicidad self-serve** (`AdCampaign`) | se crea y entra "en vivo" sin cobrar | cobro MP por `hours`; la campaña entra al slot recién confirmada |

- Idempotencia: un webhook que llega dos veces no duplica la confirmación ni el QR.
- 🔶 **[DECISIÓN ABIERTA]** Cuenta de cobro de Mercado Pago (¿de Gastón / CCM?), credenciales productivas, y si las entradas siguen vendiéndose por **Tikealo** (fuente actual de precios, D21) o migran al checkout propio. Si Tikealo sigue siendo el canal de venta, el rol del backend cambia (acreditación + panel, no checkout). **Esta decisión es la de mayor impacto en alcance.**

### O4 — Panel del organizador con datos reales en vivo
El admin (`/admin`, gate hoy `ccm2026`) muestra métricas y CRUD sobre los datos **reales** de todos los dispositivos, actualizándose en vivo durante el evento:

- Inscriptos, inscripciones por bloque, cupos restantes, órdenes y recaudación por flujo, descargas de fotos, postulaciones, impresiones/clicks de avisos.
- CRUD real de eventos, bloques, sponsors, galerías, contenidos, planes (precio/`mpLink`), y **decisión de postulaciones** (`decideApplication`) que el postulante ve reflejada.
- "Tiempo real" del dashboard: arrancamos con **polling vía TanStack Query** (decisión fijada); SSE/WebSocket queda como mejora post-evento.
- 🔶 **[DECISIÓN ABIERTA]** ¿Cuántos organizadores y con qué roles? (p. ej. `owner` Gastón, `staff` puerta solo-acreditación, `editor` de contenidos.) Mínimo para v1: un rol `admin` real con login passwordless.

### O5 — Captura de leads / CRM persistente
La captura progresiva de `DeviceProfile.fields` (con `source` por campo — _"oro para segmentación"_, ver `types.ts`) es el activo comercial del evento (alianza Xnod×CCM: data de ticketing, leads para sponsors). En v1 esos perfiles + consentimientos (`consents.terms/news/sponsors`) **persisten en el servidor**, segmentables y exportables (CSV), atados a las acciones que los originaron vía el bus de `AnalyticsEvent`.

- Esto es PII sensible (DNI, email, teléfono): ver O6 y el doc de auth/seguridad. La base legal de cada uso depende del consentimiento capturado.
- 🔶 **[DECISIÓN ABIERTA]** Qué se le entrega/expone a sponsors (¿agregados? ¿leads con consentimiento `sponsors: true`?) y bajo qué acuerdo. Es decisión comercial de Gastón con implicancia legal directa.

### O6 — Identidad persistente y portable
Hoy identidad = `deviceId` sin contraseña (`lib/identity.ts`). En v1 se mantiene la **filosofía passwordless** (coherente con la app y con los patrones de Alan tipo Norte/PIN, decisión fijada), pero el perfil deja de morir con el navegador: se puede recuperar la identidad/QR en otro dispositivo (p. ej. por email/código), sin contraseña.

- 🔶 **[DECISIÓN ABIERTA]** Mecanismo de recuperación: ¿magic link por email? ¿código a WhatsApp? Define qué dato de contacto es obligatorio capturar antes de comprar.

### O7 — Operación robusta el día del evento
El backend tiene que aguantar el pico de los días 19–20/09 (registros, escaneos en puerta, compras de última hora) y degradar con gracia ante mala conexión en el venue. El `RemoteDataStore` mantiene el fallback a estado local para lecturas, y la acreditación tolera reconexión.

---

## 3. Alcance v1 (lo mínimo para lanzar el evento)

Criterio de corte: **entra en v1 todo lo que sin backend rompe la operación del evento real**. Lo demás espera.

### Entra en v1

- **Infra base.** Node + TypeScript + Express + PostgreSQL + Prisma en Railway (stack fijado, mismo que Norte/romi-alan/myalquiler). Migraciones Prisma. CORS para el frontend de GitHub Pages.
- **`RemoteDataStore` conmutable.** Implementa la interfaz `DataStore` completa contra el API; `store` se elige por `VITE_API_URL` con fallback a `LocalDataStore`. **Cero cambios en pantallas.**
- **Identidad + auth passwordless** (O6): alta/recuperación de `DeviceProfile`, persistencia de `fields` + `consents`.
- **Auth de organizador real** (O4): reemplaza `ccm2026`. Rol `admin` mínimo, sesión, gate server-side de los endpoints de admin.
- **Eventos / bloques / inscripciones** (O1): CRUD + `register`/`cancelRegistration` + `blockAvailability` con **cupo atómico** (no sobrevender).
- **Pagos reales** (O3) para los **3 flujos** con webhook MP idempotente y transición de estados server-side. *(Si O3 resuelve "Tikealo sigue", esto se reduce a registrar la venta externa + acreditar.)*
- **Acreditación por QR** (O2): emisión firmada por servidor + endpoint de validación para puerta (idempotente, un-uso).
- **Panel en vivo** (O4) con polling TanStack Query sobre datos reales + CRUD de las entidades del evento.
- **Postulaciones** (`submitApplication` / `getApplications` / `decideApplication`) persistentes — relevante porque la `deadline` de las convocatorias cae **antes** del evento.
- **Almacenamiento de imágenes subidas** en object storage S3-compatible (Cloudflare R2 o DO Spaces, fijado) para galerías de fotos y logos/portfolios cargados desde admin. *(El seed editorial actual en `public/img/` puede seguir servido como estático.)*
- **Analytics persistente** (`track`/`getAnalytics`) como event bus first-party que alimenta el panel y el export CSV (`user_created`, `registration_created`, `ticket_order_*`, `membership_purchased`, `ad_impression/click`, `photo_download`, `application_submitted`).
- **Backup de la DB** antes y durante el evento.

### MÁS ADELANTE (post-lanzamiento)

- Tiempo real por **SSE/WebSocket** (reemplaza el polling del panel).
- **Roles granulares** de organizador (`staff` puerta, `editor` contenidos) más allá del `admin` único.
- **Self-serve publicitario completo** (rotación/segmentación de slots, reporting por campaña al anunciante).
- Vistas avanzadas de **CRM/segmentación** y entrega automatizada a sponsors (depende de O5 / decisión legal).
- Módulo **EN VIVO / streaming** (D13, hoy fuera de alcance) y `/agenda` standalone.
- **Prerender SSR** de rutas públicas para mejorar LCP en frío (D19) y/o mover el frontend fuera de GitHub Pages.
- **Notificaciones** (Web Push / WhatsApp): recordatorio de bloque, confirmación de pago, QR a mano.
- Recuperación de identidad multi-canal y portabilidad avanzada de perfil.

---

## 4. No-objetivos de v1

Explícito para no gold-platear contra una fecha dura:

- **NO** rehacer ni rediseñar el frontend. La interfaz `DataStore` se respeta tal cual; si un método no encaja con el backend, se ajusta el doc de API, no las pantallas.
- **NO** sacar el frontend de GitHub Pages. Sigue estático y se conecta por `VITE_API_URL` (decisión fijada). Mover el front es _MÁS ADELANTE_.
- **NO** construir checkout de pagos propio si Tikealo sigue siendo el canal de venta (pendiente O3). No asumir uno u otro hasta que Gastón decida.
- **NO** entrega de datos a sponsors hasta que haya acuerdo comercial + base legal (O5).
- **NO** streaming / EN VIVO (D13).
- **NO** app nativa iOS/Android: sigue siendo PWA.
- **NO** SSE/WebSocket en v1 (polling alcanza para el panel).
- **NO** multi-evento / multi-edición genérico. v1 es para **CCM 2026**; generalizar a futuras ediciones es deuda intencional.
- **NO** roles de organizador granulares (un `admin` real alcanza).
- **NO** soporte offline-first de escritura en la puerta más allá de tolerar reconexión (acreditación pide red).

---

## 5. Criterios de éxito (medibles)

El backend está listo cuando, **antes del 19/09/2026**, se cumple:

1. **Multi-dispositivo verificable (O1).** Una acción en el teléfono A (inscribirse, comprar, postularse) es visible en el panel del organizador en la máquina B en **< 10 s** (intervalo de polling), sin recargar manualmente. Sin compartir navegador.
2. **Cupos sin sobreventa (O1).** Carga de prueba concurrente sobre un bloque con `capacity = N` → exactamente `N` inscripciones confirmadas, **0 sobreventas**.
3. **Pago → estado real (O3).** Un pago de prueba en MP sandbox dispara webhook que deja la `TicketOrder` en `confirmada` (o la `Membership` en `socio`) **server-side**, y el QR de acceso se emite **solo** tras la confirmación. Webhook duplicado → **sin** doble confirmación.
4. **QR de puerta funcional (O2).** En simulacro de acreditación: un QR válido se acredita una vez (**< 2 s** de respuesta), un segundo intento del mismo QR responde "ya usado", un QR inventado responde "inválido".
5. **Panel con datos reales (O4).** El dashboard muestra inscriptos / inscripciones por bloque / órdenes / recaudación por flujo / postulaciones tomados de la DB real (no seed), y el export CSV de leads descarga `DeviceProfile` reales con su `source`.
6. **Auth de organizador real (O4).** `ccm2026` ya no funciona; el acceso al panel exige login passwordless válido y los endpoints de admin rechazan requests sin sesión.
7. **Migración sin regresión (costura).** Con `VITE_API_URL` apuntando al backend, **todas** las pantallas funcionan igual que en la demo; con la env vacía, vuelve a `LocalDataStore`. Cero cambios en componentes de UI.
8. **Resiliencia operativa (O7).** Prueba de carga al pico estimado del evento sin caídas; corte de red simulado en puerta → reconexión sin perder acreditaciones confirmadas. Backup de DB restaurable.
9. **PII protegida (O5).** Datos sensibles (DNI, email, teléfono) cifrados en tránsito (HTTPS) y con acceso restringido por auth; export de leads solo para `admin` autenticado.

🔶 **[DECISIÓN ABIERTA]** Volumen objetivo concreto (¿cuántos asistentes/registros/órdenes esperás para CCM 2026?). El seed actual simula ~1.189 registrados / 703 inscripciones / 41 órdenes (D34); confirmar el orden de magnitud real fija el dimensionamiento de Railway/DB y el criterio #8. (Gastón.)

---

## 6. Restricción dura: la fecha del evento

**El evento es el 19–20/09/2026 y no se mueve.** Eso invierte la prioridad normal: no buscamos "el backend ideal", buscamos **el backend que opera el evento sin fallar**, y todo lo demás es _MÁS ADELANTE_.

Hitos atados a la fecha (fechas exactas → doc de plan/timeline):

| Hito | Por qué su deadline | Cuándo |
|---|---|---|
| Pagos + acreditación en producción y probados | Necesarios para vender entradas VIP y acreditar en puerta | Con holgura antes del 19/09 |
| **Cierre de convocatorias** | Las `Convocatoria.deadline` (postulaciones de diseñadores/expositores) caen **antes** del evento → el flujo de postulaciones tiene que estar real **antes** que el de puerta | El más temprano de los hitos |
| Congelamiento de features (code freeze) | Llegar al evento con código estabilizado, no recién mergeado | Días antes del 19/09 |
| Ensayo de carga + simulacro de acreditación | Validar criterios #2, #4, #8 en condiciones reales | Antes del freeze |

🔶 **[DECISIÓN ABIERTA]** Presupuesto y timeline (cuántas semanas/persona hay hasta septiembre, y quién implementa) — define cuánto del alcance v1 es realista o si hay que recortar más. (Alan/Gastón.)
🔶 **[DECISIÓN ABIERTA]** Dominio del API y del frontend (¿`api.ccm.com.ar`? ¿dominio propio o se queda en `soyalantapia.github.io/ccm-app/`?). Afecta CORS, configuración de webhook de MP y los magic links de recuperación. (Gastón/Alan.)

---

## 7. Dependencias críticas (bloquean v1)

Resumen de lo que **debe** resolverse temprano porque condiciona el diseño, no solo la implementación:

1. **Canal de venta de entradas** (O3): checkout propio MP vs seguir en Tikealo. **Mayor impacto en alcance.**
2. **Cuenta + credenciales productivas de Mercado Pago** (O3).
3. **Modelo de acreditación del QR** (O2): por jornada vs por entrada; por persona vs por orden.
4. **Política de datos para sponsors** (O5): qué se entrega y bajo qué acuerdo (comercial + legal).
5. **Dominio y presupuesto/timeline** (§6).

Todas marcadas 🔶 arriba. Mientras no se resuelvan, el backend se diseña para soportar las dos ramas razonables (p. ej. abstraer "confirmación de pago" para que valga MP propio o reconciliación con Tikealo), pero no se implementan ambas.
