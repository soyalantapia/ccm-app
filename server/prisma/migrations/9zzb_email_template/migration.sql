-- Override editable de las plantillas de email automáticas (pestaña Automatizaciones del panel).
--
-- Sólo guarda lo que el organizador PISÓ: sin fila para una `key`, el mail usa la plantilla del
-- código. Por eso "restaurar el original" es borrar la fila. `html` es el CUERPO (inner) con tokens
-- {{var}}; el envoltorio de marca y el escapado de valores los pone el server al enviar.
--
-- Prefijo 9zzb_ por el orden lexicográfico real: ordena última, después de 9zza_ticket_grant
-- (ver src/lib/migrationsOrder.test.ts). Aditiva: tabla nueva, no toca ninguna fila existente.

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("key")
);

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
