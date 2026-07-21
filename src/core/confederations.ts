import { nanoid } from 'nanoid';
import { initializeStandings, sortStandings } from './scheduler';
import { WORLD_CUP_FIXTURE_TEMPLATE } from '../constants/fixtureTemplate';
import type { Match, Region, Team, WorldCupGroup, KnockoutMatch } from '../types';

/** Finalistas de una confederación (entran a la Copa Confederaciones). */
export interface ConfederationFinalists {
  region: Region;
  championId: string;
  runnerUpId: string;
}

type PotLetter = 'A' | 'B' | 'C' | 'D';
const POT_LETTERS: PotLetter[] = ['A', 'B', 'C', 'D'];

/**
 * Reparte campeón/subcampeón de cada conf en grupos opuestos, eligiendo la
 * combinación (de 2^4 = 16) que minimiza |skillTotalA − skillTotalB|. Empates
 * de diferencia se resuelven por orden de enumeración (determinista).
 */
function pickBalancedAssignment(
  finalists: ConfederationFinalists[],
  skillOf: (id: string) => number,
): { groupA: string[]; groupB: string[] } {
  let best: { groupA: string[]; groupB: string[]; diff: number } | null = null;

  for (let mask = 0; mask < 1 << finalists.length; mask++) {
    const groupA: string[] = [];
    const groupB: string[] = [];
    finalists.forEach((f, i) => {
      const championToA = (mask & (1 << i)) === 0;
      if (championToA) {
        groupA.push(f.championId);
        groupB.push(f.runnerUpId);
      } else {
        groupA.push(f.runnerUpId);
        groupB.push(f.championId);
      }
    });
    const skillA = groupA.reduce((s, id) => s + skillOf(id), 0);
    const skillB = groupB.reduce((s, id) => s + skillOf(id), 0);
    const diff = Math.abs(skillA - skillB);
    if (!best || diff < best.diff) best = { groupA, groupB, diff };
  }

  return { groupA: best!.groupA, groupB: best!.groupB };
}

/** Partidos de un grupo confed a partir del template FIFA (letras A-D). */
function generateConfedGroupMatches(
  letterAssignments: Record<string, PotLetter>,
): Match[] {
  const letterToTeam = {} as Record<PotLetter, string>;
  for (const [teamId, letter] of Object.entries(letterAssignments)) {
    letterToTeam[letter] = teamId;
  }
  return WORLD_CUP_FIXTURE_TEMPLATE.map((f) => ({
    id: nanoid(),
    homeTeamId: letterToTeam[f.home],
    awayTeamId: letterToTeam[f.away],
    homeScore: null,
    awayScore: null,
    isPlayed: false,
    stage: 'confed-group',
    matchday: f.matchday,
  }));
}

/** Construye un `WorldCupGroup` con letras por skill (más fuerte → 'A'). */
function buildGroup(
  name: string,
  teamIds: string[],
  skillOf: (id: string) => number,
): WorldCupGroup {
  const sorted = [...teamIds].sort((a, b) => skillOf(b) - skillOf(a));
  const letterAssignments: Record<string, PotLetter> = {};
  sorted.forEach((id, i) => {
    letterAssignments[id] = POT_LETTERS[i];
  });
  return {
    id: nanoid(),
    name,
    teamIds: sorted,
    matches: generateConfedGroupMatches(letterAssignments),
    standings: initializeStandings(sorted),
    letterAssignments,
  };
}

/**
 * Sorteo de la Copa Confederaciones: 2 grupos de 4, uno por conf por grupo,
 * balanceados por skill. Requiere exactamente 4 confederaciones finalistas.
 */
export function generateConfederationsGroups(
  finalists: ConfederationFinalists[],
  teams: Team[],
): WorldCupGroup[] {
  if (finalists.length !== 4) {
    throw new Error(
      `generateConfederationsGroups: se esperaban 4 confederaciones, recibió ${finalists.length}`,
    );
  }
  const skillById = new Map(teams.map((t) => [t.id, t.skill]));
  const skillOf = (id: string) => skillById.get(id) ?? 0;

  const { groupA, groupB } = pickBalancedAssignment(finalists, skillOf);

  return [
    buildGroup('Group A', groupA, skillOf),
    buildGroup('Group B', groupB, skillOf),
  ];
}

/** Factory de partido de llave confed (siempre `stage:'confed-knockout'`). */
function newConfedKnockoutMatch(
  homeTeamId: string,
  awayTeamId: string,
  round: KnockoutMatch['round'],
  matchday: number,
  position: number,
): KnockoutMatch {
  return {
    id: nanoid(),
    homeTeamId,
    awayTeamId,
    homeScore: null,
    awayScore: null,
    isPlayed: false,
    stage: 'confed-knockout',
    round,
    matchday,
    position,
  };
}

/**
 * Semifinales: 1ºA-2ºB y 1ºB-2ºA. Requiere 2 grupos con TODOS los partidos
 * jugados (si no, `[]`). Los grupos se ordenan por `name` para que "A"/"B" sean
 * estables sin importar el orden del array.
 */
export function generateConfederationsSemiFinals(
  groups: WorldCupGroup[],
  teams: Team[],
): KnockoutMatch[] {
  if (groups.length !== 2) return [];
  const allPlayed = groups.every((g) => g.matches.every((m) => m.isPlayed));
  if (!allPlayed) return [];

  const [groupA, groupB] = [...groups].sort((a, b) => a.name.localeCompare(b.name));
  const rankedA = sortStandings(groupA.standings, teams, groupA.matches);
  const rankedB = sortStandings(groupB.standings, teams, groupB.matches);

  const a1 = rankedA[0]?.teamId;
  const a2 = rankedA[1]?.teamId;
  const b1 = rankedB[0]?.teamId;
  const b2 = rankedB[1]?.teamId;
  if (!a1 || !a2 || !b1 || !b2) return [];

  return [
    newConfedKnockoutMatch(a1, b2, 'semi', 4, 0),
    newConfedKnockoutMatch(b1, a2, 'semi', 4, 1),
  ];
}

/** Final: ganadores de las 2 semis. `null` si aún no están definidos. */
export function generateConfederationsFinal(
  semiFinals: KnockoutMatch[],
): KnockoutMatch | null {
  const winners = semiFinals
    .filter((m) => m.winnerId)
    .map((m) => m.winnerId!);
  if (winners.length !== 2) return null;
  return newConfedKnockoutMatch(winners[0], winners[1], 'final', 5, 0);
}

/** Tercer puesto: perdedores de las 2 semis. `null` si aún no están definidos. */
export function generateConfederationsThirdPlace(
  semiFinals: KnockoutMatch[],
): KnockoutMatch | null {
  const losers = semiFinals
    .filter((m) => m.loserId)
    .map((m) => m.loserId!);
  if (losers.length !== 2) return null;
  return newConfedKnockoutMatch(losers[0], losers[1], 'third-place', 5, 0);
}
