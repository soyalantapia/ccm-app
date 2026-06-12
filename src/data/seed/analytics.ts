import type { AnalyticsEvent } from '../types'
import { IDS } from '../ids'

/**
 * Históricos seed para que el dashboard admin no nazca vacío (PRD §10.1).
 * 20 eventos de los últimos 7 días, taxonomía PRD §13, con IDs reales del seed.
 */
export const seedAnalytics: AnalyticsEvent[] = [
  /* ─── user_created ─── */
  {
    id: 'seed-evt-01',
    event: 'user_created',
    ts: '2026-06-04T10:12:00-03:00',
    deviceId: 'dev-seed-0001',
    seed: true,
  },
  {
    id: 'seed-evt-02',
    event: 'user_created',
    ts: '2026-06-05T18:40:00-03:00',
    deviceId: 'dev-seed-0002',
    seed: true,
  },
  {
    id: 'seed-evt-03',
    event: 'user_created',
    ts: '2026-06-07T09:55:00-03:00',
    deviceId: 'dev-seed-0003',
    seed: true,
  },
  {
    id: 'seed-evt-04',
    event: 'user_created',
    ts: '2026-06-09T21:18:00-03:00',
    deviceId: 'dev-seed-0004',
    seed: true,
  },

  /* ─── registration_created ─── */
  {
    id: 'seed-evt-05',
    event: 'registration_created',
    ts: '2026-06-04T10:15:00-03:00',
    deviceId: 'dev-seed-0001',
    payload: { eventId: IDS.events.camino18, blockId: 'blk-c18-1' },
    seed: true,
  },
  {
    id: 'seed-evt-06',
    event: 'registration_created',
    ts: '2026-06-05T18:44:00-03:00',
    deviceId: 'dev-seed-0002',
    payload: { eventId: IDS.events.camino18, blockId: 'blk-c18-4' },
    seed: true,
  },
  {
    id: 'seed-evt-07',
    event: 'registration_created',
    ts: '2026-06-07T10:01:00-03:00',
    deviceId: 'dev-seed-0003',
    payload: { eventId: IDS.events.principal, blockId: 'blk-p-1' },
    seed: true,
  },
  {
    id: 'seed-evt-08',
    event: 'registration_created',
    ts: '2026-06-10T12:30:00-03:00',
    deviceId: 'dev-seed-0005',
    payload: { eventId: IDS.events.camino30, blockId: 'blk-c30-1' },
    seed: true,
  },

  /* ─── fotos (galería Camino · Marzo, sponsor S3 Aura Beauty) ─── */
  {
    id: 'seed-evt-09',
    event: 'photo_view',
    ts: '2026-06-06T20:05:00-03:00',
    deviceId: 'dev-seed-0002',
    payload: { photoId: 'ph-07', galleryId: IDS.gallery.camino, sponsorId: IDS.sponsors.beauty },
    seed: true,
  },
  {
    id: 'seed-evt-10',
    event: 'photo_view',
    ts: '2026-06-09T21:25:00-03:00',
    deviceId: 'dev-seed-0004',
    payload: { photoId: 'ph-12', galleryId: IDS.gallery.camino, sponsorId: IDS.sponsors.beauty },
    seed: true,
  },
  {
    id: 'seed-evt-11',
    event: 'photo_download',
    ts: '2026-06-06T20:07:00-03:00',
    deviceId: 'dev-seed-0002',
    payload: { photoId: 'ph-07', galleryId: IDS.gallery.camino, sponsorId: IDS.sponsors.beauty },
    seed: true,
  },
  {
    id: 'seed-evt-12',
    event: 'photo_download',
    ts: '2026-06-10T16:42:00-03:00',
    deviceId: 'dev-seed-0006',
    payload: { photoId: 'ph-19', galleryId: IDS.gallery.camino, sponsorId: IDS.sponsors.beauty },
    seed: true,
  },

  /* ─── publicidad ─── */
  {
    id: 'seed-evt-13',
    event: 'ad_impression',
    ts: '2026-06-04T10:13:00-03:00',
    deviceId: 'dev-seed-0001',
    payload: { slot: 'S2', sponsorId: IDS.sponsors.banco },
    seed: true,
  },
  {
    id: 'seed-evt-14',
    event: 'ad_impression',
    ts: '2026-06-06T20:05:00-03:00',
    deviceId: 'dev-seed-0002',
    payload: { slot: 'S3', sponsorId: IDS.sponsors.beauty },
    seed: true,
  },
  {
    id: 'seed-evt-15',
    event: 'ad_impression',
    ts: '2026-06-08T22:08:00-03:00',
    deviceId: 'dev-seed-0005',
    payload: { slot: 'S6', sponsorId: IDS.sponsors.wines },
    seed: true,
  },

  /* ─── contenido ─── */
  {
    id: 'seed-evt-16',
    event: 'video_play',
    ts: '2026-06-08T22:10:00-03:00',
    deviceId: 'dev-seed-0005',
    payload: { contentId: 'vid-01', youtubeId: 'cPRpNqmziUs' },
    seed: true,
  },

  /* ─── entradas ─── */
  {
    id: 'seed-evt-17',
    event: 'ticket_order_created',
    ts: '2026-06-09T21:30:00-03:00',
    deviceId: 'dev-seed-0004',
    payload: { planId: 'sab-night-vip' },
    seed: true,
  },
  {
    id: 'seed-evt-18',
    event: 'ticket_order_redirected_mp',
    ts: '2026-06-09T21:31:00-03:00',
    deviceId: 'dev-seed-0004',
    payload: { planId: 'sab-night-vip' },
    seed: true,
  },

  /* ─── postulaciones ─── */
  {
    id: 'seed-evt-19',
    event: 'application_submitted',
    ts: '2026-06-07T23:05:00-03:00',
    deviceId: 'dev-seed-0005',
    payload: { convocatoriaId: IDS.convocatoria.camino },
    seed: true,
  },
  {
    id: 'seed-evt-20',
    event: 'application_submitted',
    ts: '2026-06-10T16:50:00-03:00',
    deviceId: 'dev-seed-0006',
    payload: { convocatoriaId: IDS.convocatoria.camino },
    seed: true,
  },
]
