export const config = {
  tenantId: 'ccm-cordoba',
  appName: 'Córdoba Corazón de Moda',
  shortName: 'CCM',
  edition: '14ª Edición',
  claim: 'El Ecosistema de Negocios y Tendencias más influyente del interior del país',
  year: 2026,
  /**
   * Clave del panel admin — mecanismo PROVISORIO de demo (Fase 0).
   * En Fase 1 se reemplaza por auth real con email+contraseña.
   */
  adminKey: 'ccm2026',
  instagramHandle: '@cordobacorazondemoda',
  instagramUrl: 'https://instagram.com/cordobacorazondemoda',
  produceCredit: 'Contenido IA Mabel',
  venue: {
    name: 'Hotel Quinto Centenario',
    address: 'Duarte Quirós 1300, Córdoba',
    mapsUrl: 'https://maps.google.com/?q=Hotel+Quinto+Centenario,+Duarte+Quir%C3%B3s+1300,+C%C3%B3rdoba',
  },
  mainDatesLabel: '19 y 20 de septiembre · 9 a 21 hs',
  countdownTo: '2026-09-19T09:00:00-03:00',
} as const
