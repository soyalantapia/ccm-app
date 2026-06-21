# CCM — Backend (`server/`)

API de **Córdoba Corazón de Moda** (Fase 1). Implementa el contrato `DataStore` del frontend contra Postgres, sin reescribir pantallas. Node + TypeScript + Express + Prisma, pensado para Railway.

Plan completo en [`../work-agent/backend/`](../work-agent/backend/00-README.md). Convenciones del repo en [`CLAUDE.md`](./CLAUDE.md).

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
│  ├─ schema.prisma   # canon = doc 04 (modelo de datos)
│  └─ seed.ts         # seed→prod idempotente (stub hasta fase B/E)
├─ src/
│  ├─ index.ts        # arranque + apagado prolijo
│  ├─ app.ts          # Express app, monta /api/v1
│  ├─ domain.ts       # re-export de los tipos del front (@domain/types)
│  ├─ routes/         # HTTP por dominio (hoy: health)
│  ├─ middlewares/    # error handler, 404, ...
│  └─ lib/            # env (zod), prisma (singleton), errors
└─ .env.example       # contrato de entorno (3 secretos JWT, MP, storage)
```

## Estado

**Fase 0** lista (esqueleto + schema canónico + `/api/v1/health`). Las fases A→H se construyen una por vez siguiendo `../work-agent/backend/build/PROMPTS-POR-FASE.md`.
