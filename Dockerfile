# CCM — imagen ÚNICA: buildea el front (Vite) y el server (Express+Prisma), y el server
# sirve la SPA + /api/v1 desde un solo servicio Railway. Build context = raíz del repo.
# Deploy: railway up --path-as-root . -s ccm-api -c
FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# ── Front: deps + build ──
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Front servido desde la raíz del dominio, conectado al backend del mismo origen.
ENV VITE_BASE=/
ENV VITE_API_URL=https://ccm-api-production-91a9.up.railway.app
ENV VITE_OG_SITE=https://ccm-api-production-91a9.up.railway.app
RUN npm run build   # → /app/dist

# ── Server: deps (incl. dev: prisma CLI + tsx) + prisma client ──
WORKDIR /app/server
RUN npm ci --include=dev
RUN npx prisma generate

# ── Runtime ──
FROM node:22-slim
WORKDIR /app/server
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/server ./
COPY --from=build /app/dist /app/dist
# Tipos del dominio (@domain/types). Son import type (se eliden en runtime), pero los
# copiamos por las dudas para que tsx resuelva el alias sin romper.
COPY --from=build /app/src /app/src

ENV NODE_ENV=production
ENV FRONT_DIST=/app/dist
EXPOSE 4000

# migrate deploy (idempotente, no destructivo) y, si OK, arranca el server que sirve front+API.
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/index.ts"]
