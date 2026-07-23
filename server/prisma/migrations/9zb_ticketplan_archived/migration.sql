-- Retirar un tipo de entrada de la venta sin borrarlo.
-- Prefijo 9zb_ para ordenar DESPUÉS de 9za_ticketplan_event (Prisma aplica en orden lexicográfico;
-- ver migrationsOrder.test.ts). NOT NULL con default false: las entradas existentes quedan activas.
ALTER TABLE "TicketPlan" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
