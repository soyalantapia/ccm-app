# CCM App — Guía para Claude Code

Plataforma PWA de **Córdoba Corazón de Moda** (demo Fase 0). PRD completo en `docs/PRD.md` — es la fuente de verdad de producto. Decisiones de implementación en `DECISIONS.md`. Sistema de diseño en `DESIGN.md`.

## Stack

- Vite 8 + React 19 + TypeScript + Tailwind CSS v4 (CSS-first, `@theme inline`)
- React Router 7 (`createBrowserRouter`, basename `/ccm-app`)
- vite-plugin-pwa (manifest + service worker, shell offline)
- `qrcode` (QR client-side) · `lucide-react` (íconos) · Fraunces + Archivo variable (self-hosted)
- **Cero backend**: seed estático + localStorage detrás de `DataStore`

## Comandos

```bash
npm run dev      # dev server
npm run build    # tsc -b && vite build (+ 404.html fallback)
npm run deploy   # build + push a rama gh-pages (deploy real)
npx tsc --noEmit # typecheck rápido
```

## Estructura

```
src/
  config/          # config global + planes de entrada (seedPlans)
  data/
    types.ts       # tipos de dominio (NO cambiar sin actualizar seed+UI)
    ids.ts         # IDs/slugs canónicos (contrato fijo)
    seed/          # contenido seed estático
    store/         # DataStore (interfaz) + LocalDataStore + hooks
  lib/             # bus, storage, track, identity, theme, profileRequest, actions, assets
  components/
    ui/            # KIT DE UI PROPIO — usar SIEMPRE estos componentes
    layout/        # SiteLayout (público+app), AdminLayout (gate + sidebar)
    profile/       # ProfileSheetProvider (sheet global de perfil progresivo)
  pages/           # una página por ruta (+ app/ + admin/)
  features/<area>/ # componentes específicos de un área (propiedad de esa área)
```

## Arquitectura de datos (regla de oro)

**La UI consume SOLO `store` / `useStore` de `src/data/store`.** Nunca importar seed directamente desde páginas, nunca tocar localStorage directo.

```tsx
import { store, useStore } from '../data/store'

const events = useStore((s) => s.getEvents())        // lectura reactiva (re-render en cada escritura, local o de otra pestaña)
store.register(eventId, blockId)                     // escritura (emite bus + storage event → admin en vivo)
store.track('photo_view', { photoId })               // tracking PRD §13
```

- Escrituras → `writeJSON` → bus interno + evento `storage` nativo → **el dashboard admin abierto en otra pestaña se actualiza en vivo**.
- `blockAvailability(blockId)` = cupo seed + inscripciones locales. `full === true` → mostrar "Completo".
- Interfaz completa en `src/data/store/DataStore.ts`. Fase 1 = nueva implementación de esa interfaz, sin tocar UI.

## Identidad sin contraseñas (D22)

Toda acción gated llama a `requireProfile(fields, action, opts?)` de `src/lib/profileRequest.ts`:

```tsx
const ok = await requireProfile(['firstName', 'lastName', 'email', 'profession'], 'inscripcion_bloque')
if (!ok) return // canceló
store.register(eventId, blockId)
```

Abre el sheet global pidiendo SOLO los campos faltantes; una vez dados no se vuelven a pedir. Campos: `firstName lastName email profession phone dni city instagram`. Para "Registrate gratis" usar `registerFree(navigate)` de `src/lib/actions.ts`.

## Assets

Imágenes del seed en `public/img/` con rutas relativas (`'img/gallery/g01.jpg'`). Renderizar SIEMPRE con `<Img src={...}>` del UI kit (resuelve base path, lazy, fade-in). Contrato de archivos:

```
img/hero/hero-main.jpg · hero-night.jpg · hero-sunset.jpg
img/events/principal.jpg · camino-18.jpg · camino-30.jpg
img/people/p01.jpg … p12.jpg          (retratos 4:5)
img/portfolio/pNN-1.jpg … pNN-4.jpg   (NN = 01..12)
img/gallery/g01.jpg … g28.jpg
```

## Reglas duras

1. **Tokens only**: jamás hardcodear colores/tipografías. La paleta default de Tailwind está deshabilitada; usar `bg-bg text-ink border-line bg-accent bg-night font-display` etc. (ver DESIGN.md).
2. **UI en español (AR) con voseo** ("Inscribite", "Comprá"). Código, commits y nombres en inglés.
3. **Nunca sacar al usuario de la app.** Únicas salidas: link de Mercado Pago y "Cómo llegar" (Google Maps). Videos SIEMPRE `<YouTubeEmbed>` embebido.
4. **Trackear todo** con la taxonomía del PRD §13 (`store.track`). Slots publicitarios con `<AdBanner slot="S2|S3|S6">`.
5. Admin gate: clave `ccm2026` (`src/config`), sessionStorage — provisorio de demo.
6. Mobile-first: diseñar para 390px primero; el bottom nav tapa los últimos 6rem en mobile (el layout ya agrega padding).
