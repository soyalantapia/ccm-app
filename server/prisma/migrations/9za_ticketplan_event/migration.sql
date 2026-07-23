-- Los tipos de entrada pasan a colgar de un EVENTO.
--
-- Hasta acá los 5 planes eran un tarifario suelto: sábado/domingo/combo × general/VIP, que de
-- hecho son las entradas del evento principal, pero nada lo decía en el modelo. Consecuencia
-- concreta: no se podían crear entradas para otro evento, y cualquier tier nuevo se habría
-- colado en el selector del principal y en el "VIP desde $X" del banner, porque el mínimo se
-- calcula sobre TODOS los planes sin forma de filtrar.
--
-- OJO NOMBRE DE CARPETA: Prisma ordena por STRING. "9z4_" ordenaría ANTES que
-- "9z_payment_kind_event" (el guion bajo, 0x5F, es mayor que el '4', 0x34), o sea antes de las
-- tres migraciones anteriores. Verificado con sort. El prefijo correcto es "9za_", que ordena
-- último. Hay un test que congela esto: server/src/lib/migrationsOrder.test.ts.
--
-- El backfill NO hardcodea el id: lo busca. Y si no encuentra exactamente UN evento principal,
-- ABORTA — dejar la columna a medias sobre la tabla que referencian las órdenes sería peor que
-- no migrar. Verificado contra prod antes de escribir esto: hay exactamente uno
-- (ev-principal-2026) y CERO órdenes, así que esta migración no toca ninguna venta.

-- 1. La columna nace nullable para poder rellenarla.
ALTER TABLE "TicketPlan" ADD COLUMN IF NOT EXISTS "eventId" TEXT;

-- 2. Backfill con guard. Un solo principal o nada.
DO $$
DECLARE
  destino TEXT;
  principales INT;
  huerfanos INT;
BEGIN
  SELECT count(*) INTO huerfanos FROM "TicketPlan" WHERE "eventId" IS NULL;
  -- Base sin planes (instalación desde cero, base de tests): no hay nada que rellenar y exigir
  -- un evento principal sería absurdo — todavía no existe ninguno. Salir sin tocar nada.
  IF huerfanos = 0 THEN
    RETURN;
  END IF;

  SELECT count(*) INTO principales FROM "Event" WHERE "type" = 'principal';
  IF principales <> 1 THEN
    RAISE EXCEPTION
      'Backfill abortado: hay % tipos de entrada sin evento y se esperaba EXACTAMENTE 1 evento con type=principal para asignarlos, pero hay %. Asigná el eventId a mano antes de correr esta migración.',
      huerfanos, principales;
  END IF;

  SELECT id INTO destino FROM "Event" WHERE "type" = 'principal';
  UPDATE "TicketPlan" SET "eventId" = destino WHERE "eventId" IS NULL;
END $$;

-- 3. Recién ahora se vuelve obligatoria. Un plan sin evento es el problema que vinimos a
--    resolver: si esto quedara nullable, la migración no serviría de nada.
ALTER TABLE "TicketPlan" ALTER COLUMN "eventId" SET NOT NULL;

ALTER TABLE "TicketPlan"
  ADD CONSTRAINT "TicketPlan_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "TicketPlan_eventId_idx" ON "TicketPlan"("eventId");

-- 4. `day` deja de ser obligatorio. Es el enum {sabado,domingo,combo} del evento principal, que
--    dura dos días; un taller de una tarde no tiene "sábado" ni "combo". Verificado que ningún
--    componente ramifica por este campo: el único uso real fuera de EventBlock.day es
--    serializarlo en catalogService. Se deja el enum como está —las 5 filas actuales lo usan—
--    pero un tier nuevo puede no tenerlo.
ALTER TABLE "TicketPlan" ALTER COLUMN "day" DROP NOT NULL;
