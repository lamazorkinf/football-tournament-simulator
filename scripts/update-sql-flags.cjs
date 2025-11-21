const fs = require('fs');

const COUNTRY_CODES = {
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
  'bra': 'BR', 'arg': 'AR', 'uru': 'UY', 'col': 'CO', 'chi': 'CL',
  'par': 'PY', 'ecu': 'EC', 'per': 'PE', 'ven': 'VE', 'bol': 'BO',
  'mex': 'MX', 'usa': 'US', 'can': 'CA', 'crc': 'CR', 'jam': 'JM',
  'pan': 'PA', 'hon': 'HN', 'slv': 'SV', 'tri': 'TT', 'hti': 'HT',
  'cub': 'CU', 'gua': 'GT', 'nic': 'NI', 'sur': 'SR', 'brb': 'BB',
  'dom': 'DO', 'ber': 'BM', 'blz': 'BZ', 'guy': 'GY', 'pue': 'PR',
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
  'nzl': 'NZ', 'png': 'PG', 'fij': 'FJ', 'ncl': 'NC', 'tah': 'PF',
  'slb': 'SB', 'van': 'VU', 'cok': 'CK', 'sam': 'WS', 'asa': 'AS',
  'ton': 'TO'
};

// Read teams.json to get all team data
const teams = require('../src/data/teams.json');

// Generate SQL insert values
const insertValues = teams.map(team => {
  const code = COUNTRY_CODES[team.id];
  const flagUrl = `https://flagsapi.com/${code}/flat/64.png`;
  return `  ('${team.id}', '${team.name}', '${flagUrl}', '${team.region}', ${team.skill})`;
}).join(',\n');

// Read the template
let sql = fs.readFileSync('./supabase/seed_teams.sql', 'utf8');

// Find the INSERT section and replace it
const insertStart = sql.indexOf('INSERT INTO teams');
const insertEnd = sql.indexOf('ON CONFLICT');
const beforeInsert = sql.substring(0, insertStart);
const afterInsert = sql.substring(insertEnd);

const newSql = beforeInsert +
  'INSERT INTO teams (id, name, flag, region, skill) VALUES\n' +
  insertValues + '\n' +
  afterInsert;

fs.writeFileSync('./supabase/seed_teams.sql', newSql);
console.log('✅ Updated seed_teams.sql with flag URLs for all 211 teams');
