-- Borrador / publicado para eventos.
--
-- El orden importa y por eso está escrita a mano:
--
--   1. La columna nace con DEFAULT true, así los eventos que YA existen quedan publicados —
--      están al aire ahora mismo y no pueden desaparecer de la app por una migración.
--   2. Recién después el default baja a false, para que los eventos NUEVOS nazcan borrador.
--
-- Invertir estos dos pasos dejaría el sitio sin eventos hasta que alguien los republique a mano.

-- 1) columna + backfill implícito de lo existente
ALTER TABLE "Event" ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT true;

-- 2) de acá en adelante, lo nuevo arranca sin publicar
ALTER TABLE "Event" ALTER COLUMN "published" SET DEFAULT false;

-- El público filtra por esta columna en cada visita.
CREATE INDEX "Event_published_idx" ON "Event"("published");
