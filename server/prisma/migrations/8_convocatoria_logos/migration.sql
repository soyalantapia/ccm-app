-- CTA opcional de la convocatoria + tabla de logos agrupables por rubro.
-- Aditiva: columnas nullable y tabla nueva → sin backfill.
ALTER TABLE "Convocatoria" ADD COLUMN "ctaLabel" TEXT;
ALTER TABLE "Convocatoria" ADD COLUMN "ctaUrl" TEXT;

CREATE TABLE "ConvocatoriaLogo" (
    "id" TEXT NOT NULL,
    "convocatoriaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT NOT NULL,
    "url" TEXT,
    "rubro" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ConvocatoriaLogo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConvocatoriaLogo_convocatoriaId_order_idx" ON "ConvocatoriaLogo"("convocatoriaId", "order");

ALTER TABLE "ConvocatoriaLogo" ADD CONSTRAINT "ConvocatoriaLogo_convocatoriaId_fkey" FOREIGN KEY ("convocatoriaId") REFERENCES "Convocatoria"("id") ON DELETE CASCADE ON UPDATE CASCADE;
