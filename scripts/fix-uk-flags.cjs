const fs = require('fs');

// Read teams
const teams = require('../src/data/teams.json');

// UK teams with working flag URLs (using Flagpedia which supports subdivisions)
const ukFlagUpdates = {
  'eng': 'https://flagpedia.net/data/flags/w580/gb-eng.webp',
  'sco': 'https://flagpedia.net/data/flags/w580/gb-sct.webp',
  'wal': 'https://flagpedia.net/data/flags/w580/gb-wls.webp',
  'nir': 'https://flagpedia.net/data/flags/w580/gb-nir.webp'
};

// Update UK teams
const updatedTeams = teams.map(team => {
  if (ukFlagUpdates[team.id]) {
    return {
      ...team,
      flag: ukFlagUpdates[team.id]
    };
  }
  return team;
});

// Write back
fs.writeFileSync(
  './src/data/teams.json',
  JSON.stringify(updatedTeams, null, 2)
);

console.log('✅ Updated UK flags in teams.json:');
Object.entries(ukFlagUpdates).forEach(([id, url]) => {
  const team = teams.find(t => t.id === id);
  console.log(`  - ${team?.name}: ${url}`);
});
