# Backend de CCM (Fase 0). Build context = server/ (deploy con server/ como raíz).
# Se usa Dockerfile (no Railpack/Nixpacks) para controlar: devDeps (prisma/tsx),
# prisma generate, y arranque con tsx (sin tsc → no necesita ../src; domain.ts es
# type-only y no entra al grafo de runtime). Ver server/CLAUDE.md.
FROM node:22-slim

WORKDIR /app

# Prisma necesita openssl en runtime/engine.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Instalar deps (incluye devDeps: prisma CLI + tsx) con cache de capa.
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Código + generar el Prisma Client (solo necesita el schema).
COPY . .
RUN npx prisma generate

ENV NODE_ENV=production
# Railway inyecta PORT; index.ts lo lee de process.env.PORT.
EXPOSE 4000

# Bootstrap: aplica las migraciones versionadas (idempotente, NO destructivo) y solo
# arranca el server si tuvieron éxito (`&&`). Si `migrate deploy` falla (DB inalcanzable,
# migración rota), el contenedor sale con error → Railway marca el deploy como fallido y
# conserva la versión anterior sana, en vez de servir tráfico contra un schema desincronizado.
# Reemplaza al viejo `db push --accept-data-loss` (destructivo ante drift) — ver work-agent.
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/index.ts"]
