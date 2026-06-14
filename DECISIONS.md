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
