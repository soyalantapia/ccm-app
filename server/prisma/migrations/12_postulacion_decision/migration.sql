-- AlterTable
-- Quién decidió (email, sin FK: sobrevive a que esa persona se vaya del equipo), la nota
-- interna del equipo, y el rastro del aviso al postulante (cuándo salió, o por qué no).
ALTER TABLE "Application" ADD COLUMN     "decidedBy" TEXT,
ADD COLUMN     "decisionNote" TEXT,
ADD COLUMN     "notifiedAt" TIMESTAMP(3),
ADD COLUMN     "notifyError" TEXT;
