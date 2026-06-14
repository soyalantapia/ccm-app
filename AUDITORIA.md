# AUDITORÍA COMPLETA — Córdoba Corazón de Moda (demo Fase 0)

**Fecha:** 2026-06-14 · **Alcance:** toda la plataforma (app pública + app móvil + panel admin + PWA + datos).
**Veredicto:** ✅ **Apta para demostrarle al cliente.** 0 bugs bloqueantes. Integridad de datos y flujos núcleo verificados. Los hallazgos fueron LOW/MEDIUM + 1 a11y; todos los accionables quedaron **arreglados** o **documentados como límite de Fase 1**.

## Metodología (triple verificación)

1. **Auditoría de código multi-agente** — 6 lentes en paralelo (flujos núcleo, panel admin, integridad de datos, PWA/build/perf, a11y/UX/tracking, regresión de los batches 0/1/2/3), cada hallazgo pasado por un verificador **adversarial** que intenta refutarlo. Resultado: **56 PASS · 5 FAIL · 18 RISK**, de los cuales **15 quedaron confirmados como reales** tras la refutación.
2. **Verificación determinística en runtime** (sobre la instancia real, no lectura de código): integridad de datos, lógica de escritura del store y matemática del Reporte de Impacto.
3. **Recorrido manual en el preview** de todas las rutas: 0 errores de consola.

## Verificación determinística (objetiva)

| Qué | Resultado |
|---|---|
| **Integridad referencial del seed** | ✅ **0 problemas** sobre 4 eventos · 18 bloques · 4 galerías · 58 fotos · 4 sponsors · 24 postulaciones · **6.380 eventos de analytics** · 5 planes · 12 expositores. Todas las referencias (sponsorId/eventId/blockId/galleryId/planId/photoId/convocatoriaId/contentId) apuntan a IDs existentes. Sin duplicados. `seedTaken` ≤ capacidad, sin negativos. |
| **Lógica de escritura del store** | ✅ **15/15**: identidad, registro al principal, inscripción a bloque + cancelar + re-inscribir, orden VIP con **total = (precio+servicio)×qty** correcto, descarga con sponsorId, postulación. Cada operación emite su evento de tracking. |
| **Matemática del Reporte de Impacto** | ✅ recomputado por fuera y comparado al dígito: **1.528 impresiones · 132 clics · 8,6% CTR · 977 alcance único** = lo que renderiza el reporte. |
| **Build / typecheck** | ✅ `tsc -p tsconfig.app.json` limpio · `npm run build` limpio. |

## Hallazgos confirmados (15) y su estado

### Arreglados en esta pasada
| # | Sev | Hallazgo | Fix |
|---|-----|----------|-----|
| 1 | **alta (a11y)** | Interstitial S1 no atrapaba el foco ni cerraba con Escape | `useFocusTrap` + Escape (cuando ya se puede saltar) + foco inicial al CTA. Verificado: foco entra al diálogo; Escape cierra solo cuando es skippeable. |
| 2 | media | `registerType:'autoUpdate'` volvía inerte al banner "nueva versión" (swap silencioso en media demo) | → `registerType:'prompt'`. El SW nuevo queda en espera, dispara el banner "Actualizar" (skipWaiting ahora gated por mensaje, verificado en `dist/sw.js`). |
| 3 | media | KPI "Órdenes VIP" y tabla "Órdenes por estado" no cuadraban | La tabla ahora incluye fila **"Históricas (seed)"**; el total cuadra con el KPI. |
| 4 | media | SponsorReport sin focus-trap ni restitución de foco | `useFocusTrap`: Escape cierra y restituye el foco al botón que lo abrió (verificado). |
| 5 | media* | Feed "actividad en vivo" filtraba el ruido **después** de cortar a 12 → casi vacío | Se filtra señal **antes** de recortar + orden por recencia. Verificado: 12 filas de señal de negocio. |
| 8 | baja | `og-image.jpg` no precacheada + favicon sin `<link rel=icon>` | `<link rel=icon>` (svg+png) en `index.html` + favicon/og sumados a `includeAssets` (precacheados, verificado). |
| 9 | baja | App-shell estático con colores hardcodeados (flash con tema custom) | El `#ccm-shell` usa `var(--t-*)` con fallback → hereda el tema pre-paint (y corrige el dorado viejo). |
| 12 | baja | Eventos nuevos salían en el feed con label crudo en inglés | Labels en español para `stand_lead_captured`, `sponsor_lead`, `calendar_export`, `onboarding_completed`; `stand_view` movido a la denylist del feed. |
| 13 | baja | Slot S4 (video) sumaba al total del reporte pero no figuraba en el desglose | `S4` agregado al tipo `AdSlot` y al desglose por espacio. |
| 14 | baja | `Tabs` sin semántica ARIA | `role="tablist"`/`role="tab"`/`aria-selected`. |
| 11/15 | info | Taxonomía PRD §13 y docstring de analytics desactualizados | PRD §13 reconciliado con el código (eventos nuevos + `stand_view` + S4); docstring corregido (~6.400). |

\* sev original baja; subida a media por impacto directo en la demo.

### Documentados como límite de Fase 1 (no se "arreglan" en Fase 0)
- **mpLink combinado (low):** el combo de tiers usa el link MP del primer plan. Fase 1: checkout por tier o carrito único. (Hoy los links MP son placeholders editables.)
- **Inscripción a bloque del principal ≠ entrada general (low):** tomar un bloque no marca la entrada general event-level. Coherencia o copy explícito en Fase 1; para la demo, no afecta el guion.

### Por diseño (Fase 0, ya documentado)
- **Gate de admin "decorativo":** la clave `ccm2026` es un mecanismo provisorio de demo (D16); auth real con usuarios/roles llega en Fase 1.

## Deuda conocida que queda anotada (no bloqueante)
- **Contraste del dorado en micro-texto (low):** `--t-accent` #a87d22 da 3.26:1 sobre crema — bajo AA para texto muy chico (eyebrows). No se tocó el token para no degradar la marca en botones/títulos; pendiente afinar solo en micro-texto.
- **`video_complete`** declarado en §13 pero no emitido (solo `video_play`).
- **Prerender/SSG de rutas públicas** — la única palanca para LCP<2,5s en frío + SEO; cambio de build, se hace aparte y verificado.

## Cómo re-verificar
- Datos/lógica/matemática: ver scripts de verificación corridos en runtime (resultados arriba).
- Código: `npx tsc -p tsconfig.app.json --noEmit` y `npm run build` (ambos limpios).
- Demo: Admin → Configuración → **Reiniciar la demo** antes de presentar.
