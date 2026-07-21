import type { Match, Group, Region, Team, TeamStanding } from '../types';
import { nanoid } from 'nanoid';

/**
 * Etiqueta de grupo: A-Z y luego AA, AB, ... String.fromCharCode(65 + i) solo
 * daba letras válidas hasta 26 grupos; a partir de ahí producía '[', '\', ']'.
 */
function groupLabel(index: number): string {
  let label = '';
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/**
 * Creates empty group structures for regional qualifiers
 * Teams and matches will be assigned later via the draw system
 */
export function createQualifierGroups(teams: Team[], region: Region): Group[] {
  const regionalTeams = teams.filter(t => t.region === region);
  const groupSize = 5;
  const numGroups = Math.ceil(regionalTeams.length / groupSize);

  const groups: Group[] = [];

  for (let i = 0; i < numGroups; i++) {
    const groupId = nanoid();

    groups.push({
      id: groupId,
      name: `Group ${groupLabel(i)}`, // A, B, ... Z, AA, AB, ...
      region,
      teamIds: [], // Empty - will be filled by draw system
      matches: [], // Empty - will be generated after draw
      standings: [], // Empty - will be initialized after draw
      isDrawComplete: false,
    });
  }

  return groups;
}

/**
 * Initializes empty standings for teams
 */
export function initializeStandings(teamIds: string[]): TeamStanding[] {
  return teamIds.map(teamId => ({
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  }));
}

/**
 * Updates standings after a match
 */
export function updateStandings(
  standings: TeamStanding[],
  match: Match
): TeamStanding[] {
  if (!match.isPlayed || match.homeScore === null || match.awayScore === null) {
    return standings;
  }

  const existingHome = standings.find(s => s.teamId === match.homeTeamId);
  const existingAway = standings.find(s => s.teamId === match.awayTeamId);

  if (!existingHome || !existingAway) return standings;

  // Copias: mutar los objetos originales corrompería los snapshots previos que
  // viven en el estado de Zustand y rompería las comparaciones por referencia.
  const homeStanding: TeamStanding = { ...existingHome };
  const awayStanding: TeamStanding = { ...existingAway };

  // Update home team
  homeStanding.played++;
  homeStanding.goalsFor += match.homeScore;
  homeStanding.goalsAgainst += match.awayScore;

  // Update away team
  awayStanding.played++;
  awayStanding.goalsFor += match.awayScore;
  awayStanding.goalsAgainst += match.homeScore;

  // Determine result
  if (match.homeScore > match.awayScore) {
    homeStanding.won++;
    homeStanding.points += 3;
    awayStanding.lost++;
  } else if (match.homeScore < match.awayScore) {
    awayStanding.won++;
    awayStanding.points += 3;
    homeStanding.lost++;
  } else {
    homeStanding.drawn++;
    awayStanding.drawn++;
    homeStanding.points++;
    awayStanding.points++;
  }

  // Update goal difference
  homeStanding.goalDifference = homeStanding.goalsFor - homeStanding.goalsAgainst;
  awayStanding.goalDifference = awayStanding.goalsFor - awayStanding.goalsAgainst;

  return standings.map(standing => {
    if (standing.teamId === homeStanding.teamId) return homeStanding;
    if (standing.teamId === awayStanding.teamId) return awayStanding;
    return standing;
  });
}

/**
 * Compara por los criterios generales: puntos, diferencia de gol y goles a favor.
 * Devuelve 0 si están empatados en los tres.
 */
function compareOverall(a: TeamStanding, b: TeamStanding): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  return 0;
}

/** Último recurso determinista: orden alfabético. */
function compareByName(a: TeamStanding, b: TeamStanding, teams?: Team[]): number {
  if (!teams) return 0;
  const teamA = teams.find(t => t.id === a.teamId);
  const teamB = teams.find(t => t.id === b.teamId);
  return teamA && teamB ? teamA.name.localeCompare(teamB.name) : 0;
}

/**
 * Mini-tabla con los partidos jugados EXCLUSIVAMENTE entre los equipos indicados.
 * Es la forma correcta de resolver empates de 3 o más equipos: un comparador
 * puramente por pares daría resultados incoherentes.
 */
function buildHeadToHeadTable(
  teamIds: string[],
  matches: Match[]
): Map<string, { points: number; goalDifference: number; goalsFor: number }> {
  const involved = new Set(teamIds);
  const table = new Map(
    teamIds.map(id => [id, { points: 0, goalDifference: 0, goalsFor: 0 }])
  );

  for (const match of matches) {
    if (!match.isPlayed || match.homeScore === null || match.awayScore === null) continue;
    if (!involved.has(match.homeTeamId) || !involved.has(match.awayTeamId)) continue;

    const home = table.get(match.homeTeamId)!;
    const away = table.get(match.awayTeamId)!;

    home.goalsFor += match.homeScore;
    away.goalsFor += match.awayScore;
    home.goalDifference += match.homeScore - match.awayScore;
    away.goalDifference += match.awayScore - match.homeScore;

    if (match.homeScore > match.awayScore) home.points += 3;
    else if (match.homeScore < match.awayScore) away.points += 3;
    else {
      home.points += 1;
      away.points += 1;
    }
  }

  return table;
}

/**
 * Ordena la tabla de posiciones siguiendo el reglamento FIFA de fase de grupos:
 * puntos → diferencia de gol → goles a favor → enfrentamiento directo entre los
 * equipos empatados (puntos, diferencia de gol, goles) → orden alfabético.
 *
 * Sin `matches` no se puede calcular el enfrentamiento directo y se cae
 * directamente al alfabético.
 */
export function sortStandings(
  standings: TeamStanding[],
  teams?: Team[],
  matches?: Match[]
): TeamStanding[] {
  const sorted = [...standings].sort(
    (a, b) => compareOverall(a, b) || compareByName(a, b, teams)
  );

  if (!matches || matches.length === 0) return sorted;

  // Resolver cada bloque de equipos empatados con su mini-tabla particular.
  const result: TeamStanding[] = [];
  let start = 0;

  while (start < sorted.length) {
    let end = start + 1;
    while (end < sorted.length && compareOverall(sorted[start], sorted[end]) === 0) end++;

    const block = sorted.slice(start, end);

    if (block.length > 1) {
      const h2h = buildHeadToHeadTable(block.map(s => s.teamId), matches);
      block.sort((a, b) => {
        const statsA = h2h.get(a.teamId)!;
        const statsB = h2h.get(b.teamId)!;
        if (statsB.points !== statsA.points) return statsB.points - statsA.points;
        if (statsB.goalDifference !== statsA.goalDifference) {
          return statsB.goalDifference - statsA.goalDifference;
        }
        if (statsB.goalsFor !== statsA.goalsFor) return statsB.goalsFor - statsA.goalsFor;
        return compareByName(a, b, teams);
      });
    }

    result.push(...block);
    start = end;
  }

  return result;
}

/**
 * Gets top N teams from each group
 */
export function getQualifiedTeams(groups: Group[], numQualifiers: number, teams?: Team[]): string[] {
  const qualified: string[] = [];

  groups.forEach(group => {
    const sorted = sortStandings(group.standings, teams, group.matches);
    const topTeams = sorted.slice(0, numQualifiers);
    qualified.push(...topTeams.map(s => s.teamId));
  });

  return qualified;
}

/**
 * Gets the best N second-place teams across all groups
 * Used for World Cup qualification (22 best runners-up)
 */
export function getBestRunnersUp(groups: Group[], numBestRunnersUp: number, teams?: Team[]): string[] {
  // Get all second-place teams with their stats
  const runnersUp = groups.map(group => {
    const sorted = sortStandings(group.standings, teams, group.matches);
    return sorted[1]; // Second place team
  }).filter(standing => standing !== undefined);

  // Los segundos vienen de grupos distintos, así que no existe enfrentamiento
  // directo entre ellos: solo criterios generales y, como último recurso,
  // el orden alfabético.
  const sortedRunnersUp = runnersUp.sort(
    (a, b) => compareOverall(a, b) || compareByName(a, b, teams)
  );

  // Return top N runners-up
  return sortedRunnersUp.slice(0, numBestRunnersUp).map(s => s.teamId);
}
