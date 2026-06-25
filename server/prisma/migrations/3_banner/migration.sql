-- CreateEnum
CREATE TYPE "BannerDestination" AS ENUM ('whatsapp', 'link', 'form');

-- CreateTable
CREATE TABLE "Banner" (
    "id" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "alt" TEXT,
    "destinationType" "BannerDestination" NOT NULL DEFAULT 'link',
    "destinationUrl" TEXT NOT NULL,
    "fixed" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Banner_slot_active_idx" ON "Banner"("slot", "active");

