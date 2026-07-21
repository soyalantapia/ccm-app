-- Agrupa las órdenes que se pagan JUNTAS en un mismo checkout.
--
-- Antes, elegir dos tipos de entrada creaba dos TicketOrder y se generaba el cobro de MP por la
-- PRIMERA solamente, mientras al comprador se le mostraba el total de las dos y las dos quedaban
-- marcadas como redirigidas: veía un precio y le cobraban otro (menor), y la segunda entrada no
-- llegaba nunca.
--
-- Un TicketOrder no puede tener varios planes (planId es uno solo), así que en vez de rehacer el
-- modelo con líneas de orden —migración pesada sobre datos que ya existen en producción— las
-- órdenes de una misma compra comparten este groupId. El cobro suma el grupo entero y el aviso de
-- pago confirma el grupo entero.
--
-- Nullable a propósito: todas las órdenes que ya existen quedan con groupId NULL y siguen
-- funcionando exactamente igual (una orden sola = su propio grupo). No hace falta backfill.
--
-- ⚠️ El prefijo sigue siendo 9_ (no 12_) porque Prisma ordena las carpetas por TEXTO: "12_"
-- ordenaría ANTES que "9_" y esta migración correría antes que las de MP. "9_z_" la deja última.
ALTER TABLE "TicketOrder" ADD COLUMN "groupId" TEXT;
CREATE INDEX "TicketOrder_groupId_idx" ON "TicketOrder"("groupId");
