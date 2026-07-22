-- CreateEnum
CREATE TYPE "GrantKind" AS ENUM ('ticket_plan', 'event');

-- CreateEnum
CREATE TYPE "GrantClaimVia" AS ENUM ('link', 'code');

-- AlterTable
ALTER TABLE "TicketOrder" ADD COLUMN     "grantedById" TEXT;

-- CreateTable
CREATE TABLE "TicketGrant" (
    "id" TEXT NOT NULL,
    "kind" "GrantKind" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "message" TEXT,
    "grantedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimToken" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "claimedVia" "GrantClaimVia",
    "claimedByDeviceId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "notifyError" TEXT,
    "orderId" TEXT,
    "registrationId" TEXT,

    CONSTRAINT "TicketGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantClaimCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrantClaimCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketGrant_claimToken_key" ON "TicketGrant"("claimToken");

-- CreateIndex
CREATE INDEX "TicketGrant_email_claimedAt_idx" ON "TicketGrant"("email", "claimedAt");

-- CreateIndex
CREATE INDEX "TicketGrant_grantedById_createdAt_idx" ON "TicketGrant"("grantedById", "createdAt");

-- CreateIndex
CREATE INDEX "GrantClaimCode_email_createdAt_idx" ON "GrantClaimCode"("email", "createdAt");

-- CreateIndex
CREATE INDEX "TicketOrder_grantedById_idx" ON "TicketOrder"("grantedById");

