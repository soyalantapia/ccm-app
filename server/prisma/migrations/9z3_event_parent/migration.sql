-- Iniciativas adentro de un evento: un evento puede colgar de otro.
--
-- Por qué acá y no columnas nuevas en EventBlock: de los ~19 campos que necesita una iniciativa
-- para venderse (portada, URL propia, bajada, precio, borrador, sede, sponsors), 11 YA existen en
-- Event con su formulario, su ficha pública y su flujo de publicar. Duplicarlos en el bloque eran
-- dos formularios que aprender y la pregunta eterna de dónde se carga cada cosa.
--
-- Restrict y no Cascade: borrar un evento no puede llevarse en silencio las iniciativas que
-- cuelgan de él, que pueden tener gente inscripta o pagando. deleteEvent ya tiene el pre-chequeo
-- con 409 para las inscripciones; se le suma el de las hijas.
--
-- ⚠️ REGLA que hay que respetar del lado del front: el filtro de hijas va en los selectores de
-- RENDER (qué sube a la portada, qué lista la grilla), NO en getEvents/getEventsWithBlocks del
-- server. Si alguien lo "prolija" moviéndolo a la consulta, las iniciativas desaparecen de la
-- ficha de su propio evento padre, que es justo donde tienen que verse.
--
-- Aditiva: parentId nace NULL para las 6 filas existentes, o sea todas quedan de primer nivel.
-- Prefijo 9z3_ por el orden lexicográfico real (ver src/lib/migrationsOrder.test.ts).

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "parentId" TEXT;

ALTER TABLE "Event"
  ADD CONSTRAINT "Event_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Event_parentId_idx" ON "Event"("parentId");
