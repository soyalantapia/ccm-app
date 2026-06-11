import { AdBanner, Marquee } from '../components/ui'
import {
  AwardsSection,
  CaminosSection,
  CatalogCarousel,
  FaqSection,
  GalasSection,
  Hero,
  PlatformsSection,
  RecentContent,
  SponsorsStrip,
  StatsSection,
} from '../features/landing'

const MARQUEE_ITEMS = [
  '19 y 20 de septiembre',
  'Hotel Quinto Centenario',
  '+18.000 asistentes',
  '7 plataformas',
  'Entrada gratuita con inscripción',
]

/** Landing oficial del evento (PRD §6.1) — la PWA es la única web de CCM (D2). */
export default function Landing() {
  return (
    <>
      <Hero />
      <Marquee items={MARQUEE_ITEMS} />
      <StatsSection />
      <PlatformsSection />
      <GalasSection />
      <CaminosSection />
      {/* Slot publicitario S2 intercalado (PRD §6.1.10 / §11) */}
      <div className="mx-auto max-w-6xl px-5 pb-16 md:pb-24">
        <AdBanner slot="S2" />
      </div>
      <AwardsSection />
      <CatalogCarousel />
      <RecentContent />
      <SponsorsStrip />
      <FaqSection />
    </>
  )
}
