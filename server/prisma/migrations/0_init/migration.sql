-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('principal', 'camino', 'capacitacion');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('confirmada', 'cancelada');

-- CreateEnum
CREATE TYPE "PlanDay" AS ENUM ('sabado', 'domingo', 'combo');

-- CreateEnum
CREATE TYPE "PlanKind" AS ENUM ('general', 'vip');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('iniciada', 'redirigida_mp', 'confirmada', 'cancelada');

-- CreateEnum
CREATE TYPE "SponsorLevel" AS ENUM ('Principal', 'Oro', 'Plata');

-- CreateEnum
CREATE TYPE "AdSlot" AS ENUM ('S1', 'S2', 'S3', 'S4', 'S6');

-- CreateEnum
CREATE TYPE "MembershipTier" AS ENUM ('free', 'socio');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('preinscripta', 'aceptada', 'rechazada');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('pendiente_pago', 'activa', 'expirada', 'rechazada');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'EDITOR', 'STAFF', 'VIEWER');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('ticket_order', 'membership', 'ad_campaign');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'approved', 'rejected', 'refunded');

-- CreateEnum
CREATE TYPE "ProfileFieldKey" AS ENUM ('firstName', 'lastName', 'email', 'profession', 'phone', 'dni', 'city', 'instagram');

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consentTerms" TIMESTAMP(3),
    "consentNews" TIMESTAMP(3),
    "consentSponsors" TIMESTAMP(3),

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileField" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "key" "ProfileFieldKey" NOT NULL,
    "value" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "dateLabel" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "timeLabel" TEXT,
    "venue" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "mapsUrl" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cover" TEXT NOT NULL,
    "price" INTEGER,
    "past" BOOLEAN NOT NULL DEFAULT false,
    "socioOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSponsor" (
    "eventId" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,

    CONSTRAINT "EventSponsor_pkey" PRIMARY KEY ("eventId","sponsorId")
);

-- CreateTable
CREATE TABLE "EventBlock" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "seedTaken" INTEGER NOT NULL DEFAULT 0,
    "speakers" TEXT[],
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "blockId" TEXT,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'confirmada',
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "price" INTEGER,
    "serviceCharge" INTEGER NOT NULL DEFAULT 0,
    "mpLink" TEXT,
    "perks" TEXT[],
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "day" "PlanDay" NOT NULL,
    "kind" "PlanKind" NOT NULL,
    "preventa" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketOrder" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT,
    "planId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'iniciada',
    "qty" INTEGER NOT NULL DEFAULT 1,
    "total" INTEGER NOT NULL,
    "buyerName" TEXT,
    "buyerEmail" TEXT,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "orderId" TEXT,
    "jornada" TEXT NOT NULL,
    "qrToken" TEXT NOT NULL,
    "checkedIn" BOOLEAN NOT NULL DEFAULT false,
    "checkedInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogProfile" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "photo" TEXT NOT NULL,
    "instagram" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "participatesIn" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioPiece" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "caption" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PortfolioPiece_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gallery" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "eventLabel" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "cover" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gallery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "src" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoFavorite" (
    "deviceId" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotoFavorite_pkey" PRIMARY KEY ("deviceId","photoId")
);

-- CreateTable
CREATE TABLE "PhotoDownload" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotoDownload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sponsor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "level" "SponsorLevel" NOT NULL,
    "exclusive" BOOLEAN NOT NULL DEFAULT false,
    "tagline" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sponsor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorCreative" (
    "id" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "slot" "AdSlot" NOT NULL,
    "headline" TEXT NOT NULL,
    "sub" TEXT,
    "cta" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SponsorCreative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "slot" "AdSlot" NOT NULL,
    "brand" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "cta" TEXT,
    "tagline" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'pendiente_pago',
    "hours" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "total" INTEGER NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'video',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "youtubeId" TEXT NOT NULL,
    "duration" TEXT,
    "platform" TEXT,
    "sponsorId" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "socioOnly" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "tier" "MembershipTier" NOT NULL DEFAULT 'free',
    "since" TIMESTAMP(3),
    "paid" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "deviceId" TEXT,
    "mpPreferenceId" TEXT,
    "mpPaymentId" TEXT,
    "externalRef" TEXT,
    "amount" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Convocatoria" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "intro" TEXT NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "Convocatoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConvocatoriaField" (
    "id" TEXT NOT NULL,
    "convocatoriaId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" TEXT[],
    "placeholder" TEXT,
    "help" TEXT,
    "showIfKey" TEXT,
    "showIfEquals" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ConvocatoriaField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "convocatoriaId" TEXT NOT NULL,
    "deviceId" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'preinscripta',
    "data" JSONB NOT NULL,
    "fromSeed" BOOLEAN NOT NULL DEFAULT false,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "deviceId" TEXT,
    "payload" JSONB,
    "seed" BOOLEAN NOT NULL DEFAULT false,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "AdminRole" NOT NULL DEFAULT 'EDITOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLogin" TIMESTAMP(3),

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_publicId_key" ON "Device"("publicId");

-- CreateIndex
CREATE INDEX "Device_createdAt_idx" ON "Device"("createdAt");

-- CreateIndex
CREATE INDEX "ProfileField_key_value_idx" ON "ProfileField"("key", "value");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileField_deviceId_key_key" ON "ProfileField"("deviceId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE INDEX "Event_type_startDate_idx" ON "Event"("type", "startDate");

-- CreateIndex
CREATE INDEX "Event_past_idx" ON "Event"("past");

-- CreateIndex
CREATE INDEX "EventBlock_eventId_idx" ON "EventBlock"("eventId");

-- CreateIndex
CREATE INDEX "Registration_blockId_status_idx" ON "Registration"("blockId", "status");

-- CreateIndex
CREATE INDEX "Registration_eventId_status_idx" ON "Registration"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_deviceId_eventId_blockId_key" ON "Registration"("deviceId", "eventId", "blockId");

-- CreateIndex
CREATE INDEX "TicketOrder_status_ts_idx" ON "TicketOrder"("status", "ts");

-- CreateIndex
CREATE INDEX "TicketOrder_planId_idx" ON "TicketOrder"("planId");

-- CreateIndex
CREATE INDEX "TicketOrder_buyerEmail_idx" ON "TicketOrder"("buyerEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_qrToken_key" ON "Ticket"("qrToken");

-- CreateIndex
CREATE INDEX "Ticket_checkedIn_idx" ON "Ticket"("checkedIn");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_deviceId_jornada_key" ON "Ticket"("deviceId", "jornada");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogProfile_slug_key" ON "CatalogProfile"("slug");

-- CreateIndex
CREATE INDEX "CatalogProfile_role_idx" ON "CatalogProfile"("role");

-- CreateIndex
CREATE INDEX "CatalogProfile_platform_idx" ON "CatalogProfile"("platform");

-- CreateIndex
CREATE INDEX "PortfolioPiece_profileId_order_idx" ON "PortfolioPiece"("profileId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Gallery_slug_key" ON "Gallery"("slug");

-- CreateIndex
CREATE INDEX "Gallery_sponsorId_idx" ON "Gallery"("sponsorId");

-- CreateIndex
CREATE INDEX "Photo_galleryId_order_idx" ON "Photo"("galleryId", "order");

-- CreateIndex
CREATE INDEX "PhotoDownload_sponsorId_ts_idx" ON "PhotoDownload"("sponsorId", "ts");

-- CreateIndex
CREATE INDEX "PhotoDownload_galleryId_idx" ON "PhotoDownload"("galleryId");

-- CreateIndex
CREATE INDEX "Sponsor_level_idx" ON "Sponsor"("level");

-- CreateIndex
CREATE INDEX "Sponsor_industry_idx" ON "Sponsor"("industry");

-- CreateIndex
CREATE INDEX "SponsorCreative_slot_sponsorId_idx" ON "SponsorCreative"("slot", "sponsorId");

-- CreateIndex
CREATE INDEX "AdCampaign_slot_status_expiresAt_idx" ON "AdCampaign"("slot", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "ContentItem_publishedAt_idx" ON "ContentItem"("publishedAt");

-- CreateIndex
CREATE INDEX "ContentItem_socioOnly_idx" ON "ContentItem"("socioOnly");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_deviceId_key" ON "Membership"("deviceId");

-- CreateIndex
CREATE INDEX "Membership_tier_idx" ON "Membership"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_mpPaymentId_key" ON "Payment"("mpPaymentId");

-- CreateIndex
CREATE INDEX "Payment_kind_resourceId_idx" ON "Payment"("kind", "resourceId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_deviceId_idx" ON "Payment"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Convocatoria_slug_key" ON "Convocatoria"("slug");

-- CreateIndex
CREATE INDEX "Convocatoria_eventId_idx" ON "Convocatoria"("eventId");

-- CreateIndex
CREATE INDEX "ConvocatoriaField_convocatoriaId_order_idx" ON "ConvocatoriaField"("convocatoriaId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ConvocatoriaField_convocatoriaId_key_key" ON "ConvocatoriaField"("convocatoriaId", "key");

-- CreateIndex
CREATE INDEX "Application_convocatoriaId_status_idx" ON "Application"("convocatoriaId", "status");

-- CreateIndex
CREATE INDEX "Application_status_ts_idx" ON "Application"("status", "ts");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_event_ts_idx" ON "AnalyticsEvent"("event", "ts");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_ts_idx" ON "AnalyticsEvent"("ts");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_deviceId_idx" ON "AnalyticsEvent"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- AddForeignKey
ALTER TABLE "ProfileField" ADD CONSTRAINT "ProfileField_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSponsor" ADD CONSTRAINT "EventSponsor_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSponsor" ADD CONSTRAINT "EventSponsor_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "Sponsor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventBlock" ADD CONSTRAINT "EventBlock_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "EventBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketOrder" ADD CONSTRAINT "TicketOrder_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketOrder" ADD CONSTRAINT "TicketOrder_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TicketPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TicketOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioPiece" ADD CONSTRAINT "PortfolioPiece_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CatalogProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gallery" ADD CONSTRAINT "Gallery_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "Sponsor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "Gallery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoFavorite" ADD CONSTRAINT "PhotoFavorite_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoFavorite" ADD CONSTRAINT "PhotoFavorite_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoDownload" ADD CONSTRAINT "PhotoDownload_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoDownload" ADD CONSTRAINT "PhotoDownload_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorCreative" ADD CONSTRAINT "SponsorCreative_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "Sponsor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "Sponsor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Convocatoria" ADD CONSTRAINT "Convocatoria_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConvocatoriaField" ADD CONSTRAINT "ConvocatoriaField_convocatoriaId_fkey" FOREIGN KEY ("convocatoriaId") REFERENCES "Convocatoria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_convocatoriaId_fkey" FOREIGN KEY ("convocatoriaId") REFERENCES "Convocatoria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

