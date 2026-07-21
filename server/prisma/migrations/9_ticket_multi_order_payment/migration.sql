-- Un cobro pasa a cubrir N recursos: el comprador elige varios planes VIP y paga UNA vez el
-- total que ve. La protección contra doble cobro NO se debilita: el índice único parcial se
-- muda tal cual desde Payment(kind,resourceId) a PaymentItem(kind,resourceId), que es donde
-- vive ahora la relación "1 fila viva ↔ 1 recurso" que ese índice siempre asumió.
--
-- OJO nombre de carpeta: Prisma ordena las migraciones por STRING, no por número — por eso esta
-- carpeta sigue con el prefijo "9_" (un "10_" ordenaría ANTES que "9_...") y el sufijo "t..."
-- ordena después de "9_payment_status_expired", que es la última "9_" existente.
--
-- ⚠️ Es DESTRUCTIVA y no tiene rollback sin restore (dropea dos columnas de Payment): hacer dump
-- de "Payment" antes de correrla en prod y verificar después que
-- SELECT count(*) FROM "PaymentItem" = SELECT count(*) FROM "Payment".

CREATE TABLE "PaymentItem" (
  "id"          TEXT NOT NULL,
  "paymentId"   TEXT NOT NULL,
  "kind"        "PaymentKind" NOT NULL,
  "resourceId"  TEXT NOT NULL,
  "amount"      INTEGER NOT NULL,
  "titulo"      TEXT NOT NULL,
  "closedAt"    TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  CONSTRAINT "PaymentItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PaymentItem"
  ADD CONSTRAINT "PaymentItem_paymentId_fkey" FOREIGN KEY ("paymentId")
  REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: cada Payment existente se vuelve un cobro de UNA sola línea.
--  · id: se reusa Payment.id (la relación es 1-a-1 acá, y es único dentro de esta tabla nueva).
--    Así no dependemos de gen_random_uuid ni de la versión de PG / de extensiones instaladas.
--  · closedAt: null solo si el Payment sigue pending — así el índice de abajo replica
--    EXACTAMENTE lo que el índice viejo ya garantizaba y su creación no puede fallar.
--  · deliveredAt: los approved YA se entregaron (el webhook viejo activaba antes de marcar
--    approved), así que se sellan para que un reintento tardío de MP no reactive nada.
INSERT INTO "PaymentItem" ("id","paymentId","kind","resourceId","amount","titulo","closedAt","deliveredAt")
SELECT p."id", p."id", p."kind", p."resourceId", p."amount", '(migrado)',
       CASE WHEN p."status" = 'pending'  THEN NULL ELSE p."updatedAt" END,
       CASE WHEN p."status" = 'approved' THEN p."updatedAt" ELSE NULL END
FROM "Payment" p;

CREATE UNIQUE INDEX "PaymentItem_paymentId_kind_resourceId_key"
  ON "PaymentItem"("paymentId","kind","resourceId");
CREATE INDEX "PaymentItem_kind_resourceId_idx" ON "PaymentItem"("kind","resourceId");

-- LA protección contra doble cobro, en su lugar nuevo: mientras un cobro está vivo (pending),
-- ninguna otra línea puede apuntar al mismo recurso. Cubre por igual el carrito idéntico, el
-- solapamiento parcial y el pedido legacy de una sola orden.
CREATE UNIQUE INDEX "PaymentItem_vivo_por_recurso"
  ON "PaymentItem"("kind","resourceId") WHERE "closedAt" IS NULL;

DROP INDEX "Payment_pending_por_recurso";
DROP INDEX "Payment_kind_resourceId_idx";
ALTER TABLE "Payment" DROP COLUMN "kind";
ALTER TABLE "Payment" DROP COLUMN "resourceId";
