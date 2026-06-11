# DESIGN.md — Sistema de diseño CCM

**Estética: editorial de lujo** — revista de moda impresa llevada a producto digital. Marfil/crema de fondo, tinta negra, dorado/mostaza como acento, bloques de contraste azul noche. Mucho aire, grillas asimétricas, fotografía protagonista, serif display enorme. **Prohibido** que parezca template (Bootstrap/Material/dashboard genérico).

## Tokens (únicos colores permitidos)

| Utilidad Tailwind | Rol |
|---|---|
| `bg-bg` | fondo general marfil |
| `bg-surface` | cards / paneles (crema más claro) |
| `text-ink` / `bg-ink` | tinta principal |
| `text-ink-soft` | texto secundario |
| `border-line` | líneas y bordes (siempre 1px) |
| `bg-accent text-accent-ink` | dorado — CTAs, acentos, hovers |
| `bg-night text-night-ink` | bloques azul noche (secciones de contraste, footer, galas) |
| `bg-night-soft` | superficie sobre night |
| `text-success` / `text-danger` | solo estados (cupos, errores) |

Opacidades permitidas: `text-ink-soft/70`, `bg-ink/5`, `border-night-soft`, etc. `white`/`black` solo sobre fotografía (overlays).

## Tipografía

- `type-display` → Fraunces optical 144, tight. Títulos grandes. Tamaños con clamp: hero `text-[clamp(2.6rem,9vw,5.5rem)]`, sección `text-[clamp(2rem,6vw,3.4rem)]`.
- `type-serif` → Fraunces optical 40. Subtítulos, nombres, números destacados (`text-xl`–`text-3xl`).
- `eyebrow` → Archivo uppercase tracking 0.22em 11px. Etiquetas, labels, nav.
- Body: Archivo (default `font-sans`), `text-[15px] leading-relaxed text-ink-soft` para párrafos.
- *Italic* de Fraunces para énfasis editorial: `<em className="italic text-accent">moda</em>` dentro de títulos.

## Patrones editoriales (usar estos, no inventar otros)

1. **Cabecera de sección**: `<SectionTitle eyebrow="..." title={...} lead="..." />`. Eyebrow SIEMPRE con su regla dorada.
2. **Numeración editorial**: listas con `01 — 07` en eyebrow dorado (plataformas, menú).
3. **Dark blocks**: secciones completas `bg-night text-night-ink` para galas/VIP/sponsor — alternar con secciones marfil para ritmo.
4. **Grillas asimétricas**: en grids de cards alternar alturas/spans (`md:col-span-2`, `md:row-span-2`, offsets con `md:mt-12`). Nunca grilla perfectamente uniforme en secciones hero/destacados (sí uniforme en listados utilitarios).
5. **Reglas finas**: separar con `border-t border-line`, nunca con sombras pesadas.
6. **Fotografía**: `<Img>` con ratio fijo (`3/4` retratos, `4/5` people, `16/10` covers). Hover en cards: `group-hover:scale-[1.04]` con `transition duration-700` en `imgClassName`.
7. **Overlay editorial sobre foto**: gradiente `bg-gradient-to-t from-night/80 via-night/20 to-transparent` + texto `text-night-ink` abajo.

## Componentes del kit (`src/components/ui`) — usar SIEMPRE

`Button/ButtonLink` (primary/ink/outline/ghost/night · sm/md/lg) · `Card` (surface/night/bare, hover) · `Badge` (estados de cupo: `tone="success"` "Quedan X" / `tone="danger"` "Completo") · `SectionTitle`/`Eyebrow` · `Sheet` (bottom sheet) · `Modal` (variant="media" para fotos/video) · `Field/Input/Textarea/Select` · `Tabs` · `Stat` (cifras grandes serif) · `Img` · `Marquee` · `EmptyState` · `Countdown` · `QR` · `YouTubeEmbed` · `AdBanner` (slots S2/S3/S6) · `toast()`.

Si necesitás algo que no existe, crealo en `src/features/<tu-area>/` consumiendo tokens — NO modificar `src/components/ui` (compartido).

## Layout y espaciado

- Contenedor: `mx-auto max-w-6xl px-5` (admin: `px-5 md:px-10`).
- Ritmo vertical generoso: secciones `py-16 md:py-24`; entre título y contenido `mt-10 md:mt-14`.
- Radios SOLO vía tokens: `rounded-sm` (botones, badges), `rounded-md` (cards), `rounded-lg` (sheets/modals). Nunca `rounded-xl`/`rounded-full` salvo avatares y el botón central del bottom nav.

## Motion

- Transiciones 200–300ms `ease-out`; imágenes 700ms.
- Entradas: `animate-rise` (una por bloque clave, no en cascada infinita).
- Hover links: subrayado que aparece (`underline decoration-accent underline-offset-4` en hover) o flecha que se desplaza (`group-hover:translate-x-0.5`).
- Nada de spinners: estados de carga con `animate-pulse` sobre formas.

## Admin

Misma identidad (NO dashboard genérico): sidebar night, contenido marfil, títulos serif, tablas con `border-line` y eyebrows como headers de columna, números grandes con `Stat`. Densidad mayor que el sitio público pero misma voz.

## Voz y copy

Voseo argentino, tono del evento: directo, fashion, cálido. "Inscribite", "Comprá tu Night VIP", "Vení con tu mejor LOOK 🖤" (emojis con moderación, solo donde el PRD los usa). Microcopys útiles: "Una sola vez: no te lo volvemos a pedir."
