-- AlterTable: distinción participante/expositor (cupo de imágenes) + "cuenta proyectos".
-- Aditiva: `kind` con default 'participante' (los perfiles existentes quedan como
-- participantes) y `projects` nullable → no requiere backfill.
ALTER TABLE "CatalogProfile" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'participante';
ALTER TABLE "CatalogProfile" ADD COLUMN "projects" TEXT;
