-- Frase del speaker ("Corazón que inspira")
ALTER TABLE "CatalogProfile" ADD COLUMN "quote" TEXT;

-- Tabla puente evento ↔ persona del catálogo (con bloque opcional)
--
-- Nota: el diseño original pedía PRIMARY KEY ("eventId","profileId","blockId"). Postgres
-- fuerza NOT NULL en toda columna que integre una PRIMARY KEY, así que esa PK habría
-- impedido justamente el caso "evento sin grilla" (blockId null) que este modelo necesita
-- soportar. Se usa un "id" propio como PK real y un UNIQUE INDEX sobre la tupla, que sí
-- permite múltiples filas con blockId NULL (dos NULL son distintos bajo UNIQUE, no bajo PK).
CREATE TABLE "EventSpeaker" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "blockId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "EventSpeaker_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventSpeaker_eventId_profileId_blockId_key" ON "EventSpeaker"("eventId", "profileId", "blockId");
CREATE INDEX "EventSpeaker_eventId_idx" ON "EventSpeaker"("eventId");
CREATE INDEX "EventSpeaker_profileId_idx" ON "EventSpeaker"("profileId");

ALTER TABLE "EventSpeaker" ADD CONSTRAINT "EventSpeaker_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventSpeaker" ADD CONSTRAINT "EventSpeaker_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "CatalogProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventSpeaker" ADD CONSTRAINT "EventSpeaker_blockId_fkey"
    FOREIGN KEY ("blockId") REFERENCES "EventBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
