// Mapping of team IDs to ISO 3166-1 alpha-2 country codes for FlagsAPI
// FlagsAPI URL format: https://flagsapi.com/{CODE}/flat/64.png

export const COUNTRY_CODES: Record<string, string> = {
  // Europe
  'ger': 'DE', 'fra': 'FR', 'esp': 'ES', 'ita': 'IT', 'eng': 'GB-ENG',
  'ned': 'NL', 'por': 'PT', 'bel': 'BE', 'cro': 'HR', 'den': 'DK',
  'sui': 'CH', 'aut': 'AT', 'swe': 'SE', 'pol': 'PL', 'ukr': 'UA',
  'ser': 'RS', 'tur': 'TR', 'cze': 'CZ', 'wal': 'GB-WLS', 'sco': 'GB-SCT',
  'nor': 'NO', 'rus': 'RU', 'rou': 'RO', 'hun': 'HU', 'gre': 'GR',
  'svk': 'SK', 'fin': 'FI', 'bih': 'BA', 'isl': 'IS', 'ire': 'IE',
  'nir': 'GB-NIR', 'alb': 'AL', 'svn': 'SI', 'mkd': 'MK', 'bul': 'BG',
  'mne': 'ME', 'isr': 'IL', 'geo': 'GE', 'arm': 'AM', 'aze': 'AZ',
  'kaz': 'KZ', 'blr': 'BY', 'lux': 'LU', 'cyp': 'CY', 'est': 'EE',
  'lva': 'LV', 'ltu': 'LT', 'fro': 'FO', 'mlt': 'MT', 'mda': 'MD',
  'kos': 'XK', 'lie': 'LI', 'and': 'AD', 'smr': 'SM', 'gib': 'GI',

  // South America
  'bra': 'BR', 'arg': 'AR', 'uru': 'UY', 'col': 'CO', 'chi': 'CL',
  'par': 'PY', 'ecu': 'EC', 'per': 'PE', 'ven': 'VE', 'bol': 'BO',

  // North America
  'mex': 'MX', 'usa': 'US', 'can': 'CA', 'crc': 'CR', 'jam': 'JM',
  'pan': 'PA', 'hon': 'HN', 'slv': 'SV', 'tri': 'TT', 'hti': 'HT',
  'cub': 'CU', 'gua': 'GT', 'nic': 'NI', 'sur': 'SR', 'brb': 'BB',
  'dom': 'DO', 'ber': 'BM', 'blz': 'BZ', 'guy': 'GY', 'pue': 'PR',
  'cuw': 'CW', 'atg': 'AG', 'skn': 'KN', 'lca': 'LC', 'vin': 'VC',
  'grn': 'GD', 'msr': 'MS', 'dma': 'DM', 'aru': 'AW', 'cay': 'KY',
  'bah': 'BS', 'tca': 'TC', 'vgb': 'VG', 'vir': 'VI', 'aia': 'AI',

  // Africa
  'sen': 'SN', 'mar': 'MA', 'tun': 'TN', 'alg': 'DZ', 'egy': 'EG',
  'nga': 'NG', 'cmr': 'CM', 'gha': 'GH', 'civ': 'CI', 'mli': 'ML',
  'bfa': 'BF', 'cgo': 'CD', 'zaf': 'ZA', 'gab': 'GA', 'gui': 'GN',
  'cap': 'CV', 'uga': 'UG', 'zam': 'ZM', 'ken': 'KE', 'mad': 'MG',
  'mau': 'MR', 'ben': 'BJ', 'nig': 'NE', 'tog': 'TG', 'gui-bis': 'GW',
  'rwa': 'RW', 'bdi': 'BI', 'eth': 'ET', 'tan': 'TZ', 'zim': 'ZW',
  'nam': 'NA', 'moz': 'MZ', 'ang': 'AO', 'lbr': 'LR', 'sle': 'SL',
  'mal': 'MW', 'cgob': 'CG', 'eqg': 'GQ', 'cta': 'CF', 'cha': 'TD',
  'stp': 'ST', 'gam': 'GM', 'mri': 'MU', 'com': 'KM', 'sey': 'SC',
  'dji': 'DJ', 'som': 'SO', 'ssd': 'SS', 'eri': 'ER', 'les': 'LS',
  'bot': 'BW', 'swa': 'SZ', 'lby': 'LY', 'sud': 'SD',

  // Asia
  'jpn': 'JP', 'kor': 'KR', 'irn': 'IR', 'aus': 'AU', 'sau': 'SA',
  'qat': 'QA', 'uae': 'AE', 'irq': 'IQ', 'chn': 'CN', 'uzb': 'UZ',
  'tha': 'TH', 'vie': 'VN', 'omn': 'OM', 'jor': 'JO', 'bhr': 'BH',
  'syr': 'SY', 'lbn': 'LB', 'pal': 'PS', 'kuw': 'KW', 'tkm': 'TM',
  'kgz': 'KG', 'tjk': 'TJ', 'afg': 'AF', 'ind': 'IN', 'mya': 'MM',
  'phi': 'PH', 'idn': 'ID', 'mas': 'MY', 'sin': 'SG', 'ban': 'BD',
  'prk': 'KP', 'hkg': 'HK', 'yem': 'YE', 'pak': 'PK', 'sri': 'LK',
  'mdv': 'MV', 'nep': 'NP', 'bhu': 'BT', 'cam': 'KH', 'lao': 'LA',
  'tls': 'TL', 'bru': 'BN', 'mac': 'MO', 'mon': 'MN', 'tpe': 'TW',
  'gum': 'GU',

  // Oceania (now part of Asia confederation)
  'nzl': 'NZ', 'png': 'PG', 'fij': 'FJ', 'ncl': 'NC', 'tah': 'PF',
  'slb': 'SB', 'van': 'VU', 'cok': 'CK', 'sam': 'WS', 'asa': 'AS',
  'ton': 'TO',
};

/**
 * Get flag URL from FlagsAPI
 * @param teamId - Team ID from our system
 * @param size - Size in pixels (16, 24, 32, 48, 64)
 * @param style - Style of flag ('flat' or 'shiny')
 * @returns URL to flag image
 */
export function getFlagUrl(
  teamId: string,
  size: 16 | 24 | 32 | 48 | 64 = 64,
  style: 'flat' | 'shiny' = 'flat'
): string {
  const code = COUNTRY_CODES[teamId];
  if (!code) {
    console.warn(`No country code found for team: ${teamId}`);
    return '';
  }
  return `https://flagsapi.com/${code}/${style}/${size}.png`;
}

/**
 * Get country code for a team
 * @param teamId - Team ID from our system
 * @returns ISO 3166-1 alpha-2 country code or undefined
 */
export function getCountryCode(teamId: string): string | undefined {
  return COUNTRY_CODES[teamId];
}
