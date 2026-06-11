# CCM · Córdoba Corazón de Moda — Plataforma (demo Fase 0)

PWA oficial de CCM 2026 (14ª Edición). Demo de validación: 100% frontend, sin backend, desplegada en GitHub Pages.

**En vivo:** https://soyalantapia.github.io/ccm-app/
**Admin:** https://soyalantapia.github.io/ccm-app/admin · clave `ccm2026`

## Correr local

```bash
npm install
npm run dev        # http://localhost:5173/ccm-app/
```

## Deployar

```bash
npm run deploy     # build + push a la rama gh-pages → publica en la URL de Pages
```

(Ver `DECISIONS.md` #6 para activar el deploy por GitHub Actions cuando se autorice el scope `workflow`.)

## Cambiar cosas frecuentes

| Qué | Dónde |
|---|---|
| Colores / radios del tema | Admin → Configuración → Tema (en vivo), o defaults en `src/index.css` (`--t-*`) |
| Links de pago de Mercado Pago | Admin → Entradas y órdenes (por plan), o `src/config/plans.ts` |
| Precios VIP | Ídem anterior |
| Clave del admin | `src/config/index.ts` → `adminKey` |
| Videos de YouTube | `src/data/seed/contents.ts` (IDs de YouTube) |
| Logo / íconos PWA | `scripts/make-icons.mjs` → `node scripts/make-icons.mjs` |
| Datos del evento, bloques, cupos | `src/data/seed/events.ts` / `blocks.ts` |
| Sponsors y creatividades | `src/data/seed/sponsors.ts` |

## Demo: el momento "en vivo"

1. Abrí la app en una pestaña y `/admin` (Dashboard) en otra.
2. Inscribite, descargá una foto, iniciá una compra VIP en la primera.
3. El dashboard se mueve **en vivo** (bus interno + evento `storage`, sin backend).
4. Admin → Configuración → Tema: cambiá el acento y mirá las dos pestañas retematizarse al instante.

## Arquitectura en 30 segundos

- **UI → `DataStore` → (seed estático + localStorage)**. La interfaz está en `src/data/store/DataStore.ts`; Fase 1 enchufa Supabase/backend implementándola, sin tocar pantallas.
- Identidad sin contraseñas: el dispositivo es la cuenta; los datos se piden justo a tiempo (`requireProfile`).
- Tracking first-party de cada interacción (`store.track`, taxonomía PRD §13).
- Theming 100% por tokens CSS (`--t-*`): cambiar uno retematiza toda la app.

Más detalle: `CLAUDE.md` (convenciones), `DESIGN.md` (sistema de diseño), `DECISIONS.md` (decisiones y supuestos), `docs/PRD.md` (producto).
