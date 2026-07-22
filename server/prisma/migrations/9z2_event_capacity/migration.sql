-- Cupo a nivel EVENTO. Hasta acá el único tope real del sistema era EventBlock.capacity, con su
-- `SELECT ... FOR UPDATE`; la inscripción a nivel evento tomaba el lock sobre la fila del Event
-- pero no comparaba contra nada — el comentario del servicio lo decía literal: "sin bloque, sin
-- cupo". Mientras todo era gratis eso no dolía. Con eventos que se COBRAN sí: sobrevender algo
-- pago obliga a devolver plata.
--
-- Ambas columnas son opcionales y no cambian el comportamiento de lo que ya existe: capacity NULL
-- = sin tope, que es exactamente como se venía comportando. seedTaken arranca en 0.
--
-- Prefijo 9z2_ por el orden lexicográfico real del directorio (ver src/lib/migrationsOrder.test.ts):
-- ordena después de 9z_payment_kind_event.

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "capacity" INTEGER;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "seedTaken" INTEGER NOT NULL DEFAULT 0;
