# DECISIONS.md — Registro de decisiones (Fase 0)

Decisiones tomadas durante la construcción de la demo, con su porqué. Los [PENDIENTE] del PRD se resolvieron con el [SUPUESTO] indicado, siempre configurables.

## Arquitectura

1. **Cero backend (manda el prompt sobre el PRD §4.1).** El PRD recomienda Supabase; esta fase es 100% frontend: seed estático en `src/data/seed/` + localStorage, todo detrás de la interfaz `DataStore`. Fase 1 enchufa backend real implementando esa interfaz sin tocar pantallas.
2. **"Tiempo real" sin backend**: cada escritura emite por un bus interno y el evento `storage` del navegador la propaga a otras pestañas → el dashboard admin abierto en otra pestaña se mueve en vivo con las acciones del usuario.
3. **Limitación conocida y aceptada**: los datos viven por dispositivo (localStorage). No hay sincronización entre teléfonos. El admin muestra "Demo local · la sincronización en la nube llega en Fase 1".
4. **Archivos reales en `~/dev/ccm-app` + symlink en `~/Desktop/Programacion`**: el Desktop está en iCloud y rompe esbuild/rollup (patrón canónico del equipo).

## Deploy

5. **Repo**: `soyalantapia/ccm-app` (nombre libre, sin fallback necesario). URL: https://soyalantapia.github.io/ccm-app/
6. **Pages por rama `gh-pages` (`npm run deploy`), no por Actions — bloqueo externo documentado.** El token OAuth de `gh` no tiene scope `workflow` y GitHub rechaza pushear `.github/workflows/`. Se intentó `gh auth refresh -s workflow` (device flow completado hasta la pantalla final), pero GitHub exige **sudo mode** (passkey/contraseña) que solo el dueño de la cuenta puede completar físicamente. El workflow `deploy.yml` queda listo en `.github/workflows/` (excluido de git vía `.gitignore`). **Para activarlo**: `gh auth refresh -h github.com -s workflow` → completar passkey → quitar la línea `.github/workflows/` de `.gitignore` → `git add -f .github/workflows/deploy.yml && git commit && git push` → `gh api -X PUT repos/soyalantapia/ccm-app/pages -f build_type=workflow`. Mientras tanto, el tab Actions muestra verde con el build automático `pages build and deployment`.
7. **SPA en Pages**: `404.html` = copia de `index.html` (plugin en `vite.config.ts`). Las rutas profundas devuelven HTTP 404 con el shell de la app — aceptable para la demo (GitHub Pages no permite rewrites).

## Producto

8. **Compra VIP**: la orden se crea (`iniciada` → `redirigida_mp`) y el link de Mercado Pago se abre en **pestaña nueva**; la app queda en "Estamos confirmando tu pago". Razón: con links placeholder, navegar en la misma pestaña rompería el flujo de la demo. El PRD dice "redirige" — se respeta el contrato de estados y la salida a MP.
9. **Links MP placeholder** = `https://www.mercadopago.com.ar` (aterriza en página real de MP), editables por plan desde Admin → Entradas y órdenes. Precios VIP "a confirmar" hasta que el admin los cargue ([PENDIENTE] PRD §18).
10. **Sponsors ficticios** (Banco Distrito, Aura Beauty, Terruño Wines): el PRD prohíbe inventar sponsors reales; son placeholders editables con rubro, nivel y exclusividad para demostrar el sistema (uno con exclusividad de rubro, D20).
11. **FAQ de 11 ítems**: Tikealo no es accesible desde acá; los 11 ítems se redactaron exclusivamente con datos del PRD (beneficios de registrarse, entrada gratuita con inscripción obligatoria, cupos, estacionamiento, networking/coworking, galas, etc.).
12. **`/agenda` no es ruta separada en Fase 0**: la grilla del evento principal vive en su ficha (`/eventos/ccm-2026`). El PRD §16 Fase 0 no exige agenda standalone.
13. **`/en-vivo` fuera de alcance Fase 0** (PRD §16 no lo incluye); el módulo EN VIVO llega con streaming en fases siguientes.
14. **Imágenes**: editoriales de moda con licencia libre (Unsplash License), descargadas al repo en `public/img/` con créditos en `img/manifest.json` ([SUPUESTO] PRD §18 por falta de fotos reales).
15. **Identidad**: un dispositivo = un perfil ([SUPUESTO] PRD §7.5); QR de acreditación estable por dispositivo con checksum simple (firma real en Fase 1).
16. **Admin**: clave simple `ccm2026` definida en `src/config` (provisorio, documentado en pantalla); auth real con email+contraseña llega en Fase 1.
17. **Postulaciones seed + decisiones**: las decisiones del admin sobre postulaciones seed se guardan como overrides en localStorage (el seed es inmutable).
18. **Theming**: además del editor por token, presets de un toque ("Editorial CCM", "Noche de gala", "Bordeaux", "Esmeralda") para demostrar D23 en vivo.

## Performance (medido en la URL pública, 2026-06-11)

19. **Lighthouse móvil (simulación slow-4G): Performance 90 · CLS 0 · TBT 0ms · LCP 3,0s.** Optimizaciones aplicadas: imágenes recomprimidas (hero 381KB→90KB, total 14MB→8,7MB), preload del hero con fetchpriority high, landing eager (sin chunk lazy en la ruta de entrada), `qrcode` con import dinámico, app-shell estático del hero en `index.html` (pinta antes de que llegue el JS). El LCP simulado a slow-4G queda en 3,0s porque una SPA client-side no puede pintar antes de descargar JS+CSS; en 4G real/wifi el primer paint queda ~1-1,5s y las visitas siguientes cargan de la caché del service worker (~0,1s). La palanca para bajar de 2,5s en frío es el prerender de rutas públicas, ya previsto por el PRD §17 para la fase siguiente.
20. **Reset de demo**: Admin → Configuración → "Reiniciar datos de la demo" limpia el dispositivo para presentar desde cero (recomendado antes de la reunión).

## Iteración app-feel + datos reales de Tikealo (2026-06-12)

21. **Precios y tiers REALES** (fuente: página oficial del evento en Tikealo): Sábado/Domingo Primera Pasada $0 · Night VIP $30.000 + $3.000 servicio · Sunset VIP $30.000 + $3.000 · Combo VIP 2 noches $50.000 + $5.000. Ya no hay "precio a confirmar"; los links de MP siguen placeholder editables.
22. **La compra vive ADENTRO del evento**: la ficha del principal (`/eventos/ccm-2026`) es ahora una página de expo completa estilo ticketera: selector de entradas con stepper de cantidad + cargo por servicio + barra sticky con total → Mercado Pago; debajo info real del evento, "qué vas a vivir", experiencias especiales, por qué asistir, agenda por bloques y Director General (Néstor Moio). `/entradas` reusa el mismo selector.
23. **App-feel**: banner hero del evento principal en `/eventos`; transiciones de página (fade+rise 240ms); footer web oculto en mobile fuera de la landing (manda el bottom nav); botón volver flotante en fichas; tap feedback global (`active:scale`); barra de compra en portal (evita el containing block del wrapper animado).
24. **FAQ** actualizada a las 11 preguntas reales de Tikealo (con sus emojis) y descripción del evento principal con el copy oficial.
25. Una orden ahora registra **cantidad y total** ((precio+servicio)×qty); visible en Mi QR y en Admin → Órdenes.

## QA pass + fixes del circuito (2026-06-14)

26. **Scroll a `#hash` arreglado** (`src/components/layout/ScrollManager.tsx`): `<ScrollRestoration>` reseteaba al top y no honraba el hash hacia rutas lazy, dejando muertos los CTAs "Comprá tu entrada VIP" (galas + FAQ + cards de experiencias). El nuevo ScrollManager reintenta por `setTimeout` hasta que monta la ruta lazy. Dos quirks de Chrome documentados en el archivo: (a) el scroll **smooth programático** se descarta cuando `html` tiene `scroll-behavior: smooth` → se usa `behavior:'instant'`; (b) el cleanup del efecto (StrictMode+Suspense) cancelaba un `requestAnimationFrame` antes de correr → se usan setTimeouts guardados por hash, sin cancelar.
27. **Doble-submit de compra arreglado** (`TicketSelector`): el guard estaba en `useState` (no se refleja en el mismo tick), así que un doble/triple-tap creaba órdenes duplicadas. Ahora el guard es un `useRef` (bloqueo sincrónico) + botón `disabled`. Verificado: triple-click → 1 sola orden.
28. **Otros**: steppers de cantidad a 44×44px (touch target); total del sheet recalculado desde las órdenes creadas (no del render); `block_view` (PRD §13) por IntersectionObserver en cada bloque; aria-label en el input inline del perfil; `<option>` placeholder con `hidden`; escrituras inmutables en LocalDataStore (cancelRegistration/setOrderStatus/toggleFavorite); ternario muerto en Countdown.
29. Excepciones de `rounded-full` documentadas en DESIGN.md (controles circulares app-native: steppers, FAB de volver, play de YouTube, avatares, nav central).

## Auditoría 360 + Bloque 0/1 del roadmap (2026-06-14)

Tras una auditoría multi-agente (producto/PRD, UX, diseño, código, a11y/perf) se implementó el primer batch:
30. **Robustez demo**: `uuid()` con fallback (crypto.randomUUID rompía en contexto no-seguro) en `lib/identity.ts`; `<Img>` con `onError` → fallback editorial (no más hueco gris).
31. **Cancelar inscripción**: optimista + `toast` con acción "Deshacer" (Toast extendido para aceptar `{ tone, action, duration }`, retrocompatible).
32. **Service worker**: `UpdatePrompt` (`useRegisterSW` de vite-plugin-pwa/react) muestra "nueva versión disponible → Actualizar"; el registro del SW se movió de main.tsx al componente.
33. **Reset de demo**: confirmación con `Sheet` propio (no `window.confirm`).
34. **Seed a escala de pre-evento**: `analytics.ts` genera ~5.850 eventos programáticamente → dashboard abre con ~1189 registrados / 703 inscripciones / 122 descargas / 41 órdenes (antes "4").
35. **Slot S1 — interstitial de apertura**: `features/ads/Interstitial.tsx` (1×/sesión, skippeable 3s, trackeado), montado en ProfileSheetProvider; creatividad S1 de Banco Distrito en sponsors.ts; `AdSlot` ahora incluye 'S1'.
36. **Contraste dorado**: `--t-accent` #b98a2f → #a87d22 (mejora AA sobre crema 2.7→3.3, mantiene AA sobre noche).
37. **Fuente display auto-hosteada** (`public/fonts/schibsted-display.woff2`) con `@font-face` de URL estable + `<link rel=preload>` → corta el FOUT del título (LCP). Se quitó el import fontsource de Schibsted.
38. **CTA del header visible en mobile** ("Registrate" / "Mi QR").

## Bloque 2 del roadmap — features de venta + calidad (2026-06-14)

Segundo batch (verificado en vivo en el preview, sin errores de consola; tsc + build limpios):
39. **Reporte Técnico de Impacto por sponsor — entregable exportable** (`features/admin/SponsorReport.tsx`, botón en `OpsSponsorCard`): documento de 1 página con cara de papel (marca + sponsor + nivel/rubro + exclusividad + período), métricas reales calculadas desde `store.getAnalytics()` (impresiones, clics, CTR, alcance estimado = deviceIds únicos, desglose por slot S1/S2/S3/S6, descargas bajo su banner). Dos exportaciones: **CSV** real (blob con BOM) y **Imprimir / Guardar PDF** vía `window.print()` con `<style media="print">` que aísla `#sponsor-report-doc`. Trackea `sponsor_report_generated`. Cierra la promesa del deck §10.9.
40. **Dashboard "Simular actividad en vivo"** (`features/admin/LiveSimulator.tsx`): toggle que inyecta eventos sintéticos creíbles (IDs reales del seed) cada 3,5s vía `store.track` → KPIs y feed se mueven solos durante el pitch sin depender de abrir dos pestañas. Chip "Simulando · N eventos"; `clearInterval` en cleanup (verificado: al apagar, el feed se congela, sin leak).
41. **Timeline del dato propio en Personas** (`features/admin/DeviceTimeline.tsx`): los `analytics_events` del dispositivo actual en orden inverso, humanizados (acción de origen + hora relativa/absoluta). Remate del §10.5 "el dato propio": esta acción de hace 30s = este registro con su origen y hora.
42. **Skeletons de carga por tipo de página** (`components/ui/Skeleton.tsx`: `Skeleton`/`PagePending`/`AdminPending`): reemplazan el flash del `PageLoader` "CCM". `S` (público/app) usa `PagePending` (hero + grilla de cards); `SA` (admin) usa `AdminPending` (título + KPIs + filas). Pulso con `motion-safe`.
43. **Focus-trap + a11y en Sheet/Modal** (`lib/useFocusTrap.ts`): al abrir mueve el foco adentro y lo restituye al cerrar; Tab/Shift+Tab ciclan dentro del diálogo; `aria-labelledby` al título (o `aria-label` fallback). Verificado: foco inicial dentro, Tab last→first y Shift+Tab first→last.
44. **Instalar PWA + onboarding** (`lib/useInstallPrompt.ts` + `components/layout/InstallBanner.tsx` + `features/app/WelcomeSheet.tsx`): el banner (solo mobile, demorado 4,2s para no pisar el interstitial S1) captura `beforeinstallprompt` y dispara el prompt nativo en Android; en iOS muestra el paso manual (Compartir → Agregar a inicio). Descartable y persistente (`ccm:install-dismissed`). El onboarding es un bottom sheet de primera vez (3 cosas que se hacen + registro) gatillado por una señal de bus `ui:interstitial-done` que emite el interstitial al cerrarse → **nunca se solapan**. Tracking: `pwa_prompt_shown`/`pwa_install_accepted`/`pwa_prompt_dismissed`, `onboarding_completed`.

## Bloque 3 del roadmap — escala + pulido (2026-06-14)

Tercer batch (verificado en vivo en el preview, sin errores de consola; tsc + build limpios):
45. **Variedad de seed** (`data/seed/*`, `data/ids.ts`): +3 galerías (Fotos pasa de 1 a 4), +1 sponsor **Vialux Eyewear** (Oro, óptica), +1 capacitación **"Taller: Marca de autor que vende"** con sus bloques (tab Capacitaciones en Eventos), y **24 postulaciones** con nombres argentinos realistas → CRM Personas lleno. analytics.ts sumó eventos del sponsor/galerías nuevos → KPIs coherentes (1189 / 703 / **343** descargas / 42 / 24). Integridad referencial verificada (sin IDs/fotos rotas).
46. **Agregar al calendario (.ics)** (`lib/ics.ts` + `features/app/AddToCalendar.tsx`, integrado en Mi QR / `RegistrationRow`): genera un VEVENT válido (CRLF, UID estable, DTSTART/DTEND o all-day, LOCATION) y lo baja como blob; trackea `calendar_export`.
47. **Lockups de sponsors + muro** (`features/sponsors/SponsorLogo.tsx`, `pages/Sponsors.tsx`): monograma honesto por iniciales + nombre, tratado por nivel; muro agrupado Principal/Oro/Plata sobre bloque night. Sin inventar logos reales (sponsors ficticios). Tolera N sponsors.
48. **Feed en vivo sin ruido** (`features/admin/CoreLiveFeed.tsx`): denylist `NOISE_EVENTS` (page_view, qr_view, *_view, ad_impression/skip, pwa_prompt_*) → la "actividad en vivo" muestra SOLO señal de negocio. El ruido sigue en DeviceTimeline y en el CSV (que consumen `coreAnalytics` sin filtrar). Empty-state digno.
49. **Stand → lead-gen (B2B)** (`pages/Stand.tsx` + `features/stand/sponsorSlug.ts`, rutas `/stand` y `/stand/:slug`): simula el QR del stand de un sponsor (Principal por defecto, o por slug); CTA que pasa por `requireProfile(['firstName','lastName','email','phone'], 'stand_lead')` → estado de éxito + `stand_lead_captured` { sponsorId, slug }. Gancho de venta: lead calificado y medible. Link discreto en el footer.
50. **Monograma de marca con corazón** (`SiteLayout`): el corazón de *Corazón de Moda* en el wordmark del header (micro-interacción al hover) y en el footer.
51. **Caché del reel + reduced-motion** (`vite.config.ts` + `features/landing/HeroVideo.tsx`): runtime caching `CacheFirst` (range requests, cache `ccm-video`) → el reel de ~2,7MB no se precachea pero queda instantáneo/offline tras el primer play; con `prefers-reduced-motion` no autoreproduce ni descarga el mp4 (queda el poster).
52. **Tabs sin corte en mobile** (`components/ui/Tabs.tsx`): `whitespace-nowrap` → "Mis descargas" (y demás tabs de Fotos/Eventos/Postulaciones) ya no envuelven a 2 líneas; la fila scrollea horizontal.

**Pendiente (única "L" del roadmap): prerender de rutas públicas (SSG)** → SEO + LCP<2,5s en frío. NO se incluyó en este batch a propósito: es un cambio arquitectónico al build (vite-plugin-ssg/prerender) y no conviene shippearlo sin verificación dedicada justo antes de la demo con Gastón. Queda como paso siguiente, aislado y verificado aparte.

## Auditoría completa + fixes (2026-06-14)

Auditoría multi-agente (6 lentes + verificación adversarial) + verificación determinística en runtime + recorrido manual. Resultado: 56 PASS, 0 bug bloqueante, integridad de datos y matemática del reporte verificadas al dígito. Informe completo en `AUDITORIA.md`. Fixes aplicados:
53. **A11y diálogos full-screen**: `Interstitial` y `SponsorReport` ahora usan `useFocusTrap` (foco atrapado + restitución + Escape; en el interstitial, Escape solo cuando ya se puede saltar). Antes ninguno atrapaba el foco — era el hallazgo a11y más serio.
54. **PWA `registerType: 'autoUpdate'` → `'prompt'`** (`vite.config.ts`): con autoUpdate el SW hacía `skipWaiting()` incondicional y el banner `UpdatePrompt` nunca disparaba (swap silencioso de assets en media demo). Con 'prompt', el SW queda en espera, `needRefresh` dispara el banner y `skipWaiting` queda gated por el mensaje SKIP_WAITING (verificado en `dist/sw.js`).
55. **Feed en vivo (D48 reforzado)** (`Dashboard.tsx` + `CoreLiveFeed` exporta `isSignal`): se filtra la señal ANTES de recortar a 12 y se ordena por recencia → el feed ya no aparece casi vacío con el seed dominado por impresiones/vistas.
56. **KPI «Órdenes VIP» reconciliado** (`Dashboard.tsx`): la tabla "Órdenes por estado" suma una fila "Históricas (seed)" → el total cuadra con el KPI (antes el KPI incluía seed y la tabla no).
57. **Labels del feed para eventos nuevos** (`coreAnalytics.ts`): `stand_lead_captured`/`sponsor_lead`/`calendar_export`/`onboarding_completed` con label en español; `stand_view` movido a la denylist del feed.
58. **Reporte: slot S4 (video patrocinado)** sumado a `AdSlot` (`types.ts`) y al desglose por espacio (`SponsorReport.tsx`) → el desglose cuadra con el total.
59. **Favicon + og-image** (`index.html` `<link rel=icon>` svg+png; `vite.config.ts` `includeAssets`) → favicon en pestaña y og-image precacheada/offline. App-shell estático ahora usa `var(--t-*)` (hereda el tema, corrige el dorado viejo #b98a2f).
60. **`Tabs` con ARIA** (`role=tablist/tab` + `aria-selected`). **PRD §13** reconciliada con el código (eventos nuevos, `stand_view`, slots S1-S4/S6); docstring de `analytics.ts` corregido (~6.400).

## Admin en formato app + responsive (2026-06-14)

61. **Panel admin tipo aplicación** (`components/layout/AdminLayout.tsx`): en mobile, el panel ahora se siente app nativa — **barra de navegación inferior fija** (identidad night para distinguirse de la app pública) con 4 destinos primarios (Panel · Eventos · Personas · Sponsors) + **"Más"** que abre un `Sheet` con las secciones secundarias (Postulaciones, Entradas y órdenes, Configuración) y "Ver la app pública". Header compacto que muestra la sección actual; transición de página (animate-page); tap feedback (`active:scale-90`); `pb-24` para no tapar contenido; safe-area-inset. En desktop (≥md) se mantiene el **sidebar** completo de 7 secciones. Estado activo en accent; "Más" se marca activo en las rutas secundarias. Verificado responsive (sidebar/desktop ↔ bottom-nav/mobile) sin errores de consola.
62. **Bottom nav admin moderna — pestaña central circular sobresaliente**: "Panel" (Dashboard) va al centro como FAB circular elevado (sobresale ~24px sobre la barra, `ring-4 ring-night` + shadow; dorado activo, night-soft inactivo). Eventos/Personas a la izquierda, Sponsors/Más a la derecha.

## Previews por sección (WhatsApp/OG) + perfeccionado mobile (2026-06-14)

63. **Imagen OG propia por sección + prerender** (`scripts/make-og.mjs` genera og-image/og-app/og-admin/og-sponsors/og-eventos; `vite.config.ts` `spaFallback` ahora prerenderiza `dist/<ruta>.html` para app/admin/sponsors/eventos/entradas con su `<title>`/descripción/`og:image`/`og:url`). Como WhatsApp lee el OG del HTML estático sin ejecutar JS, cada link profundo compartido (`/admin`, `/app`, etc.) ahora **devuelve HTTP 200 con su propia imagen** en vez de un 404 sin preview. La home sigue en `index.html` con `og-image.jpg`.
64. **Fix de overflow horizontal en mobile** (auditoría celular): el header admin (`CorePageHeader`) tenía las acciones en `shrink-0` → no envolvían (overflow 408px); ahora `w-full sm:w-auto`. Las columnas del grid del Dashboard sin `min-w-0` dejaban que las tablas estiraran el ancho (overflow 406px); ahora `min-w-0`. Verificado: **0 overflow horizontal** en las 7 pantallas admin y en todas las públicas (landing/app/mi-qr/stand/sponsors/catálogo/fotos/contenido/ficha principal) a 375px.
65. **Gate admin acepta cualquier clave (demo)** (`AdminLayout`): a pedido, el `AdminGate` ya no compara contra `config.adminKey` — cualquier clave (incluso vacía) habilita el panel, así no hay nada que recordar al presentar. Se actualizó el copy del gate y de Configuración → Acceso ("cualquier clave habilita el panel"). Reemplaza a D16 (clave `ccm2026`) en Fase 0; la auth real (email/contraseña/roles) sigue siendo Fase 1.

**Límites de Fase 1 documentados (no se tocan en Fase 0):** (a) el combo VIP usa el mpLink del primer plan — Fase 1: checkout por tier o carrito MP único; (b) inscribirse a un bloque del principal no marca la entrada general event-level — coherencia o copy en Fase 1. **Deuda anotada:** contraste del dorado en micro-texto (3.26:1, bajo AA solo en eyebrows); `video_complete` declarado pero no emitido.

## Admin gestionable (CRUD real) — el usuario pidió "todo editable" (2026-06-14)

Se hace por etapas. **Base + Eventos/Bloques (Etapa 1):**
66. **Capa de overlay genérica** (`data/store/overlay.ts`): patrón único `created/edited/deleted` en localStorage que se aplica sobre la semilla estática vía `mergeOverlay`. Como `writeJSON` emite en el bus, la UI se re-renderiza sola, y "Reiniciar la demo" (limpia claves `ccm:`) revierte todo. Es la base para hacer editable **cualquier** entidad (eventos, bloques, galerías, sponsors, catálogo, contenido) sin backend.
67. **Eventos + Bloques CRUD real** (`DataStore`/`LocalDataStore`: `createEvent/updateEvent/deleteEvent` con id+slug auto y borrado en cascada de bloques; `createBlock/updateBlock/deleteBlock`; `getEvents/getBlocks` ahora mergean overlay). UI: `OpsEventForm` y `OpsBlockForm` (Sheets), botón **Crear evento** en `AdminEventos`, y **Editar/Eliminar evento + Agregar/editar/eliminar bloque** en `AdminEventoDetalle` (con Sheets de confirmación). Trackea `admin_event_created/updated/deleted` y `admin_block_*`. Verificado: 12/12 tests de store + flujo UI completo (crear evento → aparece en el admin **y en la app pública**, tab "Caminos" 2→3, ficha pública OK).

**Etapa 2 — Galerías + Sponsors:**
68. **Galerías + Sponsors CRUD real** (mismo overlay): store `createGallery/updateGallery/deleteGallery` (id+slug auto) y `createSponsor/updateSponsor/deleteSponsor`; `getGalleries/getSponsors/getCreative` mergean overlay. UI: `OpsGalleryForm` (con **selector de portada + grilla de fotos del pool** g01-g20 + sponsor S3) y `OpsSponsorForm` (nivel/rubro/exclusividad/tagline + **lista dinámica de creatividades por slot**), creadas en paralelo por agentes. `AdminGalerias` tiene **Crear galería / Crear sponsor** + editar/eliminar por ítem (en la card y en `OpsSponsorCard` vía props), con confirmaciones. Trackea `admin_gallery_*` y `admin_sponsor_*`. Verificado: 9/9 tests de store + ambos formularios renderizan.

**Etapa 3 — Catálogo (expositores) + Contenido (videos): cierra "todo editable":**
69. **Catálogo + Contenido CRUD real + pantallas admin nuevas** (no existían). Store: `createCatalogProfile/updateCatalogProfile/deleteCatalogProfile` (id+slug auto) y `createContent/updateContent/deleteContent`; `getCatalog/getCatalogProfile/getContents` mergean overlay. Pantallas NUEVAS `AdminCatalogo` y `AdminContenido` (+ rutas `/admin/catalogo` y `/admin/contenido` en App.tsx, y entradas en el sidebar y en el sheet "Más" del admin con íconos Store/Film). Formularios `OpsCatalogForm` (rol/plataforma/ciudad/bio + **retrato del pool de personas** + Instagram + verificado + participaEn por comas + **portfolio del pool de fotos**) y `OpsContentForm` (título/youtubeId con **preview de miniatura de YouTube**/descripción/duración/plataforma/sponsor opcional/fecha), creados en paralelo por agentes. Trackea `admin_catalog_*` y `admin_content_*`. Verificado: 7/7 tests de store + ambas pantallas y formularios renderizan (Expositores con 12 perfiles + retrato preview; Contenido con 3 miniaturas YT). **Con esto el admin queda 100% gestionable** (eventos, bloques, galerías, sponsors, expositores y contenido), todo revertible con "Reiniciar la demo".
