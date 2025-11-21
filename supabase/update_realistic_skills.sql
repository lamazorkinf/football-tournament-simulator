-- Update Team Skills to Realistic Values Based on FIFA Rankings (December 2024)
-- This script updates all team skill ratings to reflect actual team strength
-- Scale: 30-100 (30 = weakest, 100 = strongest)
-- Based on current FIFA World Rankings and confederation strength

-- ELITE TIER (90-95) - Top 3 Teams Globally
UPDATE teams SET skill = 94 WHERE id = 'arg'; -- Argentina (World Champions, Rank 1)
UPDATE teams SET skill = 92 WHERE id = 'fra'; -- France (Rank 2)
UPDATE teams SET skill = 91 WHERE id = 'esp'; -- Spain (Rank 3)

-- WORLD CLASS (85-89) - Top 10 Global Powers
UPDATE teams SET skill = 88 WHERE id = 'eng'; -- England (Rank 4)
UPDATE teams SET skill = 86 WHERE id = 'bra'; -- Brazil (Rank 5)
UPDATE teams SET skill = 85 WHERE id = 'por'; -- Portugal (Rank 6)
UPDATE teams SET skill = 85 WHERE id = 'ned'; -- Netherlands (Rank 7)
UPDATE teams SET skill = 84 WHERE id = 'bel'; -- Belgium (Rank 8)

-- STRONG TIER (75-84) - Top 25 Teams
UPDATE teams SET skill = 83 WHERE id = 'ita'; -- Italy (Rank 9)
UPDATE teams SET skill = 82 WHERE id = 'ger'; -- Germany (Rank 10)
UPDATE teams SET skill = 80 WHERE id = 'uru'; -- Uruguay (Rank 11)
UPDATE teams SET skill = 80 WHERE id = 'col'; -- Colombia (Rank 12)
UPDATE teams SET skill = 79 WHERE id = 'cro'; -- Croatia (Rank 13)
UPDATE teams SET skill = 78 WHERE id = 'mar'; -- Morocco (Rank 14)
UPDATE teams SET skill = 76 WHERE id = 'jpn'; -- Japan (Rank 15)
UPDATE teams SET skill = 75 WHERE id = 'usa'; -- United States (Rank 16)
UPDATE teams SET skill = 75 WHERE id = 'sen'; -- Senegal (Rank 17)

-- COMPETITIVE TIER (65-74) - Top 50 Teams
UPDATE teams SET skill = 74 WHERE id = 'irn'; -- Iran (Rank 18)
UPDATE teams SET skill = 73 WHERE id = 'mex'; -- Mexico (Rank 19)
UPDATE teams SET skill = 73 WHERE id = 'sui'; -- Switzerland (Rank 20)
UPDATE teams SET skill = 72 WHERE id = 'den'; -- Denmark (Rank 21)
UPDATE teams SET skill = 72 WHERE id = 'kor'; -- South Korea (Rank 22)
UPDATE teams SET skill = 71 WHERE id = 'ecu'; -- Ecuador (Rank 23)
UPDATE teams SET skill = 70 WHERE id = 'aut'; -- Austria (Rank 24)
UPDATE teams SET skill = 70 WHERE id = 'tur'; -- Turkey (Rank 25)
UPDATE teams SET skill = 69 WHERE id = 'aus'; -- Australia (Rank 26)
UPDATE teams SET skill = 69 WHERE id = 'ukr'; -- Ukraine (Rank 27)
UPDATE teams SET skill = 68 WHERE id = 'can'; -- Canada (Rank 28)
UPDATE teams SET skill = 68 WHERE id = 'nor'; -- Norway (Rank 29)
UPDATE teams SET skill = 67 WHERE id = 'pan'; -- Panama (Rank 30)

-- SOLID TIER (60-64) - Ranks 31-50
UPDATE teams SET skill = 67 WHERE id = 'pol'; -- Poland
UPDATE teams SET skill = 66 WHERE id = 'swe'; -- Sweden
UPDATE teams SET skill = 66 WHERE id = 'nga'; -- Nigeria
UPDATE teams SET skill = 65 WHERE id = 'wal'; -- Wales
UPDATE teams SET skill = 65 WHERE id = 'cze'; -- Czech Republic
UPDATE teams SET skill = 64 WHERE id = 'egy'; -- Egypt
UPDATE teams SET skill = 64 WHERE id = 'alg'; -- Algeria
UPDATE teams SET skill = 63 WHERE id = 'per'; -- Peru
UPDATE teams SET skill = 63 WHERE id = 'crc'; -- Costa Rica
UPDATE teams SET skill = 62 WHERE id = 'chi'; -- Chile
UPDATE teams SET skill = 62 WHERE id = 'civ'; -- Côte d'Ivoire
UPDATE teams SET skill = 61 WHERE id = 'ser'; -- Serbia
UPDATE teams SET skill = 61 WHERE id = 'hun'; -- Hungary
UPDATE teams SET skill = 60 WHERE id = 'tun'; -- Tunisia
UPDATE teams SET skill = 60 WHERE id = 'sau'; -- Saudi Arabia

-- MID-TIER (50-59) - Ranks 51-100
UPDATE teams SET skill = 59 WHERE id = 'par'; -- Paraguay
UPDATE teams SET skill = 59 WHERE id = 'gre'; -- Greece
UPDATE teams SET skill = 58 WHERE id = 'rou'; -- Romania
UPDATE teams SET skill = 58 WHERE id = 'cmr'; -- Cameroon
UPDATE teams SET skill = 57 WHERE id = 'jam'; -- Jamaica
UPDATE teams SET skill = 57 WHERE id = 'sco'; -- Scotland
UPDATE teams SET skill = 56 WHERE id = 'ven'; -- Venezuela
UPDATE teams SET skill = 56 WHERE id = 'gha'; -- Ghana
UPDATE teams SET skill = 55 WHERE id = 'ire'; -- Ireland
UPDATE teams SET skill = 55 WHERE id = 'qat'; -- Qatar
UPDATE teams SET skill = 54 WHERE id = 'fin'; -- Finland
UPDATE teams SET skill = 54 WHERE id = 'alb'; -- Albania
UPDATE teams SET skill = 54 WHERE id = 'bfa'; -- Burkina Faso
UPDATE teams SET skill = 53 WHERE id = 'hon'; -- Honduras
UPDATE teams SET skill = 53 WHERE id = 'irq'; -- Iraq
UPDATE teams SET skill = 52 WHERE id = 'svk'; -- Slovakia
UPDATE teams SET skill = 52 WHERE id = 'mli'; -- Mali
UPDATE teams SET skill = 52 WHERE id = 'uzb'; -- Uzbekistan
UPDATE teams SET skill = 51 WHERE id = 'slv'; -- El Salvador
UPDATE teams SET skill = 51 WHERE id = 'isl'; -- Iceland
UPDATE teams SET skill = 51 WHERE id = 'gab'; -- Gabon
UPDATE teams SET skill = 50 WHERE id = 'bol'; -- Bolivia
UPDATE teams SET skill = 50 WHERE id = 'bul'; -- Bulgaria
UPDATE teams SET skill = 50 WHERE id = 'zaf'; -- South Africa

-- LOWER MID-TIER (45-49) - Ranks 101-130
UPDATE teams SET skill = 49 WHERE id = 'geo'; -- Georgia
UPDATE teams SET skill = 49 WHERE id = 'cgo'; -- Congo DR
UPDATE teams SET skill = 48 WHERE id = 'mkd'; -- North Macedonia
UPDATE teams SET skill = 48 WHERE id = 'omn'; -- Oman
UPDATE teams SET skill = 47 WHERE id = 'cub'; -- Cuba
UPDATE teams SET skill = 47 WHERE id = 'uae'; -- UAE
UPDATE teams SET skill = 47 WHERE id = 'gui'; -- Guinea
UPDATE teams SET skill = 46 WHERE id = 'bih'; -- Bosnia and Herzegovina
UPDATE teams SET skill = 46 WHERE id = 'kuw'; -- Kuwait
UPDATE teams SET skill = 46 WHERE id = 'cap'; -- Cape Verde
UPDATE teams SET skill = 45 WHERE id = 'svn'; -- Slovenia
UPDATE teams SET skill = 45 WHERE id = 'nir'; -- Northern Ireland
UPDATE teams SET skill = 45 WHERE id = 'ben'; -- Benin
UPDATE teams SET skill = 45 WHERE id = 'uga'; -- Uganda

-- DEVELOPING TIER (40-44) - Ranks 131-160
UPDATE teams SET skill = 44 WHERE id = 'gua'; -- Guatemala
UPDATE teams SET skill = 44 WHERE id = 'jor'; -- Jordan
UPDATE teams SET skill = 44 WHERE id = 'zam'; -- Zambia
UPDATE teams SET skill = 43 WHERE id = 'lux'; -- Luxembourg
UPDATE teams SET skill = 43 WHERE id = 'bhr'; -- Bahrain
UPDATE teams SET skill = 43 WHERE id = 'ken'; -- Kenya
UPDATE teams SET skill = 42 WHERE id = 'kaz'; -- Kazakhstan
UPDATE teams SET skill = 42 WHERE id = 'arm'; -- Armenia
UPDATE teams SET skill = 42 WHERE id = 'tha'; -- Thailand
UPDATE teams SET skill = 42 WHERE id = 'mau'; -- Mauritania
UPDATE teams SET skill = 41 WHERE id = 'aze'; -- Azerbaijan
UPDATE teams SET skill = 41 WHERE id = 'chn'; -- China
UPDATE teams SET skill = 41 WHERE id = 'vie'; -- Vietnam
UPDATE teams SET skill = 41 WHERE id = 'mad'; -- Madagascar
UPDATE teams SET skill = 40 WHERE id = 'blr'; -- Belarus
UPDATE teams SET skill = 40 WHERE id = 'lbn'; -- Lebanon
UPDATE teams SET skill = 40 WHERE id = 'idn'; -- Indonesia
UPDATE teams SET skill = 40 WHERE id = 'nam'; -- Namibia

-- WEAK TIER (35-39) - Ranks 161-185
UPDATE teams SET skill = 39 WHERE id = 'cyp'; -- Cyprus
UPDATE teams SET skill = 39 WHERE id = 'syr'; -- Syria
UPDATE teams SET skill = 39 WHERE id = 'ind'; -- India
UPDATE teams SET skill = 39 WHERE id = 'tog'; -- Togo
UPDATE teams SET skill = 38 WHERE id = 'mne'; -- Montenegro
UPDATE teams SET skill = 38 WHERE id = 'kgz'; -- Kyrgyzstan
UPDATE teams SET skill = 38 WHERE id = 'mas'; -- Malaysia
UPDATE teams SET skill = 38 WHERE id = 'nig'; -- Niger
UPDATE teams SET skill = 37 WHERE id = 'est'; -- Estonia
UPDATE teams SET skill = 37 WHERE id = 'tri'; -- Trinidad and Tobago
UPDATE teams SET skill = 37 WHERE id = 'pal'; -- Palestine
UPDATE teams SET skill = 37 WHERE id = 'zim'; -- Zimbabwe
UPDATE teams SET skill = 36 WHERE id = 'lva'; -- Latvia
UPDATE teams SET skill = 36 WHERE id = 'nic'; -- Nicaragua
UPDATE teams SET skill = 36 WHERE id = 'phi'; -- Philippines
UPDATE teams SET skill = 36 WHERE id = 'moz'; -- Mozambique
UPDATE teams SET skill = 35 WHERE id = 'ltu'; -- Lithuania
UPDATE teams SET skill = 35 WHERE id = 'hti'; -- Haiti
UPDATE teams SET skill = 35 WHERE id = 'tkm'; -- Turkmenistan
UPDATE teams SET skill = 35 WHERE id = 'mal'; -- Malawi

-- VERY WEAK TIER (30-34) - Ranks 186-210+
UPDATE teams SET skill = 34 WHERE id = 'isr'; -- Israel
UPDATE teams SET skill = 34 WHERE id = 'tjk'; -- Tajikistan
UPDATE teams SET skill = 34 WHERE id = 'sin'; -- Singapore
UPDATE teams SET skill = 34 WHERE id = 'ang'; -- Angola
UPDATE teams SET skill = 33 WHERE id = 'fro'; -- Faroe Islands
UPDATE teams SET skill = 33 WHERE id = 'afg'; -- Afghanistan
UPDATE teams SET skill = 33 WHERE id = 'ban'; -- Bangladesh
UPDATE teams SET skill = 33 WHERE id = 'rwa'; -- Rwanda
UPDATE teams SET skill = 32 WHERE id = 'mlt'; -- Malta
UPDATE teams SET skill = 32 WHERE id = 'mya'; -- Myanmar
UPDATE teams SET skill = 32 WHERE id = 'lbr'; -- Liberia
UPDATE teams SET skill = 31 WHERE id = 'and'; -- Andorra
UPDATE teams SET skill = 31 WHERE id = 'nep'; -- Nepal
UPDATE teams SET skill = 31 WHERE id = 'cgob'; -- Congo
UPDATE teams SET skill = 30 WHERE id = 'lie'; -- Liechtenstein
UPDATE teams SET skill = 30 WHERE id = 'prk'; -- North Korea
UPDATE teams SET skill = 30 WHERE id = 'eqg'; -- Equatorial Guinea

-- Additional teams that might be in database
UPDATE teams SET skill = 38 WHERE id = 'rus'; -- Russia (special case, banned but historically strong)
UPDATE teams SET skill = 45 WHERE id = 'mda'; -- Moldova
UPDATE teams SET skill = 42 WHERE id = 'kos'; -- Kosovo
UPDATE teams SET skill = 35 WHERE id = 'sur'; -- Suriname
UPDATE teams SET skill = 34 WHERE id = 'guy'; -- Guyana
UPDATE teams SET skill = 33 WHERE id = 'brb'; -- Barbados
UPDATE teams SET skill = 32 WHERE id = 'dom'; -- Dominican Republic
UPDATE teams SET skill = 31 WHERE id = 'ber'; -- Bermuda
UPDATE teams SET skill = 30 WHERE id = 'blz'; -- Belize
UPDATE teams SET skill = 38 WHERE id = 'sey'; -- Seychelles
UPDATE teams SET skill = 37 WHERE id = 'com'; -- Comoros
UPDATE teams SET skill = 36 WHERE id = 'mri'; -- Mauritius
UPDATE teams SET skill = 35 WHERE id = 'dji'; -- Djibouti
UPDATE teams SET skill = 34 WHERE id = 'som'; -- Somalia
UPDATE teams SET skill = 33 WHERE id = 'eri'; -- Eritrea
UPDATE teams SET skill = 32 WHERE id = 'ssd'; -- South Sudan
UPDATE teams SET skill = 31 WHERE id = 'cta'; -- Central African Republic
UPDATE teams SET skill = 30 WHERE id = 'cha'; -- Chad
UPDATE teams SET skill = 30 WHERE id = 'gam'; -- Gambia
UPDATE teams SET skill = 32 WHERE id = 'sle'; -- Sierra Leone
UPDATE teams SET skill = 31 WHERE id = 'gui-bis'; -- Guinea-Bissau
UPDATE teams SET skill = 30 WHERE id = 'stp'; -- São Tomé and Príncipe
UPDATE teams SET skill = 35 WHERE id = 'bdi'; -- Burundi
UPDATE teams SET skill = 34 WHERE id = 'eth'; -- Ethiopia
UPDATE teams SET skill = 33 WHERE id = 'tan'; -- Tanzania
UPDATE teams SET skill = 32 WHERE id = 'les'; -- Lesotho
UPDATE teams SET skill = 31 WHERE id = 'bot'; -- Botswana
UPDATE teams SET skill = 30 WHERE id = 'swa'; -- Eswatini
UPDATE teams SET skill = 33 WHERE id = 'lby'; -- Libya
UPDATE teams SET skill = 32 WHERE id = 'sud'; -- Sudan
UPDATE teams SET skill = 40 WHERE id = 'yem'; -- Yemen
UPDATE teams SET skill = 39 WHERE id = 'pak'; -- Pakistan
UPDATE teams SET skill = 38 WHERE id = 'sri'; -- Sri Lanka
UPDATE teams SET skill = 37 WHERE id = 'mdv'; -- Maldives
UPDATE teams SET skill = 36 WHERE id = 'bhu'; -- Bhutan
UPDATE teams SET skill = 35 WHERE id = 'cam'; -- Cambodia
UPDATE teams SET skill = 34 WHERE id = 'lao'; -- Laos
UPDATE teams SET skill = 33 WHERE id = 'tls'; -- Timor-Leste
UPDATE teams SET skill = 32 WHERE id = 'bru'; -- Brunei
UPDATE teams SET skill = 40 WHERE id = 'hkg'; -- Hong Kong
UPDATE teams SET skill = 39 WHERE id = 'mac'; -- Macau
UPDATE teams SET skill = 38 WHERE id = 'mon'; -- Mongolia
UPDATE teams SET skill = 37 WHERE id = 'tpe'; -- Chinese Taipei
UPDATE teams SET skill = 36 WHERE id = 'gum'; -- Guam

-- OCEANIA TEAMS (now part of Asia) - Generally weaker due to limited competition
UPDATE teams SET skill = 55 WHERE id = 'nzl'; -- New Zealand (strongest in Oceania, but below Asian top tier)
UPDATE teams SET skill = 42 WHERE id = 'png'; -- Papua New Guinea
UPDATE teams SET skill = 40 WHERE id = 'fij'; -- Fiji
UPDATE teams SET skill = 38 WHERE id = 'ncl'; -- New Caledonia
UPDATE teams SET skill = 37 WHERE id = 'tah'; -- Tahiti
UPDATE teams SET skill = 36 WHERE id = 'slb'; -- Solomon Islands
UPDATE teams SET skill = 35 WHERE id = 'van'; -- Vanuatu
UPDATE teams SET skill = 34 WHERE id = 'cok'; -- Cook Islands
UPDATE teams SET skill = 37 WHERE id = 'sam'; -- Samoa
UPDATE teams SET skill = 33 WHERE id = 'asa'; -- American Samoa
UPDATE teams SET skill = 35 WHERE id = 'ton'; -- Tonga

-- CONCACAF Additional Teams
UPDATE teams SET skill = 36 WHERE id = 'pue'; -- Puerto Rico
UPDATE teams SET skill = 35 WHERE id = 'cuw'; -- Curaçao
UPDATE teams SET skill = 33 WHERE id = 'atg'; -- Antigua and Barbuda
UPDATE teams SET skill = 32 WHERE id = 'skn'; -- Saint Kitts and Nevis
UPDATE teams SET skill = 31 WHERE id = 'lca'; -- Saint Lucia
UPDATE teams SET skill = 30 WHERE id = 'vin'; -- Saint Vincent and the Grenadines
UPDATE teams SET skill = 32 WHERE id = 'grn'; -- Grenada
UPDATE teams SET skill = 30 WHERE id = 'msr'; -- Montserrat
UPDATE teams SET skill = 31 WHERE id = 'dma'; -- Dominica
UPDATE teams SET skill = 33 WHERE id = 'aru'; -- Aruba
UPDATE teams SET skill = 30 WHERE id = 'cay'; -- Cayman Islands
UPDATE teams SET skill = 34 WHERE id = 'bah'; -- Bahamas
UPDATE teams SET skill = 30 WHERE id = 'tca'; -- Turks and Caicos
UPDATE teams SET skill = 30 WHERE id = 'vgb'; -- British Virgin Islands
UPDATE teams SET skill = 30 WHERE id = 'vir'; -- US Virgin Islands
UPDATE teams SET skill = 30 WHERE id = 'aia'; -- Anguilla

-- Final verification query to show distribution
SELECT
  CASE
    WHEN skill >= 90 THEN 'Elite (90-95)'
    WHEN skill >= 85 THEN 'World Class (85-89)'
    WHEN skill >= 75 THEN 'Strong (75-84)'
    WHEN skill >= 65 THEN 'Competitive (65-74)'
    WHEN skill >= 50 THEN 'Mid-Tier (50-64)'
    WHEN skill >= 40 THEN 'Developing (40-49)'
    WHEN skill >= 30 THEN 'Weak (30-39)'
    ELSE 'Unrated'
  END as tier,
  COUNT(*) as team_count,
  MIN(skill) as min_skill,
  MAX(skill) as max_skill,
  ROUND(AVG(skill), 1) as avg_skill
FROM teams
GROUP BY tier
ORDER BY min_skill DESC;

-- Show top 20 teams
SELECT name, region, skill
FROM teams
ORDER BY skill DESC, name ASC
LIMIT 20;
