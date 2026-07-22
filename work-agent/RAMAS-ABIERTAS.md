# Ramas abiertas — en qué estadio quedó cada una

**Fecha de este corte:** 22/07/2026, 16:50 · **main = `0a41973`** (en producción)

Este archivo existe porque la cola de PRs **miente**: casi todo entra a main por merge directo,
así que buscar trabajo pendiente ahí no devuelve nada. Lo que falta vive en ramas.

> Antes de retomar cualquiera: `git fetch origin`, leer la memoria del proyecto, y mirar los
> commits recientes de main. Este repo tuvo **cuatro colisiones** de sesiones paralelas arreglando
> el mismo bug por separado; una de ellas costó tirar horas de trabajo.

---

## 🟡 `feat/entradas-cortesia` — rebanada 1 de 4, lista pero congelada a propósito

**Tip:** `08e0b1c` · **respaldada en GitHub** · mergea limpio contra main · 4 archivos, +659/−0

### Qué hay
El modelo y el servicio de las entradas de cortesía que pidió Gastón: *«entrar a un lugar, poner
el mail de Alan y decirle dos entradas, y que a él le lleguen dos QR bonificados»*.

- `TicketGrant` + `GrantClaimCode` + `TicketOrder.grantedById`, migración `9_ticket_z_grant`.
- `server/src/services/grantService.ts`: crear, reclamar por los dos caminos, revocar con
  cancelación en cascada.
- 19 tests en `grantService.test.ts`, **validados por mutación**.
- Typecheck limpio; el server tira sólo los 3 errores `TS6059` preexistentes.

### Qué falta
Todo lo que va del servicio para arriba. `git grep grantService` fuera de sus propios dos archivos
da **cero**: no hay ruta HTTP, no hay email, no hay pantalla. Es código de dominio testeado que
nadie llama todavía — por eso mergearlo no rompería nada, y por eso tampoco le sirve aún a nadie.

Faltan las rebanadas 2 (rutas + fix del Dashboard + serialización), 3 (pantalla del panel con
copiar link) y 4 (los dos emails).

### 🔴 Por qué NO se mergeó hoy, aunque está terminada como incremento
**Una decisión de producto abierta puede cambiar el modelo, y una migración aplicada en producción
ya no se edita ni se renombra — sólo se supera con otra.** La decisión es: *«dos entradas»,
¿es un pase que vale por dos, o dos códigos separados?* Gastón dijo textual «dos QR»; el diseño
aprobado eligió un pase con `qty: 2`. Si gana lo que él dijo, `qty` deja de alcanzar.

Está respaldada en GitHub, así que no se pierde nada esperando.

### Para quien la retome
Leé **completo** el mensaje de `08e0b1c` (`git log -1 08e0b1c`): tiene tres decisiones que del
código no se deducen.

1. **Por qué la cortesía es entidad propia y no una orden de $0**: existe *antes* que el
   dispositivo de la persona y sobrevive sin dueño hasta que alguien la reclama. Además regalar un
   evento no produce orden, produce inscripción.
2. **Por qué hay dos caminos de reclamo** (link del mail, o email + código de un solo uso que
   reusa `lib/adminOtp.ts`): sin el código, cualquiera que conozca el mail del invitado se lleva la
   entrada — y en prensa y sponsors ese es el dato más fácil de averiguar.
3. **Por qué `grantedById` no es decorativo**: `total === 0` no reconoce una cortesía, porque un
   plan con precio pendiente también da 0. Sin ese campo el Dashboard cuenta los regalos como ventas.

⚠️ **Trampa fácil de "prolijar" mal:** los chequeos de idempotencia dentro de `materializar()` son
defensa redundante, **no** el mecanismo. La garantía real es el lock de `reclamar()`. Lo descubrí
por mutación y está documentado en el propio archivo. Si los borrás porque "están duplicados", el
día que algo reintente vas a entregar dos veces.

Informe con los diagramas y las 6 decisiones abiertas:
https://claude.ai/code/artifact/adf19177-3fc3-422a-b32a-ed525297c80f

---

## 🔴 `integra/mercadopago` — superada, cerrar explícitamente

**Tip:** `4f6a824` · en GitHub · **~15 conflictos** contra main.

Mercado Pago **ya vive en main** por la vía de `integra/mp-v2`. Lo único que esta rama tenía propio
—cobrar varios tipos de entrada en un solo pago— main lo resolvió mejor con la tabla `PaymentItem`.
Su commit `b882cf8` arregla el mismo bug que otro que ya está mergeado.

**No mergear.** Mientras siga apareciendo en la lista de ramas invita a mergearla por error.
Borrarla del remoto cuando alguien confirme que no queda nada que rescatar.

---

## ⚪ `origin/gh-pages` — no es una rama de trabajo

Sirve el redirect a Railway desde la vieja superficie de GitHub Pages, que se retiró porque era una
segunda producción que se desincronizaba en cada deploy. **Nunca mergear a main.**

---

## Ramas ya integradas (no tienen nada propio)

`feat/postulaciones-rediseno`, `spec/asignar-entradas`, `fix/higiene-pre-carga`,
`feat/iniciativas-eventos`, `fix/seed-fuera-del-bundle`, `feat/panel-carga-confiable`,
`feat/visual-ronda5`, `feat/visual-detalles`, `fix/quitar-rotulo-patrocinado`,
`fix/lanzamiento-21-07`, `integra/mp-v2`, `feat/mercadopago`.

Sus worktrees se pueden liberar con `git worktree remove`.

---

## `backup/main-iniciativas-20260722-1633`

Foto del `main` local del 22/07 16:33, tomada cuando **dos sesiones mergearon a main a la vez** y
los árboles divergieron (9 commits locales contra 6 remotos, con 6 archivos en conflicto — los dos
habían arreglado *el mismo* bug de seguridad del evento en borrador, por separado).

La reconciliación quedó hecha en `759bacb`. **Este respaldo ya no hace falta**: borrarlo cuando
alguien confirme que main tiene todo. Se deja unos días como red.

---

## Cómo deployar sin pisarse (dos trampas que ya mordieron)

1. **`~/.railway/config.json` linkea por RUTA de directorio, y `/private/tmp` está linkeado al
   proyecto de CCM.** Un `railway up` desde un directorio sin link puede subir otra cosa. Linkear
   explícito el worktree que está parado en main y verificar que `projectPath` apunte a él.
2. **`railway up --ci` sale con código 0 apenas termina de SUBIR**, no cuando el deploy funcionó —
   y suele fallar el stream de logs. Hay que pollear `railway deployment list` hasta estado
   terminal, cubriendo también `FAILED` y `CRASHED`, no sólo `SUCCESS`.

3. **`/api/v1/version` existe pero hoy dice `commit: "desconocido"`.** No es un bug del endpoint:
   `railway up` **no tiene** opción de build-arg, y Railway no inyecta datos de git porque el
   deploy es una subida de directorio, no una conexión al repo (sólo aparecen variables
   `RAILWAY_*`, ninguna de commit). El `ARG BUILD_SHA=desconocido` del Dockerfile queda en su
   default.

   **Se arregla en una línea antes de cada deploy**, porque `version.ts:20` lo lee en tiempo de
   EJECUCIÓN (`process.env.BUILD_SHA`) y una variable del servicio pisa el `ENV` del Dockerfile:

   ```
   railway variables --service ccm-api \
     --set "BUILD_SHA=$(git rev-parse --short HEAD)" \
     --set "BUILT_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
   railway up --service ccm-api --ci
   ```

   Sin ese paso el endpoint sigue sirviendo —confirma que el deploy entró y que el server
   levantó— pero no dice QUÉ commit está en el aire, que era la mitad de su razón de ser.

Y para verificar que el deploy entró: comparar el hash del bundle (`/assets/index-*.js`) contra
el de antes, y confirmar que el viejo devuelve 404. Para el panel, buscar en el **fragmento lazy**
correspondiente, nunca en el bundle principal.
