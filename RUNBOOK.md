# RUNBOOK.md — Operación de CCM

Qué hacer cuando algo pasa: deploy, rollback, incidentes, y el **día del evento** (19-20 sep 2026, picos de ~20.000 usuarios). Para arquitectura ver [`PROJECT.MD`](./PROJECT.MD); para infra ver `README.md` §Deploy.

---

## 0. Accesos rápidos

| Qué | Dónde |
|---|---|
| App + API (prod) | https://ccm-api-production-91a9.up.railway.app |
| Health | `…/api/v1/health` → `{ok:true, db:'up'}` |
| Admin | `…/admin` (clave = `ADMIN_TOKEN`) |
| Plataforma | Railway, proyecto/servicio **`ccm-api`** + plugin Postgres |
| CLI | `railway` (proyecto enlazado), `gh` (cuenta `soyalantapia`) |
| Repo | `soyalantapia/ccm-app`, rama `feat/backend-foundation` |

---

## 1. Deploy

```bash
# Front + API juntos (desde la raíz del repo)
railway up . --path-as-root -s ccm-api -c
```
- Build multi-stage (Dockerfile raíz): buildea el front (`VITE_BASE=/`, `VITE_API_URL=<dominio>`), instala el server, `prisma generate`.
- En el arranque el contenedor corre **`prisma migrate deploy && tsx src/index.ts`**: aplica migraciones y arranca. Si la migración falla, el contenedor **sale con error** y Railway **conserva la versión anterior sana** (no sirve contra un schema roto).

**Post-deploy (verificar):**
```bash
curl -s https://ccm-api-production-91a9.up.railway.app/api/v1/health      # {ok:true,db:'up'}
curl -s -o /dev/null -w '%{http_code}\n' https://ccm-api-production-91a9.up.railway.app/   # 200 (SPA)
```
Más: abrir `/novedades` y `/beneficios` y mirar la consola (sin errores). Si testeaste en el browser, recordá que el **Service Worker cachea el bundle viejo** → desregistrar SW + limpiar caches para ver el deploy nuevo.

## 2. Rollback

- **Vía Railway:** dashboard → servicio `ccm-api` → Deployments → *Redeploy* del deployment sano anterior. Es lo más rápido.
- **Vía git:** revertir el commit problemático en la rama y volver a `railway up`.
- ⚠️ **Migraciones:** `migrate deploy` no revierte sola. Si una migración rompió datos, restaurar la DB (§4) y/o aplicar una migración correctiva (expand/contract). **Nunca** `migrate reset` en prod.

## 3. Variables de entorno (Railway)

Obligatorias (sin ellas `assertProd` aborta el arranque): `DATABASE_URL`, `CORS_ORIGINS` (≠ `*`), `ADMIN_TOKEN`, `DEVICE_TOKEN_SECRET`. Tuneables sin redeploy: `RATE_LIMIT_WRITES`, `RATE_LIMIT_ANALYTICS`. Por fase: `MP_ACCESS_TOKEN`/`MP_WEBHOOK_SECRET`, `STORAGE_*`, `RESEND_API_KEY`, `ACCREDITATION_TOKEN_SECRET`, `OTP_PEPPER`. Generar secretos: `openssl rand -base64 48`. Cambiar una env en Railway redeploya el servicio.

## 4. Base de datos

```bash
# Inspeccionar (poné la DATABASE_URL de Railway en server/.env)
cd server && npx prisma studio
# o: psql "$DATABASE_URL"

# Re-sembrar (idempotente; ⚠️ toca datos)
cd server && npm run db:seed
```
**Backups:** Railway hace snapshots del plugin Postgres. Para resguardo propio antes de algo riesgoso:
```bash
pg_dump "$DATABASE_URL" > ccm-$(date +%Y%m%d-%H%M).sql       # respaldo
psql "$DATABASE_URL" < ccm-AAAAMMDD-HHMM.sql                  # restore (a DB vacía)
```
> La semana del evento: backup frecuente (cada pocas horas) y **probar el restore** una vez.

---

## 5. Incidentes comunes

| Síntoma | Causa probable | Acción |
|---|---|---|
| `/health` da `503 db:'down'` | DB caída / `DATABASE_URL` mal | Revisar el plugin Postgres en Railway; reiniciar el servicio. |
| Todo `/admin/*` da `503 ADMIN_AUTH_DISABLED` | Falta `ADMIN_TOKEN` | Setear la env en Railway (redeploya). |
| El deploy quedó en la versión vieja | La migración falló (el contenedor salió) | Ver logs de Railway; arreglar la migración; redeploy. La versión sana sigue sirviendo. |
| Usuarios ven una versión vieja del front | Service Worker cacheó el bundle anterior | El banner "nueva versión → Actualizar" debería aparecer; si no, desregistrar SW + limpiar caches. |
| `429 RATE_LIMITED` masivo | Mucho tráfico desde una IP (NAT del venue) | Subir `RATE_LIMIT_WRITES`/`RATE_LIMIT_ANALYTICS` (ver §6). |
| Imágenes rotas | Rutas de assets / base path | Verificar `VITE_BASE` del build (prod = `/`); las rutas de seed son relativas + `asset()`. |
| Error de chunk tras deploy | Bundle viejo pidiendo un chunk inexistente | `RouteError` ya ofrece "Actualizar la app" (hard refresh); el usuario toca eso. |

**Logs:** `railway logs -s ccm-api` (o el dashboard). El error handler loguea el stack server-side **sin** PII/payloads.

---

## 6. Día del evento (19-20 sep 2026)

Picos de ~20.000 usuarios, todos detrás de la **WiFi del venue** (comparten IP por NAT).

**Antes (semana previa):**
- [ ] Backup de DB probado (dump + restore). Snapshots de Railway activos.
- [ ] **Subir rate limits** (todos comparten IP): `RATE_LIMIT_WRITES` y `RATE_LIMIT_ANALYTICS` bien arriba (ej. ×10). *Los GET no se limitan, así que el grueso del tráfico está cubierto.*
- [ ] **Code freeze** unos días antes: no deployar nada no crítico.
- [ ] Verificar `/health`, inscripción a un bloque, descarga de foto, y el panel admin con datos reales.
- [ ] Si la acreditación QR (Fase H) está lista: probar el scan en puerta (online y modo offline). Si **no** está lista: **plan B = lista impresa** de inscriptos.
- [ ] Confirmar que el equipo de prensa/marketing puede cargar notas/banners.

**Durante:**
- Monitorear `/health` y los logs de Railway.
- Dashboard admin abierto para ver inscripciones/check-ins en vivo.
- Si algo se cae: priorizar **acreditación en puerta** (que la gente entre) por sobre features secundarias.

**Después:**
- Backup final de la DB.
- Generar los **Reportes Técnicos de Impacto** por sponsor (panel admin → sponsors).
- Export de leads/CRM (Personas → CSV).

---

## 7. Quién toca qué

- **Infra / deploy / DB / secretos:** Alan Tapia / Xnod.
- **Contenido (notas, banners, beneficios, expositores):** equipo de prensa/marketing de CCM, vía `/admin`.
- **Decisiones de negocio bloqueantes (MP, precios, sponsors):** Gastón. Ver [`PROJECT.MD` §13](./PROJECT.MD#13-decisiones-abiertas-bloqueantes).
