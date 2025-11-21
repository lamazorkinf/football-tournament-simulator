const fs = require('fs');

// Read teams
const teams = require('../src/data/teams.json');

// Update South America and North America teams to America
const updatedTeams = teams.map(team => {
  if (team.region === 'South America' || team.region === 'North America') {
    return {
      ...team,
      region: 'America'
    };
  }
  return team;
});

// Count changes
const southAmericaCount = teams.filter(t => t.region === 'South America').length;
const northAmericaCount = teams.filter(t => t.region === 'North America').length;
const totalAmerica = southAmericaCount + northAmericaCount;

// Write back
fs.writeFileSync(
  './src/data/teams.json',
  JSON.stringify(updatedTeams, null, 2)
);

console.log('✅ Updated regions in teams.json:');
console.log(`  - South America teams: ${southAmericaCount} → America`);
console.log(`  - North America teams: ${northAmericaCount} → America`);
console.log(`  - Total America teams: ${totalAmerica}`);
