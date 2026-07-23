// Mapping of team IDs to flagcdn country codes
// flagcdn URL format: https://flagcdn.com/64x48/ar.png

export const COUNTRY_CODES: Record<string, string> = {
  // Europe
  'ger': 'de', 'fra': 'fr', 'esp': 'es', 'ita': 'it', 'eng': 'gb-eng',
  'ned': 'nl', 'por': 'pt', 'bel': 'be', 'cro': 'hr', 'den': 'dk',
  'sui': 'ch', 'aut': 'at', 'swe': 'se', 'pol': 'pl', 'ukr': 'ua',
  'ser': 'rs', 'tur': 'tr', 'cze': 'cz', 'wal': 'gb-wls', 'sco': 'gb-sct',
  'nor': 'no', 'rus': 'ru', 'rou': 'ro', 'hun': 'hu', 'gre': 'gr',
  'svk': 'sk', 'fin': 'fi', 'bih': 'ba', 'isl': 'is', 'ire': 'ie',
  'nir': 'gb-nir', 'alb': 'al', 'svn': 'si', 'mkd': 'mk', 'bul': 'bg',
  'mne': 'me', 'isr': 'il', 'geo': 'ge', 'arm': 'am', 'aze': 'az',
  'kaz': 'kz', 'blr': 'by', 'lux': 'lu', 'cyp': 'cy', 'est': 'ee',
  'lva': 'lv', 'ltu': 'lt', 'fro': 'fo', 'mlt': 'mt', 'mda': 'md',
  'kos': 'xk', 'lie': 'li', 'and': 'ad', 'smr': 'sm', 'gib': 'gi',

  // South America
  'bra': 'br', 'arg': 'ar', 'uru': 'uy', 'col': 'co', 'chi': 'cl',
  'par': 'py', 'ecu': 'ec', 'per': 'pe', 'ven': 've', 'bol': 'bo',

  // North America
  'mex': 'mx', 'usa': 'us', 'can': 'ca', 'crc': 'cr', 'jam': 'jm',
  'pan': 'pa', 'hon': 'hn', 'slv': 'sv', 'tri': 'tt', 'hti': 'ht',
  'cub': 'cu', 'gua': 'gt', 'nic': 'ni', 'sur': 'sr', 'brb': 'bb',
  'dom': 'do', 'ber': 'bm', 'blz': 'bz', 'guy': 'gy', 'pue': 'pr',
  'cuw': 'cw', 'atg': 'ag', 'skn': 'kn', 'lca': 'lc', 'vin': 'vc',
  'grn': 'gd', 'msr': 'ms', 'dma': 'dm', 'aru': 'aw', 'cay': 'ky',
  'bah': 'bs', 'tca': 'tc', 'vgb': 'vg', 'vir': 'vi', 'aia': 'ai',

  // Africa
  'sen': 'sn', 'mar': 'ma', 'tun': 'tn', 'alg': 'dz', 'egy': 'eg',
  'nga': 'ng', 'cmr': 'cm', 'gha': 'gh', 'civ': 'ci', 'mli': 'ml',
  'bfa': 'bf', 'cgo': 'cd', 'zaf': 'za', 'gab': 'ga', 'gui': 'gn',
  'cap': 'cv', 'uga': 'ug', 'zam': 'zm', 'ken': 'ke', 'mad': 'mg',
  'mau': 'mr', 'ben': 'bj', 'nig': 'ne', 'tog': 'tg', 'gui-bis': 'gw',
  'rwa': 'rw', 'bdi': 'bi', 'eth': 'et', 'tan': 'tz', 'zim': 'zw',
  'nam': 'na', 'moz': 'mz', 'ang': 'ao', 'lbr': 'lr', 'sle': 'sl',
  'mal': 'mw', 'cgob': 'cg', 'eqg': 'gq', 'cta': 'cf', 'cha': 'td',
  'stp': 'st', 'gam': 'gm', 'mri': 'mu', 'com': 'km', 'sey': 'sc',
  'dji': 'dj', 'som': 'so', 'ssd': 'ss', 'eri': 'er', 'les': 'ls',
  'bot': 'bw', 'swa': 'sz', 'lby': 'ly', 'sud': 'sd',

  // Asia
  'jpn': 'jp', 'kor': 'kr', 'irn': 'ir', 'aus': 'au', 'sau': 'sa',
  'qat': 'qa', 'uae': 'ae', 'irq': 'iq', 'chn': 'cn', 'uzb': 'uz',
  'tha': 'th', 'vie': 'vn', 'omn': 'om', 'jor': 'jo', 'bhr': 'bh',
  'syr': 'sy', 'lbn': 'lb', 'pal': 'ps', 'kuw': 'kw', 'tkm': 'tm',
  'kgz': 'kg', 'tjk': 'tj', 'afg': 'af', 'ind': 'in', 'mya': 'mm',
  'phi': 'ph', 'idn': 'id', 'mas': 'my', 'sin': 'sg', 'ban': 'bd',
  'prk': 'kp', 'hkg': 'hk', 'yem': 'ye', 'pak': 'pk', 'sri': 'lk',
  'mdv': 'mv', 'nep': 'np', 'bhu': 'bt', 'cam': 'kh', 'lao': 'la',
  'tls': 'tl', 'bru': 'bn', 'mac': 'mo', 'mon': 'mn', 'tpe': 'tw',
  'gum': 'gu',

  // Oceania (now part of Asia confederation)
  'nzl': 'nz', 'png': 'pg', 'fij': 'fj', 'ncl': 'nc', 'tah': 'pf',
  'slb': 'sb', 'van': 'vu', 'cok': 'ck', 'sam': 'ws', 'asa': 'as',
  'ton': 'to',
};

/**
 * Tamaños de bandera disponibles y su equivalente en flagcdn.
 * Todos respetan el ratio 4:3 con el que TeamFlag dibuja la imagen, así que la
 * bandera llena el recuadro sin deformarse.
 */
const FLAG_SIZES = {
  16: '16x12',
  24: '24x18',
  32: '32x24',
  48: '48x36',
  64: '64x48',
} as const;

export type FlagSize = keyof typeof FLAG_SIZES;

/**
 * Devuelve la URL de la bandera de un equipo.
 *
 * La URL se deriva siempre del teamId: es la única fuente de verdad. No se lee
 * de la base — guardarla ahí fue lo que dejó podrido el parche anterior de las
 * banderas británicas cuando el proveedor cambió.
 *
 * @param teamId - ID del equipo en nuestro sistema
 * @param size - Alto/ancho pedido, en el ratio 4:3 que usa TeamFlag
 * @returns URL de la imagen, o cadena vacía si el equipo no tiene código
 */
export function getFlagUrl(teamId: string, size: FlagSize = 64): string {
  const code = COUNTRY_CODES[teamId];
  if (!code) {
    console.warn(`No country code found for team: ${teamId}`);
    return '';
  }
  return `https://flagcdn.com/${FLAG_SIZES[size]}/${code}.png`;
}
