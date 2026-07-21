-- server/prisma/migrations/10_person/migration.sql
-- Persona: ancla de identidad del CRM. Aditiva: no cambia ninguna columna existente.
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "dni" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Person_email_key" ON "Person"("email");
CREATE UNIQUE INDEX "Person_dni_key" ON "Person"("dni");
CREATE INDEX "Person_createdAt_idx" ON "Person"("createdAt");

ALTER TABLE "Device" ADD COLUMN "personId" TEXT;
ALTER TABLE "Application" ADD COLUMN "personId" TEXT;

CREATE INDEX "Device_personId_idx" ON "Device"("personId");
CREATE INDEX "Application_personId_idx" ON "Application"("personId");

ALTER TABLE "Device" ADD CONSTRAINT "Device_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Application" ADD CONSTRAINT "Application_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
