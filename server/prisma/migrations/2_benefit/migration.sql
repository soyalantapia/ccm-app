-- CreateTable
CREATE TABLE "Benefit" (
    "id" TEXT NOT NULL,
    "partner" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "code" TEXT,
    "discountLabel" TEXT,
    "url" TEXT,
    "logo" TEXT,
    "validUntil" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Benefit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Benefit_active_order_idx" ON "Benefit"("active", "order");

