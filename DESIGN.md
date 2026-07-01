# DESIGN.md — Sistema de diseño CCM

**Estética: revista de moda de lujo llevada a app.** Crema hueso de fondo, tinta marrón-negra, dorado como acento único, tipografía serif de revista (Playfair Display) para display/editorial y sans (Montserrat) para toda la UI. Densidad de sponsors intercalados, bottom-nav mobile de 5 slots con QR central elevado. **Dirección aprobada por el cliente (3 mockups CCM 2026).** Prohibido derivar a patrones genéricos: nada de azules/grises fríos, sombras de color, sans genéricas ni cards uniformes sin la cadencia de sponsors.

## Tokens (fuente única de verdad)

La paleta/tipografía/radios viven como variables `--t-*` en `src/index.css` (`:root`) y se remapean a utilidades Tailwind vía `@theme inline`. `src/lib/theme.ts` (`DEFAULT_THEME`) las espeja para el editor de tema del admin + el pre-paint (`index.html`). **Si tocás un color/radio, actualizá index.css Y theme.ts juntos**, o el pre-paint/admin reinyecta valores viejos.

### Colores editables por el admin (`TOKEN_KEYS`, hex)
| Token / utilidad | Hex | Rol |
|---|---|---|
| `bg` | `#F5F0E8` | canvas crema hueso |
| `surface` | `#FFFFFF` | cards elevadas claras |
| `ink` / `night` | `#181410` | tinta y superficies oscuras (marrón-negro cálido; **no hay azul**) |
| `ink-soft` | `#666666` | texto secundario sobre crema |
| `line` | `#E1DDD5` | hairline sobre crema |
| `accent` | `#B8860B` | dorado primario (eyebrows, CTAs, badges, íconos, underline activo) |
| `accent-ink` | `#FFFFFF` | texto/íconos sobre dorado |
| `night-soft` | `#2A1F0A` | borde/divisor sobre oscuro |
| `night-ink` | `#F5F0E8` | texto crema sobre oscuro |

### Constantes de marca (NO editables — fijas en index.css/@theme)
`gold-deep #8A6208` (fin del gradiente dorado) · `brown-warm #2A1A00` · `brown-olive #2A1F0A` · `brown-gray #2A2420` (extremos de gradientes cálidos) · `cream-muted #E8E0D0` (placeholders/chips) · `text-2 #888` · `text-3 #666` · `text-4 #999` · `text-5 #AAA`.

### Tipografía (auto-hospedada vía fontsource, offline — sin Google Fonts en runtime)
- `--t-font-display` = **Playfair Display Variable**. Utilidad `type-display` (peso 900: héroes, logo, precios, nombres) y `type-serif` (peso 700: títulos de card/sección). Serif → sin tracking negativo.
- `--t-font-sans` = **Montserrat Variable** (body por defecto). `eyebrow` = Montserrat 700 uppercase, tracking 0.12em, 10px (labels/section-labels). Metadatos, botones, nav, descripciones.
- monoespaciada del sistema: solo el código de acreditación.

### Radios
Runtime editable (3 sliders del admin): `radius-sm 8` · `radius-md 12` · `radius-lg 14`. Los radios de detalle del mockup (4/5/6/10/18/20/full) se usan como **literales por componente** (`rounded-[12px]`, `rounded-full`, …), no como tokens.

## Vocabulario de componentes (mockups)

Primitivas compartidas en `src/features/app/mockup.tsx`: `SectionLabel` (barra dorada 24×2 + eyebrow), `BeneficioItem` (fila con caja-ícono dorada), `SectionEmpty` (estado vacío con tinte dorado), `SponsorCuadrado`.

- **section-label**: cada bloque abre con barra dorada + eyebrow dorado uppercase.
- **sponsor-banner** (`AdBanner` slot S2): card oscura `#181410` radius 12, eyebrow dorado, nombre Playfair, subtítulo gris, caja-logo dorada 42px. Separan secciones (cadencia: nunca dos secciones sin banner/CTA entre medio).
- **noticia-card** (Inicio): #fff radius 12, img (cover o gradiente con título), tag dorado, título Playfair, fecha. Featured = ancho completo.
- **participante-card** (Participantes): foto + rol·plataforma dorado + nombre Playfair + ciudad + bio + "Ver Catálogo →".
- **evento-card** (`EventCard`): tag+fecha, foto, hora/título/lugar, cupo/CTA.
- **qr-card** (`AccreditationCard`): #fff, borde dorado 2px, nombre Playfair 900, QR offline, código mono, nota dorada.
- **suscripcion-card**: gradiente dorado (`accent → gold-deep`), pill "Activa", CTA blanca con texto dorado.
- **beneficio-card destacado**: gradiente `ink → brown-warm` + borde dorado.
- **bottom-nav** (`SiteLayout`): barra `#181410`, 5 slots (Noticias · Eventos · **Mi QR** central elevado -18px con glow · Participantes · Elukamo), activo con subrayado dorado 2px arriba. Solo mobile (`md:hidden`). Perfil vive en el drawer.

## Reglas
- Voz: español rioplatense con voseo ("Accedé", "Inscribite", "Reservá"). Eyebrows uppercase dorados. CTAs imperativos con →. Título con palabra clave en dorado (`<em className="text-accent">`); hay reset global `em { font-style: normal }` (sin itálicas).
- Toda la UI lee/escribe vía el contrato `DataStore`. El fallback `LocalDataStore` (sin `VITE_API_URL`) **nunca se rompe**.
- Preferí tokens (`--t-*` + `@theme inline`) sobre hex/radios sueltos cuando exista equivalente.

> Arquitectura: la app es una **PWA responsive full-viewport** (header sticky `max-w-6xl`, nav desktop `lg:flex`, bottom-nav `md:hidden`). El phone-frame 390px / status-bar de los mockups es chrome del board de presentación — **no** se replica.
