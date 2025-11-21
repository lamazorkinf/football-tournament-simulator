const fs = require('fs');

const COUNTRY_CODES = {
  'cuw': 'CW', 'atg': 'AG', 'skn': 'KN', 'lca': 'LC', 'vin': 'VC',
  'grn': 'GD', 'msr': 'MS', 'dma': 'DM', 'aru': 'AW', 'cay': 'KY',
  'bah': 'BS', 'tca': 'TC', 'vgb': 'VG', 'vir': 'VI', 'aia': 'AI'
};

// New CONCACAF teams to add with skill ratings
const newTeams = [
  { id: 'cuw', name: 'Curaçao', skill: 48 },
  { id: 'atg', name: 'Antigua and Barbuda', skill: 42 },
  { id: 'skn', name: 'Saint Kitts and Nevis', skill: 41 },
  { id: 'lca', name: 'Saint Lucia', skill: 40 },
  { id: 'vin', name: 'Saint Vincent and the Grenadines', skill: 39 },
  { id: 'grn', name: 'Grenada', skill: 39 },
  { id: 'msr', name: 'Montserrat', skill: 35 },
  { id: 'dma', name: 'Dominica', skill: 37 },
  { id: 'aru', name: 'Aruba', skill: 36 },
  { id: 'cay', name: 'Cayman Islands', skill: 35 },
  { id: 'bah', name: 'Bahamas', skill: 34 },
  { id: 'tca', name: 'Turks and Caicos Islands', skill: 32 },
  { id: 'vgb', name: 'British Virgin Islands', skill: 31 },
  { id: 'vir', name: 'US Virgin Islands', skill: 31 },
  { id: 'aia', name: 'Anguilla', skill: 30 }
];

// Read current teams
const teams = require('../src/data/teams.json');

// Add new teams with flags
const teamsToAdd = newTeams.map(team => ({
  id: team.id,
  name: team.name,
  flag: `https://flagsapi.com/${COUNTRY_CODES[team.id]}/flat/64.png`,
  region: 'North America',
  skill: team.skill
}));

// Find the last North America team index
let insertIndex = teams.length;
for (let i = teams.length - 1; i >= 0; i--) {
  if (teams[i].region === 'North America') {
    insertIndex = i + 1;
    break;
  }
}

// Insert new teams after the last North America team
teams.splice(insertIndex, 0, ...teamsToAdd);

// Write back to file
fs.writeFileSync(
  './src/data/teams.json',
  JSON.stringify(teams, null, 2)
);

console.log(`✅ Added ${teamsToAdd.length} CONCACAF teams to teams.json`);
console.log('New teams:');
teamsToAdd.forEach(t => console.log(`  - ${t.name} (${t.id}): skill ${t.skill}`));
console.log(`\nTotal teams now: ${teams.length}`);
