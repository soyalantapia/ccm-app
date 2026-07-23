-- Entradas REGALADAS por el organizador desde el CRM.
--
-- Toda inscripción/orden normal nace del DISPOSITIVO del comprador (requireDevice); los invitados
-- de cortesía —prensa, sponsors— casi nunca abrieron la app. Por eso el grant cuelga de Person
-- (email), no de Device: la persona puede no tener ningún dispositivo todavía.
--
-- El token del link NO se guarda: se DERIVA por HMAC de (id + tokenVersion) con GRANT_TOKEN_SECRET
-- (lib/grantToken.ts). Una filtración de la base no regala entradas.
--
-- Prefijo 9zza_ por el orden lexicográfico real: ordena última, después de 9zb_ticketplan_archived
-- (ver src/lib/migrationsOrder.test.ts). Aditiva: tabla nueva, no toca ninguna fila existente.

-- CreateEnum
CREATE TYPE "GrantStatus" AS ENUM ('pendiente', 'reclamado', 'revocado');

-- CreateTable
CREATE TABLE "TicketGrant" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "status" "GrantStatus" NOT NULL DEFAULT 'pendiente',
    "tokenVersion" INTEGER NOT NULL DEFAULT 1,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedByDeviceId" TEXT,
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "TicketGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketGrant_eventId_status_idx" ON "TicketGrant"("eventId", "status");
CREATE INDEX "TicketGrant_personId_status_idx" ON "TicketGrant"("personId", "status");

-- AddForeignKey
ALTER TABLE "TicketGrant" ADD CONSTRAINT "TicketGrant_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketGrant" ADD CONSTRAINT "TicketGrant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketGrant" ADD CONSTRAINT "TicketGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TicketGrant" ADD CONSTRAINT "TicketGrant_claimedByDeviceId_fkey" FOREIGN KEY ("claimedByDeviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
