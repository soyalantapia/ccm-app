/**
 * Países con su prefijo telefónico, para el selector del campo Teléfono.
 *
 * El orden NO es alfabético puro: primero Argentina y los países de la región, que son de donde
 * viene casi todo el público de CCM. Un asistente de Córdoba no debería scrollear 200 opciones
 * para encontrar la suya. El resto sigue alfabético.
 *
 * `iso` se usa para la bandera (se deriva del código de dos letras, sin imágenes) y como clave
 * estable: hay prefijos compartidos —+1 lo usan Estados Unidos, Canadá y todo el Caribe; +7
 * Rusia y Kazajistán— así que el prefijo solo no identifica al país.
 */

export interface Pais {
  iso: string
  nombre: string
  prefijo: string
}

/** Los de la región primero: son el grueso del público del evento. */
const REGION: Pais[] = [
  { iso: 'AR', nombre: 'Argentina', prefijo: '+54' },
  { iso: 'UY', nombre: 'Uruguay', prefijo: '+598' },
  { iso: 'CL', nombre: 'Chile', prefijo: '+56' },
  { iso: 'BR', nombre: 'Brasil', prefijo: '+55' },
  { iso: 'PY', nombre: 'Paraguay', prefijo: '+595' },
  { iso: 'BO', nombre: 'Bolivia', prefijo: '+591' },
  { iso: 'PE', nombre: 'Perú', prefijo: '+51' },
  { iso: 'CO', nombre: 'Colombia', prefijo: '+57' },
  { iso: 'MX', nombre: 'México', prefijo: '+52' },
  { iso: 'ES', nombre: 'España', prefijo: '+34' },
  { iso: 'US', nombre: 'Estados Unidos', prefijo: '+1' },
]

/** El resto del mundo, alfabético por nombre en español. */
const RESTO: Pais[] = [
  { iso: 'AF', nombre: 'Afganistán', prefijo: '+93' },
  { iso: 'AL', nombre: 'Albania', prefijo: '+355' },
  { iso: 'DE', nombre: 'Alemania', prefijo: '+49' },
  { iso: 'AD', nombre: 'Andorra', prefijo: '+376' },
  { iso: 'AO', nombre: 'Angola', prefijo: '+244' },
  { iso: 'AI', nombre: 'Anguila', prefijo: '+1' },
  { iso: 'AG', nombre: 'Antigua y Barbuda', prefijo: '+1' },
  { iso: 'SA', nombre: 'Arabia Saudita', prefijo: '+966' },
  { iso: 'DZ', nombre: 'Argelia', prefijo: '+213' },
  { iso: 'AM', nombre: 'Armenia', prefijo: '+374' },
  { iso: 'AW', nombre: 'Aruba', prefijo: '+297' },
  { iso: 'AU', nombre: 'Australia', prefijo: '+61' },
  { iso: 'AT', nombre: 'Austria', prefijo: '+43' },
  { iso: 'AZ', nombre: 'Azerbaiyán', prefijo: '+994' },
  { iso: 'BS', nombre: 'Bahamas', prefijo: '+1' },
  { iso: 'BD', nombre: 'Bangladés', prefijo: '+880' },
  { iso: 'BB', nombre: 'Barbados', prefijo: '+1' },
  { iso: 'BH', nombre: 'Baréin', prefijo: '+973' },
  { iso: 'BE', nombre: 'Bélgica', prefijo: '+32' },
  { iso: 'BZ', nombre: 'Belice', prefijo: '+501' },
  { iso: 'BJ', nombre: 'Benín', prefijo: '+229' },
  { iso: 'BM', nombre: 'Bermudas', prefijo: '+1' },
  { iso: 'BY', nombre: 'Bielorrusia', prefijo: '+375' },
  { iso: 'MM', nombre: 'Birmania', prefijo: '+95' },
  { iso: 'BA', nombre: 'Bosnia y Herzegovina', prefijo: '+387' },
  { iso: 'BW', nombre: 'Botsuana', prefijo: '+267' },
  { iso: 'BN', nombre: 'Brunéi', prefijo: '+673' },
  { iso: 'BG', nombre: 'Bulgaria', prefijo: '+359' },
  { iso: 'BF', nombre: 'Burkina Faso', prefijo: '+226' },
  { iso: 'BI', nombre: 'Burundi', prefijo: '+257' },
  { iso: 'BT', nombre: 'Bután', prefijo: '+975' },
  { iso: 'CV', nombre: 'Cabo Verde', prefijo: '+238' },
  { iso: 'KH', nombre: 'Camboya', prefijo: '+855' },
  { iso: 'CM', nombre: 'Camerún', prefijo: '+237' },
  { iso: 'CA', nombre: 'Canadá', prefijo: '+1' },
  { iso: 'QA', nombre: 'Catar', prefijo: '+974' },
  { iso: 'TD', nombre: 'Chad', prefijo: '+235' },
  { iso: 'CN', nombre: 'China', prefijo: '+86' },
  { iso: 'CY', nombre: 'Chipre', prefijo: '+357' },
  { iso: 'VA', nombre: 'Ciudad del Vaticano', prefijo: '+39' },
  { iso: 'KM', nombre: 'Comoras', prefijo: '+269' },
  { iso: 'CG', nombre: 'Congo', prefijo: '+242' },
  { iso: 'CD', nombre: 'Congo (RD)', prefijo: '+243' },
  { iso: 'KP', nombre: 'Corea del Norte', prefijo: '+850' },
  { iso: 'KR', nombre: 'Corea del Sur', prefijo: '+82' },
  { iso: 'CI', nombre: 'Costa de Marfil', prefijo: '+225' },
  { iso: 'CR', nombre: 'Costa Rica', prefijo: '+506' },
  { iso: 'HR', nombre: 'Croacia', prefijo: '+385' },
  { iso: 'CU', nombre: 'Cuba', prefijo: '+53' },
  { iso: 'CW', nombre: 'Curazao', prefijo: '+599' },
  { iso: 'DK', nombre: 'Dinamarca', prefijo: '+45' },
  { iso: 'DM', nombre: 'Dominica', prefijo: '+1' },
  { iso: 'EC', nombre: 'Ecuador', prefijo: '+593' },
  { iso: 'EG', nombre: 'Egipto', prefijo: '+20' },
  { iso: 'SV', nombre: 'El Salvador', prefijo: '+503' },
  { iso: 'AE', nombre: 'Emiratos Árabes Unidos', prefijo: '+971' },
  { iso: 'ER', nombre: 'Eritrea', prefijo: '+291' },
  { iso: 'SK', nombre: 'Eslovaquia', prefijo: '+421' },
  { iso: 'SI', nombre: 'Eslovenia', prefijo: '+386' },
  { iso: 'EE', nombre: 'Estonia', prefijo: '+372' },
  { iso: 'SZ', nombre: 'Esuatini', prefijo: '+268' },
  { iso: 'ET', nombre: 'Etiopía', prefijo: '+251' },
  { iso: 'PH', nombre: 'Filipinas', prefijo: '+63' },
  { iso: 'FI', nombre: 'Finlandia', prefijo: '+358' },
  { iso: 'FJ', nombre: 'Fiyi', prefijo: '+679' },
  { iso: 'FR', nombre: 'Francia', prefijo: '+33' },
  { iso: 'GA', nombre: 'Gabón', prefijo: '+241' },
  { iso: 'GM', nombre: 'Gambia', prefijo: '+220' },
  { iso: 'GE', nombre: 'Georgia', prefijo: '+995' },
  { iso: 'GH', nombre: 'Ghana', prefijo: '+233' },
  { iso: 'GI', nombre: 'Gibraltar', prefijo: '+350' },
  { iso: 'GD', nombre: 'Granada', prefijo: '+1' },
  { iso: 'GR', nombre: 'Grecia', prefijo: '+30' },
  { iso: 'GL', nombre: 'Groenlandia', prefijo: '+299' },
  { iso: 'GP', nombre: 'Guadalupe', prefijo: '+590' },
  { iso: 'GU', nombre: 'Guam', prefijo: '+1' },
  { iso: 'GT', nombre: 'Guatemala', prefijo: '+502' },
  { iso: 'GF', nombre: 'Guayana Francesa', prefijo: '+594' },
  { iso: 'GN', nombre: 'Guinea', prefijo: '+224' },
  { iso: 'GQ', nombre: 'Guinea Ecuatorial', prefijo: '+240' },
  { iso: 'GW', nombre: 'Guinea-Bisáu', prefijo: '+245' },
  { iso: 'GY', nombre: 'Guyana', prefijo: '+592' },
  { iso: 'HT', nombre: 'Haití', prefijo: '+509' },
  { iso: 'HN', nombre: 'Honduras', prefijo: '+504' },
  { iso: 'HK', nombre: 'Hong Kong', prefijo: '+852' },
  { iso: 'HU', nombre: 'Hungría', prefijo: '+36' },
  { iso: 'IN', nombre: 'India', prefijo: '+91' },
  { iso: 'ID', nombre: 'Indonesia', prefijo: '+62' },
  { iso: 'IQ', nombre: 'Irak', prefijo: '+964' },
  { iso: 'IR', nombre: 'Irán', prefijo: '+98' },
  { iso: 'IE', nombre: 'Irlanda', prefijo: '+353' },
  { iso: 'IS', nombre: 'Islandia', prefijo: '+354' },
  { iso: 'KY', nombre: 'Islas Caimán', prefijo: '+1' },
  { iso: 'FO', nombre: 'Islas Feroe', prefijo: '+298' },
  { iso: 'MV', nombre: 'Islas Maldivas', prefijo: '+960' },
  { iso: 'MH', nombre: 'Islas Marshall', prefijo: '+692' },
  { iso: 'SB', nombre: 'Islas Salomón', prefijo: '+677' },
  { iso: 'TC', nombre: 'Islas Turcas y Caicos', prefijo: '+1' },
  { iso: 'VG', nombre: 'Islas Vírgenes Británicas', prefijo: '+1' },
  { iso: 'VI', nombre: 'Islas Vírgenes de EE. UU.', prefijo: '+1' },
  { iso: 'IL', nombre: 'Israel', prefijo: '+972' },
  { iso: 'IT', nombre: 'Italia', prefijo: '+39' },
  { iso: 'JM', nombre: 'Jamaica', prefijo: '+1' },
  { iso: 'JP', nombre: 'Japón', prefijo: '+81' },
  { iso: 'JO', nombre: 'Jordania', prefijo: '+962' },
  { iso: 'KZ', nombre: 'Kazajistán', prefijo: '+7' },
  { iso: 'KE', nombre: 'Kenia', prefijo: '+254' },
  { iso: 'KG', nombre: 'Kirguistán', prefijo: '+996' },
  { iso: 'KI', nombre: 'Kiribati', prefijo: '+686' },
  { iso: 'KW', nombre: 'Kuwait', prefijo: '+965' },
  { iso: 'LA', nombre: 'Laos', prefijo: '+856' },
  { iso: 'LS', nombre: 'Lesoto', prefijo: '+266' },
  { iso: 'LV', nombre: 'Letonia', prefijo: '+371' },
  { iso: 'LB', nombre: 'Líbano', prefijo: '+961' },
  { iso: 'LR', nombre: 'Liberia', prefijo: '+231' },
  { iso: 'LY', nombre: 'Libia', prefijo: '+218' },
  { iso: 'LI', nombre: 'Liechtenstein', prefijo: '+423' },
  { iso: 'LT', nombre: 'Lituania', prefijo: '+370' },
  { iso: 'LU', nombre: 'Luxemburgo', prefijo: '+352' },
  { iso: 'MO', nombre: 'Macao', prefijo: '+853' },
  { iso: 'MK', nombre: 'Macedonia del Norte', prefijo: '+389' },
  { iso: 'MG', nombre: 'Madagascar', prefijo: '+261' },
  { iso: 'MY', nombre: 'Malasia', prefijo: '+60' },
  { iso: 'MW', nombre: 'Malaui', prefijo: '+265' },
  { iso: 'ML', nombre: 'Malí', prefijo: '+223' },
  { iso: 'MT', nombre: 'Malta', prefijo: '+356' },
  { iso: 'MA', nombre: 'Marruecos', prefijo: '+212' },
  { iso: 'MQ', nombre: 'Martinica', prefijo: '+596' },
  { iso: 'MU', nombre: 'Mauricio', prefijo: '+230' },
  { iso: 'MR', nombre: 'Mauritania', prefijo: '+222' },
  { iso: 'FM', nombre: 'Micronesia', prefijo: '+691' },
  { iso: 'MD', nombre: 'Moldavia', prefijo: '+373' },
  { iso: 'MC', nombre: 'Mónaco', prefijo: '+377' },
  { iso: 'MN', nombre: 'Mongolia', prefijo: '+976' },
  { iso: 'ME', nombre: 'Montenegro', prefijo: '+382' },
  { iso: 'MZ', nombre: 'Mozambique', prefijo: '+258' },
  { iso: 'NA', nombre: 'Namibia', prefijo: '+264' },
  { iso: 'NR', nombre: 'Nauru', prefijo: '+674' },
  { iso: 'NP', nombre: 'Nepal', prefijo: '+977' },
  { iso: 'NI', nombre: 'Nicaragua', prefijo: '+505' },
  { iso: 'NE', nombre: 'Níger', prefijo: '+227' },
  { iso: 'NG', nombre: 'Nigeria', prefijo: '+234' },
  { iso: 'NO', nombre: 'Noruega', prefijo: '+47' },
  { iso: 'NC', nombre: 'Nueva Caledonia', prefijo: '+687' },
  { iso: 'NZ', nombre: 'Nueva Zelanda', prefijo: '+64' },
  { iso: 'OM', nombre: 'Omán', prefijo: '+968' },
  { iso: 'NL', nombre: 'Países Bajos', prefijo: '+31' },
  { iso: 'PK', nombre: 'Pakistán', prefijo: '+92' },
  { iso: 'PW', nombre: 'Palaos', prefijo: '+680' },
  { iso: 'PS', nombre: 'Palestina', prefijo: '+970' },
  { iso: 'PA', nombre: 'Panamá', prefijo: '+507' },
  { iso: 'PG', nombre: 'Papúa Nueva Guinea', prefijo: '+675' },
  { iso: 'PF', nombre: 'Polinesia Francesa', prefijo: '+689' },
  { iso: 'PL', nombre: 'Polonia', prefijo: '+48' },
  { iso: 'PT', nombre: 'Portugal', prefijo: '+351' },
  { iso: 'PR', nombre: 'Puerto Rico', prefijo: '+1' },
  { iso: 'GB', nombre: 'Reino Unido', prefijo: '+44' },
  { iso: 'CF', nombre: 'República Centroafricana', prefijo: '+236' },
  { iso: 'CZ', nombre: 'República Checa', prefijo: '+420' },
  { iso: 'DO', nombre: 'República Dominicana', prefijo: '+1' },
  { iso: 'RE', nombre: 'Reunión', prefijo: '+262' },
  { iso: 'RW', nombre: 'Ruanda', prefijo: '+250' },
  { iso: 'RO', nombre: 'Rumania', prefijo: '+40' },
  { iso: 'RU', nombre: 'Rusia', prefijo: '+7' },
  { iso: 'WS', nombre: 'Samoa', prefijo: '+685' },
  { iso: 'KN', nombre: 'San Cristóbal y Nieves', prefijo: '+1' },
  { iso: 'SM', nombre: 'San Marino', prefijo: '+378' },
  { iso: 'VC', nombre: 'San Vicente y las Granadinas', prefijo: '+1' },
  { iso: 'LC', nombre: 'Santa Lucía', prefijo: '+1' },
  { iso: 'ST', nombre: 'Santo Tomé y Príncipe', prefijo: '+239' },
  { iso: 'SN', nombre: 'Senegal', prefijo: '+221' },
  { iso: 'RS', nombre: 'Serbia', prefijo: '+381' },
  { iso: 'SC', nombre: 'Seychelles', prefijo: '+248' },
  { iso: 'SL', nombre: 'Sierra Leona', prefijo: '+232' },
  { iso: 'SG', nombre: 'Singapur', prefijo: '+65' },
  { iso: 'SY', nombre: 'Siria', prefijo: '+963' },
  { iso: 'SO', nombre: 'Somalia', prefijo: '+252' },
  { iso: 'LK', nombre: 'Sri Lanka', prefijo: '+94' },
  { iso: 'ZA', nombre: 'Sudáfrica', prefijo: '+27' },
  { iso: 'SD', nombre: 'Sudán', prefijo: '+249' },
  { iso: 'SS', nombre: 'Sudán del Sur', prefijo: '+211' },
  { iso: 'SE', nombre: 'Suecia', prefijo: '+46' },
  { iso: 'CH', nombre: 'Suiza', prefijo: '+41' },
  { iso: 'SR', nombre: 'Surinam', prefijo: '+597' },
  { iso: 'TH', nombre: 'Tailandia', prefijo: '+66' },
  { iso: 'TW', nombre: 'Taiwán', prefijo: '+886' },
  { iso: 'TZ', nombre: 'Tanzania', prefijo: '+255' },
  { iso: 'TJ', nombre: 'Tayikistán', prefijo: '+992' },
  { iso: 'TL', nombre: 'Timor Oriental', prefijo: '+670' },
  { iso: 'TG', nombre: 'Togo', prefijo: '+228' },
  { iso: 'TO', nombre: 'Tonga', prefijo: '+676' },
  { iso: 'TT', nombre: 'Trinidad y Tobago', prefijo: '+1' },
  { iso: 'TN', nombre: 'Túnez', prefijo: '+216' },
  { iso: 'TM', nombre: 'Turkmenistán', prefijo: '+993' },
  { iso: 'TR', nombre: 'Turquía', prefijo: '+90' },
  { iso: 'TV', nombre: 'Tuvalu', prefijo: '+688' },
  { iso: 'UA', nombre: 'Ucrania', prefijo: '+380' },
  { iso: 'UG', nombre: 'Uganda', prefijo: '+256' },
  { iso: 'UZ', nombre: 'Uzbekistán', prefijo: '+998' },
  { iso: 'VU', nombre: 'Vanuatu', prefijo: '+678' },
  { iso: 'VE', nombre: 'Venezuela', prefijo: '+58' },
  { iso: 'VN', nombre: 'Vietnam', prefijo: '+84' },
  { iso: 'YE', nombre: 'Yemen', prefijo: '+967' },
  { iso: 'DJ', nombre: 'Yibuti', prefijo: '+253' },
  { iso: 'ZM', nombre: 'Zambia', prefijo: '+260' },
  { iso: 'ZW', nombre: 'Zimbabue', prefijo: '+263' },
]

export const PAISES: Pais[] = [...REGION, ...RESTO]

/** Argentina: el evento es en Córdoba, así que es el default razonable. */
export const PAIS_POR_DEFECTO = PAISES[0]

/**
 * Bandera como emoji, derivada del ISO: cada letra se mapea a su Regional Indicator Symbol.
 * Sin imágenes ni dependencias — el sistema operativo la dibuja.
 */
export function banderaDe(iso: string): string {
  return iso
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('')
}

/**
 * Separa un teléfono guardado en país + resto.
 *
 * Los teléfonos que ya están en la base se guardaron con formato libre, así que esto tiene que
 * aguantar cualquier cosa: con prefijo, sin prefijo, con espacios o paréntesis. Si no se
 * reconoce ningún prefijo, se devuelve el número tal cual con el país por defecto — nunca se
 * descarta lo que la persona ya había cargado.
 *
 * Ante prefijos que son prefijo de otro (+1 y +1 809, +7 y +7…), gana el MÁS LARGO, y entre
 * países que comparten prefijo exacto gana el primero de la lista (la región va primero).
 */
export function separarTelefono(valor: string): { pais: Pais; numero: string } {
  const limpio = (valor ?? '').trim()
  if (!limpio) return { pais: PAIS_POR_DEFECTO, numero: '' }
  if (!limpio.startsWith('+')) return { pais: PAIS_POR_DEFECTO, numero: limpio }

  const soloDigitos = '+' + limpio.slice(1).replace(/\D/g, '')
  let mejor: Pais | undefined
  for (const p of PAISES) {
    if (!soloDigitos.startsWith(p.prefijo)) continue
    if (!mejor || p.prefijo.length > mejor.prefijo.length) mejor = p
  }
  if (!mejor) return { pais: PAIS_POR_DEFECTO, numero: limpio }

  // Se corta sobre el original para no perder el formato que escribió la persona.
  const resto = limpio.slice(limpio.indexOf(mejor.prefijo) + mejor.prefijo.length).trim()
  return { pais: mejor, numero: resto }
}

/** Une país y número en el string único que se persiste. */
export function unirTelefono(pais: Pais, numero: string): string {
  const n = (numero ?? '').trim()
  return n ? `${pais.prefijo} ${n}` : ''
}
