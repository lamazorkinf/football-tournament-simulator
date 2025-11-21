const fs = require('fs');

// Read teams
const teams = require('../src/data/teams.json');

// UK teams with Wikipedia Commons URLs (100% reliable)
const ukFlagUpdates = {
  'eng': 'https://upload.wikimedia.org/wikipedia/en/thumb/b/be/Flag_of_England.svg/320px-Flag_of_England.svg.png',
  'sco': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Flag_of_Scotland.svg/320px-Flag_of_Scotland.svg.png',
  'wal': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dc/Flag_of_Wales.svg/320px-Flag_of_Wales.svg.png',
  'nir': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Flag_of_Northern_Ireland_%281953%E2%80%931972%29.svg/320px-Flag_of_Northern_Ireland_%281953%E2%80%931972%29.svg.png'
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

console.log('✅ Updated UK flags with Wikipedia Commons URLs:');
Object.entries(ukFlagUpdates).forEach(([id, url]) => {
  const team = teams.find(t => t.id === id);
  console.log(`  - ${team?.name}`);
});
