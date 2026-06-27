# CCM — Backend (`server/`)

API de **Córdoba Corazón de Moda**. Implementa el contrato `DataStore` del frontend contra Postgres, sin reescribir pantallas. Node + TypeScript + Express + Prisma. **En producción en Railway**, donde el mismo servicio sirve además el frontend buildeado (single-service; ver `FRONT_DIST` en `app.ts`).

- 📖 Biblia del proyecto: [`../PROJECT.MD`](../PROJECT.MD) · Estado real: [`../work-agent/ESTADO-ACTUAL.md`](../work-agent/ESTADO-ACTUAL.md)
- Plan de arquitectura: [`../work-agent/backend/`](../work-agent/backend/00-README.md) (es el *plan*; el estado real está arriba). Convenciones: [`CLAUDE.md`](./CLAUDE.md).

## Requisitos

- Node ≥ 20
- PostgreSQL (local, Docker, o el de Railway)

## Arranque

```bash
cd server
npm install
cp .env.example .env          # completá DATABASE_URL (mínimo para /health)
npm run prisma:generate
npm run prisma:migrate        # crea las tablas (necesita Postgres)
npm run dev                   # → http://localhost:4000/api/v1/health
```

Sin Postgres a mano, podés validar el modelo y compilar sin DB:

```bash
npx prisma validate           # valida el schema
npm run typecheck             # tsc --noEmit
```

## Estructura

```
server/
├─ prisma/
│  ├─ schema.prisma   # 29 modelos · 15 enums (canon = doc 04)
│  ├─ migrations/     # 6 migraciones versionadas (0_init … 5_nota)
│  └─ seed.ts         # seed→prod idempotente (funcional)
├─ src/
│  ├─ index.ts        # arranque (assertProd) + apagado prolijo
│  ├─ app.ts          # Express: middlewares + /api/v1 + serving del SPA (FRONT_DIST)
│  ├─ domain.ts       # re-export de los tipos del front (@domain/types)
│  ├─ routes/         # 13 routers (health, devices, me, events, registrations, catalog,
│  │                  #   photos, benefits, banners, notas, memberships, analytics, admin)
│  ├─ services/       # 12 services (lógica de negocio + Prisma)
│  ├─ middlewares/    # device, admin, error
│  └─ lib/            # env (zod), prisma (singleton), errors, deviceToken (HMAC), serialize, url
└─ .env.example       # contrato de entorno (3 secretos JWT, MP, storage)
```

## Estado

**En producción.** Fases **0, A, B, D, E, F, G** completas + las 4 features de los audios de Gastón (beneficios, banners, participantes, notas). Pendiente: pagos MP de entradas (C, bloqueado por Gastón), acreditación QR (H), login OTP + roles, uploads de imágenes, y **tests** (el script `npm test` corre vitest pero hoy hay 0 archivos). Estado detallado: [`../work-agent/ESTADO-ACTUAL.md`](../work-agent/ESTADO-ACTUAL.md).
