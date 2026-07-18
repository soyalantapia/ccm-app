-- AlterTable: banner opcional para el arte horizontal del SponsorCarousel (3:1).
-- Nullable → no requiere backfill; la UI cae a un lockup de marca cuando falta.
ALTER TABLE "Sponsor" ADD COLUMN "banner" TEXT;
