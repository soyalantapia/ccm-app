# PRD — Plataforma Córdoba Corazón de Moda (CCM)
**Versión 1.1 — 11/06/2026**
**Fuentes:** Reunión 1 (comercial) + Reunión 2 (producto) + deck comercial "CCM 2026 · 14ª Edición" (PDF) + página oficial en Tikealo + formulario real "Camino a CCM 2026" (Google Forms) + definiciones de Alan Tapia (11/06).

---

## 0. Instrucciones para Claude Code

1. Este documento es la fuente de verdad. Construir por fases (Sección 16). La **Fase 0 (demo)** se presenta el **viernes 12/06/2026** y su objetivo es **validar la idea** ante CCM.
2. **El proyecto se construye 100% con Claude Code.** El stack final lo elegís vos, bajo las **restricciones duras de la Sección 4.1** (la principal: deploy estático en **GitHub Pages**, cuenta personal de Alan Tapia).
3. Etiquetas **[PENDIENTE]** = decisión no confirmada; usar el **[SUPUESTO]** indicado y dejarlo configurable. No bloquean.
4. UI en **español (Argentina)**, con voseo ("Registrate", "Inscribite"). Código, tablas y variables en inglés.
5. **Diseño disruptivo, no genérico**: tiene que verse distinto a una app template. Dirección de diseño en 4.3. Todo el theming por **tokens centralizados**: cambiar un color en un solo lugar retematiza toda la app (requisito explícito de Alan).
6. **Sin contraseñas para usuarios finales.** Identidad por dispositivo + pedido de datos justo a tiempo (Sección 7). El admin sí tiene auth real.
7. Todo video es **embed de YouTube** (los videos siempre van a estar colgados ahí). Nunca redirigir afuera: player embebido.
8. Toda métrica se guarda **first-party en base de datos propia**. El dato propio es objetivo central del negocio.

---

## 1. Visión y objetivos de negocio

CCM se posiciona como "el Ecosistema de Negocios y Tendencias más influyente del interior del país" (deck 2026). 14ª edición consecutiva, 19-20 de septiembre de 2026, Hotel Quinto Centenario (Duarte Quirós 1300, Córdoba), 9 a 21 hs. Dirección artística: Néstor Moio. Datos del deck: **audiencia calificada +18.000** (70% mujeres, +30 años, ABC1/clase media-alta), **250+ unidades de negocio**, **+100 stands interactivos**, **base de datos proyectada de 20.000 registrados**, +10 charlas temáticas, masterclasses de 45', art shows y activaciones en vivo, Cóctel de Negocios B2B el viernes (Inner Circle), Hospitality premium ambas jornadas, Premios Internacionales (+100 premiados), y dos galas pagas: **Night VIP + Desfile de las Estrellas** (sáb 19, 19-21 hs) y **Sunset VIP + Desfile Internacional** (dom 20, 18-20 hs). Declarado de beneplácito por el Concejo Deliberante de Córdoba y de interés general, cultural y turístico por la Legislatura provincial. Entrada general **gratuita con inscripción previa obligatoria** ("sin inscripción no se ingresa"), cupos limitados, estacionamiento sin cargo en Shopping Nuevo Centro.

Hoy no tienen sitio web (se dio de baja el año pasado); el contenido vive disperso (capacitaciones en una plataforma externa, videos en YouTube, fotos en Drive, convocatorias por historia de IG + Google Form) y la operación es manual. El deck ya **vende a sponsors** tres promesas tecnológicas que esta plataforma debe cumplir: (1) *Lead Generation en tiempo real* con tótems QR en cada espacio, (2) *Estrategia post-evento* con mailing masivo segmentado y audiencias para retargeting en Meta/Google, (3) *Reporte Técnico de Impacto* entregado a cada sponsor al cierre — "todo se mide".

Objetivos de la plataforma:
1. **Comunidad activa todo el año** (hoy: un mes antes y después, luego "se para hasta el año que viene").
2. **Monetización por sponsors en cada punto de contacto** (rechazan comisiones; venden espacios medibles, con **exclusividad por rubro** como estructura comercial declarada en el deck).
3. **Datos propios y trazabilidad total** ("se acaba la discusión de si me cree o no me cree").
4. **Centralizar el contenido** embebido, sin que el usuario salga de la plataforma.
5. **Automatizar lo manual** (convocatorias, selección, invitaciones, fotos, portfolios).
6. **Plataforma encapsulada y replicable** (Mendoza/Tucumán/Costa Rica/Dubai; dos temporadas desde 2027) → multi-tenant desde el modelo de datos.

---

## 2. Decisiones de producto confirmadas

| # | Decisión | Fuente | Implicancia técnica |
|---|----------|--------|---------------------|
| D1 | La plataforma es una **PWA** instalable, perfecta en navegador de cualquier dispositivo; empaquetable a App Store/Play Store más adelante | Alan (11/06) + Reunión 2 | Manifest + service worker + offline shell; TWA/PWABuilder en fase 3 |
| D2 | La PWA **es la landing oficial** (no existe web) | Reunión 2 | Superficie pública con SEO (prerender de rutas públicas) |
| D3 | Contenido **embebido sin salir**; videos **siempre YouTube** | Reunión 2 + Alan (11/06) | Player de YouTube embebido inline/modal |
| D4 | **Inscripción por bloque/charla con cupo** y estado "se llenó" | Ambas reuniones | event_blocks con capacidad y lista de espera |
| D5 | **Fotos con banner de sponsor antes de descargar**, datos del usuario requeridos | Ambas reuniones | Galería + interstitial + tracking |
| D6 | **Newsletter con tracking** y **envío en tandas** | Reunión 2 | Motor por lotes + eventos apertura/clic |
| D7 | **Validación humana asistida** + envío automático al aceptar | Reunión 1 | Cola de postulaciones + score sugerido + automatización |
| D8 | **Convocatorias con link público** (reemplaza historia IG + Google Form) | Reunión 2 + form real | Form builder; plantilla inicial = campos del form "Camino a CCM" (10.3) |
| D9 | **Catálogo público de personas con portfolio** (reemplaza el Drive) | Reunión 2 + Alan (11/06) | Directorio tipo catálogo: producto ↔ autor (6.4) |
| D10 | **QR personal** como acreditación + registro por sala | Ambas reuniones | QR firmado + scanner staff |
| D11 | **QR por stand / tótems QR** para lead gen en tiempo real | Reunión 2 + deck (promesa a sponsors) | stands + scans bidireccionales |
| D12 | **Mapas interactivos con píxel del sponsor** | Reunión 2 (caso Maipú) | Página de mapa por sponsor con su píxel |
| D13 | **Gamificación con puntos y misiones** | Reunión 2 | Misiones + ledger + ranking + premios |
| D14 | **Activaciones de marca** (ruleta, encuestas) con consent por activación | Reunión 2 | Builder + leads exportables solo con consent |
| D15 | **Capacitaciones de venta** para emergentes | Reunión 2 | Tipo de evento + categoría de contenido |
| D16 | **Eventos previos pagos** (meriendas, Caminos con inversión) | Reunión 2 + form real ("estructura de inversión") | Eventos con precio |
| D17 | **Streaming/podcast en vivo** embebido + clips | Reunión 2 | Módulo EN VIVO (YouTube Live embed) |
| D18 | Datos **nunca crudos a sponsors**; solo agregados o leads con consent explícito | Reunión 1 | Permisos duros |
| D19 | **Compra de entradas dentro de la plataforma**: el usuario elige plan y se lo **redirige a Mercado Pago** | Alan (11/06) | Página /entradas con planes → links de pago MP; Tikealo queda como referencia de planes |
| D20 | **Exclusividad de sponsors por rubro** | Reunión 1 + deck ("sponsors exclusivos por rubro") | Flag de exclusividad |
| D21 | **Deploy de la demo en GitHub Pages**, cuenta personal de Alan Tapia; el dominio es el de GitHub Pages | Alan (11/06) | Arquitectura 100% estática + backend-as-a-service client-side (4.1) |
| D22 | **Identidad sin contraseñas**: cuenta por dispositivo, datos pedidos justo a tiempo (nombre, email, profesión…), guardados en el teléfono y en la base; sin login/logout | Alan (11/06) | Auth anónima + progressive profiling (Sección 7) |
| D23 | **Theming por tokens a nivel masivo**: cambiar un valor cambia toda la app | Alan (11/06) | CSS variables / design tokens centralizados (4.3) |
| D24 | **Diseño disruptivo**, distinto a lo acostumbrado, muy bien pensado | Alan (11/06) | Dirección de diseño 4.3 |
| D25 | Registro pide **nombre, email, profesión y demás datos**, de forma progresiva | Alan (11/06) | Campos de perfil progresivo (7.2) |
| D26 | El **productor del evento es la agencia de Gastón** ("Contenido IA Mabel" figura como Produce en Tikealo) | Tikealo | Crédito "Produce" en footer/landing |
| D27 | Beneficios de registrarse: **sorteos, descuentos, beneficios antes/durante/después** | Tikealo (FAQ) | Módulo de beneficios comunicado en el registro |

---

## 3. Usuarios y roles

| Rol | Quién es | Cómo se obtiene | Acceso |
|-----|----------|-----------------|--------|
| Visitante | Cualquiera | — | Toda la superficie pública; al accionar (inscribirse, descargar, comprar) se convierte en usuario de dispositivo |
| Usuario (cuenta de dispositivo) | Público/asistente | Automática al primer uso; perfil se completa progresivamente | App completa, sin contraseña ni logout |
| Diseñador / Influencer / Artista / Empresario (verificados) | Protagonistas del ecosistema | Postulación + aceptación de CCM | Usuario + perfil público en el catálogo + misiones de su segmento |
| Expositor de stand | Atiende un stand | Alta de admin | "Mi stand": QR, leads, promos (fase 2) |
| Staff | Acreditación/salas | Alta de admin | Solo scanner de check-in |
| Sponsor | Marca auspiciante | Alta de admin | Fase 1-2: recibe reportes. Fase 3: panel de solo lectura |
| Admin (Validador / Editor / Superadmin) | Equipo CCM + equipo tech | Alta de superadmin | Panel según rol, **con auth real (email+contraseña)** — la regla "sin contraseñas" es solo para usuarios finales |

---

## 4. Arquitectura, stack y diseño

### 4.1 Restricciones duras (no negociables)
1. **Hosting estático en GitHub Pages** (cuenta personal de Alan Tapia, dominio `*.github.io`). Implica: sin servidor propio; SPA con routing compatible (truco `404.html` de redirección o HashRouter; configurar `base` path del repo); build estático.
2. **PWA real**: manifest, service worker, instalable con ícono y splash, funciona excelente en el navegador de cualquier dispositivo. Empaquetado para App Store / Play Store (TWA / PWABuilder) en fase 3.
3. **Datos y storage vía backend-as-a-service accesible desde el cliente** con reglas de seguridad por fila. Recomendado: **Supabase** (Postgres + Auth anónima + Storage + Realtime, free tier). Claves anónimas públicas + RLS estricta.
4. **Pagos sin backend**: links de pago de **Mercado Pago** por plan (creados en el panel de MP). Confirmación automática vía webhook recién en fase 1 (Supabase Edge Function); en la demo, la orden queda "redirigida a MP" y el admin la marca pagada.
5. **SEO de la superficie pública**: prerender/SSG de las rutas públicas en el build (la PWA es la única web del evento).
6. **Theming 100% por tokens** (4.3).

### 4.2 Stack recomendado (Claude Code decide el final respetando 4.1)
Vite + React + TypeScript + Tailwind (tokens vía CSS variables) + `vite-plugin-pwa` + React Router (estrategia GH Pages) + Supabase (DB, auth anónima, storage) + prerender de rutas públicas (vite-ssg o equivalente) + YouTube IFrame API para embeds + librería QR (generación y lectura por cámara).

### 4.3 Dirección de diseño (derivada del deck CCM 2026; ajustable con el manual de marca)
- **Estética editorial de lujo**, tipo revista de moda: fondo **marfil/crema**, tinta **negro profundo**, acento **dorado/mostaza**, bloques de contraste en **azul noche**. Serif display elegante para títulos (estilo editorial: Fraunces/Playfair) + sans limpia para UI (Inter/Archivo). Mucho aire, grillas asimétricas, fotografía protagonista, microinteracciones sutiles. Nada que parezca template de Bootstrap/Material.
- **Tokens centralizados** (`--bg`, `--ink`, `--accent`, `--contrast`, familia tipográfica, radios, spacing): cambiar un token retematiza todo (D23). El tema es un objeto por tenant (15).
- Tono de los textos: el del evento ("Vení con tu mejor LOOK", voseo, 🖤 con moderación).

---

## 5. Mapa de navegación

```
SUPERFICIE PÚBLICA (sin login — es la landing oficial)
├── /                      Landing del evento
├── /entradas              Planes de entrada → Mercado Pago (D19)
├── /eventos               Principal + Caminos a CCM + capacitaciones
│   └── /eventos/[slug]    Ficha con grilla e inscripción
├── /agenda                Grilla del evento principal
├── /catalogo              Catálogo de personas (producto ↔ autor)
│   └── /p/[slug]          Perfil/portfolio
├── /contenido             Videos (YouTube) · notas · capacitaciones · newsletters · clips
├── /en-vivo               Streaming embebido (cuando hay transmisión)
├── /fotos                 Galerías por evento
├── /c/[convocatoria]      Formulario público de postulación (link para IG)
├── /sponsors              Por qué sponsorear + contacto
└── /terminos  /privacidad

APP DE USUARIO (misma PWA; sin login) — bottom nav de 5
├── Inicio (feed)
├── Eventos
├── Mi QR (centro)
├── Fotos
└── Perfil (datos progresivos · puntos · notificaciones · networking · mapa)

PANEL ADMIN (/admin, auth real) — sidebar
Dashboard · Eventos · Convocatorias · Postulaciones · Personas · Contenido ·
Newsletters · Fotos · Sponsors y Publicidad · Activaciones · Gamificación ·
Comunicaciones · Entradas/Órdenes · Configuración
```

---

## 6. Superficie pública — pantalla por pantalla

### 6.1 Landing `/`
1. **Header:** logo CCM, nav, CTA primario "Registrate gratis" (crea inscripción al evento principal vía flujo sin fricción) + "Entradas VIP" → `/entradas`.
2. **Hero editorial:** "CCM 2026 · 14ª Edición — El Ecosistema de Negocios y Tendencias más influyente del interior del país" · 19 y 20 de septiembre · Hotel Quinto Centenario, Córdoba · 9 a 21 hs · countdown.
3. **Cifras:** +18.000 asistentes · 70% mujeres +30 ABC1 · 250+ unidades de negocio · +100 stands interactivos · 7 plataformas.
4. **Las 7 plataformas** con la descripción real del deck: Moda (pasarelas, el núcleo creativo), Belleza (cosmética, skincare, demostraciones en vivo), Turismo (destinos y experiencias), Arte (intervenciones y galerías en vivo), Gastronomía "Sabores CCM" (de autor, bodegas, bebidas premium), Tecnología (IA e innovación para la industria creativa), Sustentabilidad (economía circular, el eje transversal).
5. **Experiencias de gala:** Night VIP + Desfile de las Estrellas (sáb 19-21 hs) y Sunset VIP + Desfile Internacional (dom 18-20 hs) → `/entradas`.
6. **Próximos Caminos a CCM** (18/06 y 30/06) con CTA "Quiero participar" → `/c/...`.
7. **Premios Internacionales** (+100 premiados; nombres del deck como social proof).
8. **Catálogo destacado** (carrusel de protagonistas) → `/catalogo`.
9. **Contenido reciente** (últimos videos YouTube embebidos en modal).
10. **Sponsors por nivel** + "Quiero ser sponsor" → `/sponsors`. Slot publicitario S2 intercalado.
11. **FAQ** (los 11 ítems reales de Tikealo: beneficios de registrarse, entrada gratuita con inscripción obligatoria, cupos limitados, estacionamiento, networking/coworking, etc.).
12. Footer: crédito **Produce** (agencia), IG @cordobacorazondemoda, legales.

### 6.2 Entradas `/entradas` (NUEVO, en demo)
Comparativa de planes en cards editoriales:
- **Entrada General** — Gratis con inscripción previa obligatoria. Incluye: las 7 plataformas, stands, pasarelas, workshops, networking y coworking. CTA "Registrarme gratis" → flujo sin fricción (pide nombre, email, profesión…) → genera QR.
- **Night VIP · Desfile de las Estrellas** — sáb 19, 19-21 hs. Precio [PENDIENTE]. CTA "Comprar" → registra la orden → **redirige al link de pago de Mercado Pago** del plan.
- **Sunset VIP · Desfile Internacional** — dom 20, 18-20 hs. Precio [PENDIENTE]. Ídem.
Estado post-redirección: "Estamos confirmando tu pago" (la orden queda `redirigida_mp`; confirmación manual del admin en demo, webhook en fase 1). Los links de MP son configurables por plan desde el admin.

### 6.3 Eventos y agenda
Igual a v1.0: lista con filtros por tipo y segmento; ficha con lugar + "Cómo llegar" (Google Maps), cupo y estados, grilla de bloques con inscripción individual, speakers, sponsors, galería si ya pasó. `/agenda`: grilla del principal por día/sala/plataforma, con inscripción por bloque y .ics.

### 6.4 Catálogo `/catalogo` y perfil `/p/[slug]` (redefinido por Alan)
- **Catálogo tipo lookbook**: grilla editorial de cards con TODAS las personas del ecosistema (diseñadores, artistas, influencers, marcas), filtros por plataforma/rol/ciudad, búsqueda.
- Al tocar una card se abre la **vista doble producto ↔ autor**: primero el trabajo (portfolio en grande, navegable como catálogo de producto) y, en la misma vista, el autor (foto, bio, rol verificado, ciudad, redes, "participa en"). Desde cualquier pieza del portfolio se llega al autor y desde el autor a todas sus piezas.
- Reemplaza el Drive: es lo que se abre cuando te cruzás a alguien en un evento.

### 6.5 Contenido `/contenido`
Tabs Videos / Notas / Capacitaciones / Newsletters / Clips. **Todos los videos son embeds de YouTube** en modal/inline (D3). Sponsor "presentado por" opcional (S4). Newsletters archivadas legibles.

### 6.6 En vivo `/en-vivo`
YouTube Live embebido cuando hay transmisión; agenda del día; sponsor del streaming; clips después en `/contenido`.

### 6.7 Fotos `/fotos`
Galerías por evento → grilla lazy → foto en modal con **banner del sponsor (S3)** → "Descargar" pide los datos faltantes del perfil (sin contraseña) → descarga + tracking. [PENDIENTE búsqueda de "mi foto": MVP por galería + favoritos.]

### 6.8 Convocatorias `/c/[slug]`
Form público para compartir en historia de IG. **Plantilla seed = formulario real "Camino a CCM 2026"** (campos exactos en 10.3), con su tono ("Vení con tu mejor LOOK 🖤", preinscripción + confirmación del equipo, máx. 1 acompañante).

### 6.9 Sponsors `/sponsors`
Estructura del deck: "Cada plataforma · un mercado propio" — sponsors exclusivos por rubro, stands y activaciones, charlas y masterclasses, experiencias de marca, base segmentada por plataforma. Las 3 promesas tecnológicas (lead gen QR en tiempo real, estrategia post-evento, Reporte Técnico de Impacto) presentadas como features de la plataforma. Form de contacto comercial.

### 6.10 Legales
Editables desde el panel.

---

## 7. Identidad sin fricción (reemplaza login/registro clásico) — D22

**Principio:** nadie crea cuenta, nadie pone contraseña, nadie cierra sesión. Cada dispositivo ES una cuenta; los datos se piden **justo cuando una acción los necesita** y quedan guardados en el teléfono y en la base.

1. **Primera visita:** se crea silenciosamente una identidad anónima de dispositivo (Supabase `signInAnonymously()` + persistencia local). El usuario navega todo sin fricción.
2. **Pedido justo a tiempo (progressive profiling):** cuando una acción requiere datos, se abre un sheet con SOLO los campos faltantes:
   - Inscribirse a evento/bloque o registrarse gratis → nombre y apellido, email, profesión.
   - Comprar entrada VIP → + teléfono.
   - Descargar foto → nombre y email (si aún no los dio).
   - Postularse a una convocatoria → la ficha completa de la convocatoria (10.3).
   Copy del sheet: "Para inscribirte necesitamos estos datos" — una sola vez; las próximas acciones ya no preguntan.
3. **Persistencia:** perfil guardado en el dispositivo (local) y en la DB, asociado a la identidad anónima. Sin logout. Volver a la app = seguir siendo vos.
4. **Consentimientos** (checkboxes con timestamp) en el primer pedido de datos: TyC+Privacidad (obligatorio), novedades CCM (opt-in), beneficios de sponsors (opt-in). Mensaje de beneficios de registrarse (D27: sorteos, descuentos, antes/durante/después).
5. **Unificación entre dispositivos [Fase 1]:** el email es la clave; "Recuperá tu perfil en otro teléfono" envía un magic link que mergea identidades. [SUPUESTO demo: un dispositivo = un perfil.]
6. **Admin:** `/admin` con email+contraseña reales (Supabase Auth). [Demo: un usuario admin seed; PENDIENTE definir credenciales.]

Campos del perfil progresivo: nombre y apellido, email, profesión, teléfono, DNI (solo cuando una convocatoria/compra lo exige), ciudad, Instagram, intereses por plataforma. Cada campo registra cuándo y en qué acción se capturó (oro para segmentación).

---

## 8. App de usuario — pestaña por pestaña

Bottom nav: **Inicio · Eventos · Mi QR · Fotos · Perfil**.

### 8.1 Inicio (feed)
EN VIVO (si hay) → Tus próximos eventos (con QR rápido) → Misiones activas → Lo nuevo (videos YouTube/notas/clips) → Slot S2 cada 4-5 ítems → Próximos Caminos. Pull-to-refresh.

### 8.2 Eventos
Mis eventos / Explorar. Estados personales por evento y bloque ("Ya estás inscripto", "Bloque completo — lista de espera"), cancelar (corre la lista), .ics, recordatorios push.

### 8.3 Mi QR
QR personal grande (cacheado offline), nombre, tipo de acreditación; inscripciones a bloques con horario y sala; **mis entradas VIP** con estado de la orden MP (pendiente/confirmada); slot S6 discreto.

### 8.4 Fotos
Galerías + Favoritos + Mis descargas + push "📸 Ya están las fotos de [evento]".

### 8.5 Perfil
Datos progresivos (editar/completar), puntos + ranking + canjes, postulaciones y sus estados, notificaciones, consents, mapa del evento, networking.

### 8.6 Networking / Asistentes
Lista opt-in de confirmados por evento, filtros por rol/rubro/ciudad → perfil del catálogo. Fase 2: "Conectar" con doble opt-in. Fase 3: mensajería.

### 8.7 Juegos y puntos
Misiones (validación automática/código/evidencia/manual; ej. real: "comentá la publicación de X, el que más puntos junta gana"), ranking, premios canjeables con código/QR.

### 8.8 Mapa del evento
Plano por salas/stands, buscador, ficha de stand; **mapas patrocinados con píxel del sponsor** (D12); "Cómo llegar".

### 8.9 Push
Recordatorios, fotos listas, inscripción abierta, nueva misión, EN VIVO, resultado de postulación.

---

## 9. Vistas extra de roles verificados

Diseñador/Artista/Influencer: edición de perfil y portfolio del catálogo, estados de postulación, misiones del segmento; fase 2: métricas propias (vistas de su perfil). Influencer: vista "Campañas" con puntos (digitaliza lo que ya hacen a mano). Expositor (fase 2): "Mi stand" con QR, visitas y leads.

---

## 10. Panel de administración — sección por sección

### 10.1 Dashboard
Registrados (totales/nuevos/por rol/por plataforma de interés), inscripciones y ocupación de bloques, check-ins, **órdenes de entradas por plan y estado**, descargas de fotos, impresiones/clics por sponsor, aperturas/clics de newsletters, DAU/WAU, top contenido. Export CSV. Es el argumento de venta: números propios.

### 10.2 Eventos
CRUD (tipo: Principal / Camino / Capacitación / Encuentro previo; fechas, lugar+geo, descripción, portada, segmentos, cupo, **precio opcional**, visibilidad, lista de asistentes on/off, sponsors). Bloques (título, tipo, día, horario, sala, cupo, speakers). Inscriptos con acciones masivas. Acceso a check-in y encuesta post.

### 10.3 Convocatorias (form builder)
Builder con tipos de campo (texto corto/largo, número, select, link, archivo). Link público `/c/[slug]` + QR descargable. **Plantilla seed "Camino a CCM 2026"** con los campos reales del formulario vigente:
Tu historia* (texto largo) · Nombre y Apellido* · DNI* · Teléfono para confirmar invitación* · Email* · Link de Instagram · Portfolio · ¿Venís solo o con acompañante?* (Solo / Con acompañante, máx. 1) · Acompañante (nombre completo + DNI) · ¿Participaste de algún desfile?* (Sí/No) · Algo más que quieras que sepamos de vos.
Reglas heredadas del flujo real: la respuesta deja a la persona **preinscripta**; el equipo confirma el lugar (→ 10.4).

### 10.4 Postulaciones
Cola filtrable; ficha con datos + portfolio + redes clickeables; **score IA sugerido [Fase 1]** con criterios configurables (ciudad, seguidores, rubro, completitud); decisión humana siempre; al aceptar: mail automático de invitación con ubicación + botón WhatsApp `wa.me` con plantilla; historial auditado.

### 10.5 Personas (CRM)
Segmentos guardados (rol, ciudad, profesión, intereses por plataforma, eventos, consents, puntos). Ficha 360 (eventos, bloques, stands, descargas, clics, órdenes, puntos, postulaciones, origen de cada dato). Export CSV solo admin; D18 inviolable. Habilita las promesas del deck: base segmentada por plataforma y perfil de consumo; audiencias para retargeting se generan como **exports agregados/hashed [Fase 2, con revisión legal]**.

### 10.6 Contenido
CRUD: video (embed YouTube), nota (editor rich), capacitación, clip; categoría/plataforma; exclusividad (público/registrados/rol/VIP); sponsor "presentado por"; programación.

### 10.7 Newsletters
Editor por bloques (incluye bloque "video YouTube" con thumbnail+play), audiencia por segmento, **envío en tandas configurables**, métricas por tanda (entregas, aperturas, clics, clics al video), reenvío a no-abiertos, archivo público.

### 10.8 Fotos
Galería (evento + sponsor S3 + portada), upload masivo drag&drop con thumbnails, orden, publicar, métricas, botón "Notificar: fotos listas".

### 10.9 Sponsors y Publicidad
Sponsors (logo, rubro, nivel, **exclusividad de rubro** con alerta, contacto, píxel). Campañas (vigencia, segmentos, creatividades por slot). Motor: segmento + vigencia + frequency cap + prioridad por nivel. **Reporte Técnico de Impacto por sponsor** (impresiones, clics, CTR, descargas bajo su banner, leads con consent, alcance) export PDF/CSV — cumple literalmente la promesa del deck.

### 10.10 Activaciones
Ruleta digital (premios+stock+probabilidades, campos a pedir, **consent específico de compartir datos con ESE sponsor**, QR de stand, límite por usuario) y encuestas con premio. Export de leads solo con consent.

### 10.11 Gamificación
Misiones CRUD, cola de validación de evidencias, ranking, ajustes auditados, premios y canjes.

### 10.12 Comunicaciones
Push composer (segmento, programación, métricas) y plantillas WhatsApp con variables → links `wa.me` (fase 1) / API (fase 2).

### 10.13 Check-in (staff)
Scanner por cámara, modo Entrada/Bloque/Stand, feedback verde/rojo, contador en vivo, **cola offline** con sincronización.

### 10.14 Encuestas
Builder (1-10, opciones, texto), disparo post-evento, resultados y export.

### 10.15 Entradas y órdenes (NUEVO)
CRUD de planes (nombre, precio, descripción, cupo, **link de pago de Mercado Pago**), tabla de órdenes (usuario, plan, estado: `iniciada` → `redirigida_mp` → `confirmada`/`cancelada`), confirmación manual en demo, conciliación por webhook en fase 1.

### 10.16 Configuración
Admins y roles; **branding por tenant (tokens)**; legales editables; integraciones (claves email/push/MP); tenants futuros.

---

## 11. Sistema de publicidad — slots

| ID | Slot | Ubicación | Tracking |
|----|------|-----------|----------|
| S1 | Interstitial de apertura (máx 1/día, skippeable 3s) | Apertura de la PWA | impresión, clic, cierre |
| S2 | Banner nativo de feed | Inicio/landing, cada 4-5 ítems | impresión, clic |
| S3 | Pre-descarga de foto | Modal de foto | impresión, clic, descarga asociada |
| S4 | Contenido patrocinado ("presentado por") | Videos/notas/streaming | impresión, clic, plays |
| S5 | Newsletter | Header/footer | apertura, clic |
| S6 | Pantalla Mi QR | Logo discreto | impresión |
| S7 | Mapa patrocinado | Mapa del evento + píxel propio | impresión, clic, píxel |
| S8 | Evento/bloque patrocinado | Fichas | impresión, clic |
| S9 | Activación | Ruleta/encuesta | participaciones, leads con consent |

Reglas: segmento, vigencia, frequency cap, prioridad por nivel, exclusividad por rubro. Todo persiste en `ad_events`.

---

## 12. Flujo completo de fotos

Admin crea galería (+sponsor S3) → upload masivo → CDN/thumbnails → publicar → push/email → usuario navega → abre foto (**impresión S3**) → "Descargar" → si faltan datos, sheet sin fricción (nombre, email) → descarga original → `photo_download` con usuario+foto+galería+sponsor → métricas en dashboard y reporte del sponsor. Cada descarga = impresión medible + perfil capturado (la promesa "cada interacción se convierte en un perfil capturado al instante").

---

## 13. Taxonomía de tracking (`analytics_events`)

user_created (dispositivo) · profile_field_captured (campo, acción origen) · application_submitted/_accepted/_rejected · event_view/block_view · registration_created/_cancelled/waitlist_joined · **ticket_order_created/_redirected_mp/_confirmed** · checkin (punto) · stand_visit (origen) · content_view/video_play/video_complete · live_view · photo_view/_favorite/_download · ad_impression/ad_click (slot, creative) · newsletter_sent/_open/_click (tanda, url) · push_sent/_open · mission_completed/points_earned/reward_redeemed · activation_entry (consent) · survey_response · profile_view.
Todos con user_id (anónimo o perfilado), tenant_id, session_id, ts.

**Implementado en Fase 0 (reconciliación con el código).** Además de los de arriba, la demo emite: `page_view` (ruta), `qr_view` (Mi QR), `stand_view` (= `stand_visit`; en código se llama `stand_view`) + `stand_lead_captured` (lead del stand, con sponsorId), `sponsor_lead` (form "Quiero ser sponsor"), `calendar_export` (.ics), `sponsor_report_generated`, `onboarding_completed`, y los de instalación PWA `pwa_prompt_shown/_dismissed/_install_accepted`. Ad slots vigentes: S1 (splash), S2 (feed), S3 (pre-descarga), S4 (video patrocinado), S6 (Mi QR). Pendiente: `video_complete` (hoy solo `video_play`); `waitlist_joined`, `checkin`, `live_view`, newsletter/push/missions/surveys llegan en fases siguientes.

---

## 14. Integraciones

| Sistema | Fase | Detalle |
|---------|------|---------|
| GitHub Pages | 0 | Hosting estático del build; CI con GitHub Actions (push → deploy) |
| Supabase | 0 | DB + auth anónima + storage + RLS, client-side |
| Mercado Pago | 0 → 1 | Demo: **links de pago por plan** [PENDIENTE: crearlos]. Fase 1: webhook de confirmación vía Edge Function |
| YouTube | 0 | Único origen de video, siempre embebido (D3) |
| Email (Resend/Brevo) | 1 | Transaccionales + newsletters por tandas con webhooks |
| Web Push | 1 | Notificaciones PWA |
| WhatsApp | 1 → 2 | `wa.me` con plantillas → Business API [PENDIENTE] |
| Google Maps | 0 | Deep links "Cómo llegar" (Duarte Quirós 1300) |
| Píxeles de sponsors | 2 | Contenedor por mapa patrocinado |
| Tikealo | — | Referencia de planes/FAQ; convive como ticketera externa si CCM lo pide [PENDIENTE] |
| Eventbrite | — | [PENDIENTE: Alan va a pasar el link; incorporar como fuente de datos del evento] |

---

## 15. Modelo de datos (entidades principales)

tenants (branding tokens, dominio) · users (identidad anónima de dispositivo; email/nombre/profesión/teléfono/DNI/ciudad/IG nullable + captured_at por campo; consents jsonb; roles[]) · profiles (catálogo: tipo, bio, rubro, redes, portfolio[], estado, slug) · events (tipo, fechas, lugar, geo, segmentos, cupo, precio?, sponsors) · event_blocks (sala, horario, cupo, speakers) · registrations (user, event, block?, estado, qr_token, opt_in_visible) · checkins · convocatorias (campos jsonb schema, vigencia, slug) · applications (datos jsonb, score_ia, estado, revisor) · **ticket_plans (nombre, precio, descripción, cupo, mp_link)** · **ticket_orders (user, plan, estado, ts)** · stands (qr_token, sponsor?) · stand_visits · sponsors (rubro, nivel, exclusividad, píxel) · ad_campaigns/ad_creatives/ad_events · galleries/photos/photo_events · contents (tipo, youtube_url, exclusividad, sponsor) · newsletters/newsletter_events · missions/mission_completions/points_ledger/rewards/redemptions · activations/activation_entries (consent_compartir) · surveys/survey_responses · notifications · analytics_events · admin_audit_log.

---

## 16. Fases y orden de construcción

### Fase 0 — Demo (viernes 12/06/2026, deploy en GitHub Pages)
Objetivo: **validar la idea**. Alcance:
1. PWA instalable con tema editorial CCM (4.3) y tokens funcionando (demostrar en vivo: cambiar el acento y que toda la app cambie).
2. Landing completa con datos reales (deck + Tikealo: cifras, plataformas, FAQ, galas).
3. **Identidad sin fricción** + progressive profiling (D22).
4. **/entradas** con los 3 planes → redirección a Mercado Pago (links placeholder si no están los reales) + orden registrada.
5. Evento Camino a CCM (18/06) con bloques, cupos e inscripción.
6. **Catálogo producto↔autor** con 8-12 perfiles seed con portfolio.
7. Galería de fotos con banner sponsor → descarga con captura de datos.
8. Contenido: 2-3 videos de YouTube embebidos.
9. Panel admin (auth real, 1 usuario): dashboard con métricas en vivo, eventos, inscriptos, postulaciones (plantilla "Camino a CCM" real), planes/órdenes.
**Criterio de aceptación:** desde su teléfono, con el link de GitHub Pages, Gastón puede instalar la app, registrarse sin contraseña, inscribirse a un bloque, ver "completo", iniciar la compra de una Night VIP llegando a MP, recorrer el catálogo, descargar una foto pasando por el banner — y Alan muestra en el admin cómo cada acción apareció medida.

### Fase 1 — Operación real de Caminos (18/06 y 30/06)
Convocatorias completas + score IA + automatización de invitaciones + `wa.me` · perfiles verificados editando su catálogo · lista de asistentes opt-in · push · contenido y newsletter v1 con tandas y tracking · webhook MP (Edge Function) · merge de perfil por email (magic link) · check-in QR de entrada.
**Criterio:** el Camino del 30/06 se convoca, selecciona, invita, cobra (si aplica), ejecuta y mide 100% en la plataforma.

### Fase 2 — Evento principal (19-20/09)
Grilla completa a escala · check-in multi-punto offline · mapa interactivo + stands + tótems QR · mapas con píxel · fotos masivas · misiones/puntos/premios · ruleta y encuestas con premio · EN VIVO + clips · encuesta post · **Reporte Técnico de Impacto** por sponsor · vista expositor.

### Fase 3 — Año-round y expansión (2027)
Tarjeta CCM de beneficios · panel sponsor self-service · networking 1:1 y mensajería · revista digital · checkout MP nativo completo · audiencias de retargeting (con marco legal) · empaquetado App Store/Play Store (TWA/PWABuilder) · **multi-tenant operativo** (Mendoza CdM, dos temporadas) · EN.

---

## 17. Requisitos no funcionales

Mobile-first absoluto · LCP < 2,5 s en 4G (prerender de rutas públicas para SEO en GH Pages) · galerías lazy + thumbnails · QR y "mis inscripciones" offline · picos de ~20.000 usuarios el finde del evento · consents con timestamp y derecho de acceso/eliminación (Ley 25.326) · datos nunca crudos a terceros (D18) · QR firmados con expiración · rate limiting en forms públicos (a nivel Supabase) · RLS por rol y tenant · theming 100% por tokens · ES-AR con i18n-ready.

---

## 18. Pendientes (no bloquean; supuesto por defecto)

| Tema | Supuesto mientras tanto |
|------|--------------------------|
| Links de pago de Mercado Pago por plan + precios VIP | Links placeholder configurables desde el admin |
| Logo CCM en buena calidad + manual de marca | Tema 4.3 derivado del deck (marfil/negro/dorado) |
| Fotos reales de un evento pasado para la galería demo | Imágenes editoriales de moda libres de derechos |
| Link de Eventbrite (prometido por Alan) | Sin integrar hasta recibirlo |
| Nombre del repo / URL final en GitHub Pages | `ccm-app` bajo la cuenta de Alan Tapia |
| Credenciales del admin demo | Usuario seed `admin@ccm.demo` definido en el seed |
| Búsqueda de "mi foto" (¿reconocimiento facial?) | Galería + favoritos |
| Convivencia con Tikealo post-demo | Tikealo como referencia; venta nativa vía MP |
| WhatsApp Business API | Links `wa.me` con plantillas |
