import { COUNTRY_CODES, getFlagUrl } from '../src/data/country-codes';
import teamsData from '../src/data/teams.json';

// Generate teams with flag URLs
const teamsWithFlags = teamsData.map(team => ({
  ...team,
  flag: getFlagUrl(team.id, 64, 'flat')
}));

console.log(JSON.stringify(teamsWithFlags, null, 2));
