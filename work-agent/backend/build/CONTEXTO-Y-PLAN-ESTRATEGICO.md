# Contexto a sumar + Plan estratégico

Qué le falta a la planificación para **construirse sola y bien**, y cómo secuenciar todo hacia el evento (19–20/09/2026). Acompaña a `PROMPT-MAESTRO.md` y `PROMPTS-POR-FASE.md`.

---

## Parte 1 — Contexto a sumar (para que el build no se trabe)

El plan está completo en el "qué". Lo que falta es **insumos** y **andamiaje**. Tres baldes:

### A. Insumos de negocio (los provee Gastón) — bloquean fases

Son las 🔶 del doc 11. Se cruzan con el mail que ya le mandaste. **Sin esto, la fase asociada queda en sandbox/TODO.**

| Insumo | Bloquea | Por qué |
|---|---|---|
| **Cuenta y credenciales de Mercado Pago** (a nombre de quién entra la plata) | C, D, F | Es el insumo de mayor impacto: sin la cuenta MP de prod, los 3 flujos de pago no salen de sandbox. |
| **¿Entradas por MP o siguen en Tikealo?** | C | Define una rama entera (checkout propio vs solo emitir QR). Ver doc 10 §4.bis. |
| **Precios reales** (5 planes de entrada + membresía) | C, D | Hoy varios `price` son `null` = no comprable. |
| **Niveles de la membresía** (binario `free/socio` o varios pagos) | D | Cambia el tipo `MembershipTier` y el modelo. |
| **Sponsors reales 2026** (nombres, niveles, exclusividad) | F, seed | Hoy son ficticios (Banco Distrito, etc.). |
| **Acceso al Drive de fotos + YouTube IDs reales** | E, seed | Para migrar el contenido real, no el de demo. |
| **Emails de los admins + rol de cada uno** (OWNER/EDITOR/STAFF/VIEWER) | G | Quién toca pagos, quién carga contenido, quién escanea en puerta. |
| **Modelo de acreditación** (QR por jornada/entrada; uno por persona/orden) | H | Define cardinalidad de `Ticket`. |

### B. Decisiones técnicas (las define Alan) — no bloquean, pero conviene cerrarlas

- **Dominio del API** (ej. `api.ccm.com.ar`) y si el front se queda en GitHub Pages → define `VITE_API_URL`, CORS, `notification_url` de MP y los magic links.
- **Tier de Railway** (¿servicio always-on para evitar cold start el día del evento?) y tier de Postgres.
- **Object storage:** Cloudflare R2 vs DigitalOcean Spaces (egress vs Railway ya DO-friendly).
- **Recuperación de identidad passwordless:** magic link por email vs código por WhatsApp → define qué dato de contacto es obligatorio antes de comprar.
- **Feature flags:** por env (re-build del front) vs `GET /config` runtime (apagado instantáneo). **Para pagos, runtime es muy recomendable** (rollback en caliente el día del evento).
- **Cifrado de PII en reposo** (Ley 25.326 de datos personales — email/dni/phone).

### C. Andamiaje del repo a CREAR (esto es "lo que más conviene sumar de contexto")

Cosas que **no existen todavía** y que hacen que el agente construya mejor y más rápido:

1. **`server/CLAUDE.md`** — un archivo de contexto persistente para el backend: convenciones (estructura de carpetas, naming, formato de errores, cómo se valida con zod, cómo se importan los tipos de `src/data/types.ts`, cómo correr migraciones y tests). Así el agente no re-deriva las reglas en cada sesión. *(Lo genera el agente en Fase 0; vos lo revisás.)*
2. **Entorno de staging en Railway** (servicio + Postgres + bucket de pruebas) con **MP en sandbox** — para probar cada fase sin tocar prod (doc 10 §11).
3. **Credenciales sandbox de Mercado Pago** + la **referencia de tarjetas de prueba** (aprobada/rechazada/pendiente) a mano. Es lo único que destraba empezar a programar pagos sin esperar la cuenta de prod de Gastón.
4. **Estrategia y harness de tests** decidida desde Fase 0: framework (ej. **Vitest + supertest**), una **Postgres de test** (container o DB efímera), y **fixtures/factories**. Crítico para los tests que el plan exige pero no detalla: **webhook MP** (firma + idempotencia) y **concurrencia del cupo**.
5. **`prisma/seed.ts`** que lee los `src/data/seed/*.ts` actuales (mismos tipos, cero traducción) y popula Postgres idempotente (doc 10 §10). Es el puente seed→prod.
6. **Contrato de API navegable:** generar una colección **Bruno/Postman** (o un `openapi.yaml`) a partir del doc 05. Acelera probar endpoints y sirve de fuente viva del contrato.
7. **Registro de decisiones vivo:** usar el doc 11 como **changelog de las 🔶** — cada vez que Gastón/Alan responde una, se anota la decisión y la fecha. Evita que el agente vuelva a preguntar lo ya resuelto.
8. **Proveedor de email transaccional** (Resend/Postmark) configurado — lo necesitan el OTP de admin (G) y, si va la rama Tikealo, la entrega del QR por email.
9. **Material de referencia a la mano** para el agente (linkear en `server/CLAUDE.md`): docs de **Mercado Pago Checkout Pro + webhooks**, **Prisma**, **Railway** (deploy + migrate en release), **zod**, **R2/Spaces** (presigned URLs), **Resend**.

---

## Parte 2 — Plan estratégico

### Camino crítico y dependencias

```
                 ┌─────────────────────────────────────────────┐
                 │  BLOQUEANTE #1: cuenta Mercado Pago (Gastón) │
                 └───────────────┬─────────────────────────────┘
                                 │ habilita
   0 ──► A ──► B ──┬──────────► C(pagos) ──► D(membresía) ──► F(publicidad)
                   │                                              │
                   └──► E(contenido) ───────────────────────────┘ │
                        ▲ necesita Drive/YouTube (Gastón)         │
                                                                  ▼
                                          G(admin) ──► H(acreditación en puerta)
                                                          ▲ camino crítico del DÍA del evento
```

**La jugada clave:** las fases **0, A, B y E** **no dependen de ninguna decisión de negocio de pago**. Se pueden construir **YA**, en paralelo a que Gastón destraba la cuenta de MP. Cuando MP esté, **C → D → F** salen rápido porque comparten un solo motor de pago. **G y H** van al final, pero **H (acreditación) es el entregable más crítico del día del evento** y necesita un ensayo real antes.

### Secuencia recomendada (con gates de decisión)

| Etapa | Fases | Gate que la habilita | Se puede empezar |
|---|---|---|---|
| **1. Cimientos** | 0, A | — (ninguno) | **Ahora** |
| **2. Corazón público** | B, E | Para el *contenido real* de E: Drive + YouTube (Gastón). La *estructura* de E no espera. | **Ahora** (estructura) |
| **3. Pagos** | C, D, F | **Cuenta MP + precios** (Gastón). Sandbox no espera; prod sí. | Sandbox ahora; prod tras MP |
| **4. Control** | G | Emails+roles de admins (Gastón/Alan) | Tras 2 |
| **5. Día del evento** | H | Modelo de acreditación + relevamiento de conectividad en puerta | Tras C/G; **ensayar antes del evento** |

### Hitos hacia atrás desde el evento (19–20/09/2026)

Trabajando con colchón (estimaciones de esfuerzo finas en el doc 12):

- **🎯 Evento: 19–20/09.**
- **~1–2 semanas antes (principio de septiembre): congelamiento.** Solo bugfixes. Ensayo de puerta (H) con varios escáneres, online y offline. Smoke de fallback.
- **~Fin de agosto: producción lista.** Las 8 fases corren contra prod; contenido real migrado (seed→prod); pagos en prod confirmados en MP real.
- **~Mediados de agosto: feature-complete en staging.** Las 8 fases pasan su "listo cuando" en staging con MP sandbox.
- **Cuanto antes: cimientos + corazón público (0, A, B, E-estructura)** — no esperan a nadie. **Empezar ya.**
- **Gate dinámico:** el bloque de pagos (C/D/F en prod) arranca el reloj recién cuando Gastón entrega la cuenta MP. **Cuanto más tarde llegue ese insumo, más comprime el cronograma** → es lo primero a destrabar.

### Quién hace qué

- **Alan + Claude Code:** construye, fase por fase, con el protocolo de verificación. Dueño del código y de las decisiones técnicas (balde B).
- **Gastón:** provee los insumos de negocio (balde A). **El más urgente: la cuenta de Mercado Pago.** El resto puede llegar escalonado, fase por fase.
- **(Opcional) un dev del equipo:** si entra, el `server/CLAUDE.md` + estos prompts son su onboarding.

### Postura de riesgo (cómo no romper nada con plata de por medio)

- **Phase-gated:** una fase por vez, no se avanza sin verde. El `HybridDataStore` aísla dominios.
- **Sandbox-first** en todo lo de pago; prod recién con la cuenta MP confirmada y los tests de webhook/idempotencia pasando.
- **Kill switch runtime** (`GET /config`) para apagar un dominio de pago en caliente sin re-deployear el front.
- **Fallback siempre vivo:** sin `VITE_API_URL`, la PWA vuelve a `LocalDataStore`. Si Railway se cae el día del evento, la app no muere (la acreditación offline de H es la pieza que sostiene la puerta).
- **El webhook es la única verdad del pago.** El cliente nunca confirma plata.

### Empezar mañana (3 pasos)

1. **Destrabar a Gastón:** pedir la **cuenta de Mercado Pago** (y arrancar precios/sponsors/Drive en paralelo). Es el insumo que más comprime el cronograma si se demora.
2. **Lanzar la `FASE 0`** con Claude Code (`PROMPT-MAESTRO.md` + el bloque `FASE 0`): `server/` con Express+Prisma+Postgres, `GET /api/v1/health`, `.env.example` canónico, path alias a `types.ts`, y el `server/CLAUDE.md`. Levantar **staging en Railway** + credenciales **sandbox de MP**.
3. **Encadenar `FASE A` y `FASE B`** (identidad + eventos/cupos): no dependen de ninguna decisión de negocio y validan la costura `RemoteDataStore` end-to-end antes de tocar dinero.
