-- Garantiza la regla de negocio "una sola campaña ACTIVA por slot" (canon 10 / doc 04 §1).
-- Es un índice único PARCIAL: no se puede expresar en el datamodel de Prisma (@@unique no
-- soporta predicado WHERE), así que vive como SQL crudo dentro del historial de migraciones.
-- Hasta ahora solo existía como comentario en schema.prisma y NUNCA se creaba (el deploy usaba
-- `db push`, que ignora SQL crudo) → la Fase F podía activar dos campañas en el mismo slot.
-- AdCampaign está vacía al aplicar esto, así que la creación del índice es segura.
CREATE UNIQUE INDEX "one_active_per_slot" ON "AdCampaign"("slot") WHERE "status" = 'activa';
