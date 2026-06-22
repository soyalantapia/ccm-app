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

# Bootstrap Fase 0: intenta sincronizar el schema (idempotente) pero NO bloquea el
# arranque si la red privada a Postgres aún no está lista — el app conecta lazy en
# /health. 🔶 Fase A: reemplazar `db push` por `prisma migrate deploy`.
CMD ["sh", "-c", "(npx prisma db push --skip-generate --accept-data-loss || echo '[boot] db push diferido') ; npx tsx src/index.ts"]
