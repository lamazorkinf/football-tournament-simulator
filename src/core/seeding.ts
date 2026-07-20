import type { Team, WorldCupGroup } from '../types';
import { nanoid } from 'nanoid';
import { initializeStandings } from './scheduler';
import { WORLD_CUP_FIXTURE_TEMPLATE, type WorldCupFixtureLetter } from '../constants/fixtureTemplate';
import type { Match } from '../types';

interface Pot {
  teams: Team[];
  tier: string;
}

/**
 * Generate World Cup group matches using the standard FIFA fixture template
 * Assigns positions A, B, C, D based on pot (bombo) position
 */
function generateWorldCupGroupMatchesWithTemplate(
  _teamIds: string[],
  letterAssignments: Record<string, WorldCupFixtureLetter>
): Match[] {
  // Invert the mapping: letter -> teamId
  const letterToTeam: Record<WorldCupFixtureLetter, string> = {} as any;
  Object.entries(letterAssignments).forEach(([teamId, letter]) => {
    letterToTeam[letter] = teamId;
  });

  // Generate matches from template
  return WORLD_CUP_FIXTURE_TEMPLATE.map((fixture) => ({
    id: nanoid(),
    homeTeamId: letterToTeam[fixture.home],
    awayTeamId: letterToTeam[fixture.away],
    homeScore: null,
    awayScore: null,
    isPlayed: false,
    stage: 'world-cup-group' as const,
    matchday: fixture.matchday,
  }));
}

/**
 * Smart seeding for World Cup draw
 * - Creates 4 pots based on skill ratings
 * - Ensures regional diversity in groups
 * - Avoids placing teams from same region in same group when possible
 * - Handles 64 teams in 16 groups
 * - Assigns positions A, B, C, D based on pot for fixture generation
 */
export function createSmartWorldCupDraw(qualifiedTeams: Team[]): WorldCupGroup[] {
  // Sort teams by skill rating
  const sortedTeams = [...qualifiedTeams].sort((a, b) => b.skill - a.skill);

  // Divide into 4 pots of 16 teams each (for 64 teams)
  const pot1 = sortedTeams.slice(0, 16); // Top 16 teams
  const pot2 = sortedTeams.slice(16, 32); // Teams 17-32
  const pot3 = sortedTeams.slice(32, 48); // Teams 33-48
  const pot4 = sortedTeams.slice(48, 64); // Teams 49-64

  // Initialize 16 groups (A through P) with letter assignments
  const groups: WorldCupGroup[] = [];
  for (let i = 0; i < 16; i++) {
    groups.push({
      id: nanoid(),
      name: `Group ${String.fromCharCode(65 + i)}`,
      teamIds: [],
      matches: [],
      standings: [],
      letterAssignments: {}, // Will be populated as teams are assigned
    });
  }

  // Índice de equipos por id: necesario para conocer la región de los equipos
  // ya asignados a un grupo (vienen de bombos anteriores).
  const teamsById = new Map(qualifiedTeams.map((team) => [team.id, team]));

  // Assign teams from each pot to groups and track their positions (A, B, C, D)
  // Use snake draft to balance group strength
  assignPotToGroupsWithLetters(groups, pot1, 0, 'A', teamsById); // Pot 1 → Position A
  assignPotToGroupsWithLetters(groups, pot2, 1, 'B', teamsById); // Pot 2 → Position B
  assignPotToGroupsWithLetters(groups, pot3, 2, 'C', teamsById); // Pot 3 → Position C
  assignPotToGroupsWithLetters(groups, pot4, 3, 'D', teamsById); // Pot 4 → Position D

  // Generate matches using template and standings for each group
  groups.forEach((group) => {
    group.matches = generateWorldCupGroupMatchesWithTemplate(group.teamIds, group.letterAssignments || {});
    group.standings = initializeStandings(group.teamIds);
  });

  return groups;
}

/**
 * ¿El grupo ya contiene algún equipo de la misma región?
 */
function hasRegionConflict(
  group: WorldCupGroup,
  team: Team,
  teamsById: Map<string, Team>
): boolean {
  return group.teamIds.some((teamId) => teamsById.get(teamId)?.region === team.region);
}

/**
 * Assign teams from a pot to groups with regional diversity and letter positions.
 *
 * Cada grupo recibe EXACTAMENTE un equipo por bombo: es una invariante dura,
 * porque la plantilla de fixtures mapea una letra (A-D) por equipo y dos equipos
 * con la misma letra harían que uno se quedara sin partidos.
 *
 * Por eso la diversidad regional se resuelve eligiendo, para cada grupo, cuál de
 * los equipos que quedan en el bombo encaja mejor — y no moviendo equipos a
 * grupos vecinos, que rompería esa invariante.
 */
function assignPotToGroupsWithLetters(
  groups: WorldCupGroup[],
  pot: Team[],
  potIndex: number,
  letter: WorldCupFixtureLetter,
  teamsById: Map<string, Team>
): void {
  const shuffledPot = [...pot];

  // Shuffle the pot for randomness (Fisher-Yates)
  for (let i = shuffledPot.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledPot[i], shuffledPot[j]] = [shuffledPot[j], shuffledPot[i]];
  }

  // Snake draft pattern for 16 groups
  const isReverse = potIndex % 2 === 1;
  const groupOrder = isReverse
    ? [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
    : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

  const remaining = [...shuffledPot];

  groupOrder.forEach((groupIndex) => {
    const targetGroup = groups[groupIndex];
    if (remaining.length === 0) return;

    // Preferir un equipo sin conflicto regional; si no hay ninguno (p.ej. todos
    // los que quedan son de la misma confederación), se asigna el primero.
    let pickIndex = remaining.findIndex(
      (candidate) => !hasRegionConflict(targetGroup, candidate, teamsById)
    );
    if (pickIndex === -1) pickIndex = 0;

    const [team] = remaining.splice(pickIndex, 1);

    targetGroup.teamIds.push(team.id);
    if (!targetGroup.letterAssignments) {
      targetGroup.letterAssignments = {};
    }
    targetGroup.letterAssignments[team.id] = letter;
  });

  repairRegionConflicts(groups, letter, teamsById);
}

/**
 * El reparto greedy puede quedarse sin opciones en los últimos grupos, porque
 * los equipos que restan en el bombo ya chocan con todos ellos. Esta pasada
 * corrige esos casos intercambiando equipos del MISMO bombo entre dos grupos:
 * al intercambiar, cada grupo sigue teniendo un equipo por bombo.
 */
function repairRegionConflicts(
  groups: WorldCupGroup[],
  letter: WorldCupFixtureLetter,
  teamsById: Map<string, Team>
): void {
  const teamWithLetter = (group: WorldCupGroup): string | undefined =>
    group.teamIds.find((id) => group.letterAssignments?.[id] === letter);

  const clashes = (group: WorldCupGroup, teamId: string): boolean => {
    const region = teamsById.get(teamId)?.region;
    return group.teamIds.some((id) => id !== teamId && teamsById.get(id)?.region === region);
  };

  const swap = (a: WorldCupGroup, aTeam: string, b: WorldCupGroup, bTeam: string): void => {
    a.teamIds[a.teamIds.indexOf(aTeam)] = bTeam;
    b.teamIds[b.teamIds.indexOf(bTeam)] = aTeam;
    delete a.letterAssignments![aTeam];
    delete b.letterAssignments![bTeam];
    a.letterAssignments![bTeam] = letter;
    b.letterAssignments![aTeam] = letter;
  };

  for (const groupA of groups) {
    const teamA = teamWithLetter(groupA);
    if (!teamA || !clashes(groupA, teamA)) continue;

    for (const groupB of groups) {
      if (groupB === groupA) continue;
      const teamB = teamWithLetter(groupB);
      if (!teamB) continue;

      // El intercambio solo sirve si deja a AMBOS grupos sin conflicto.
      const regionA = teamsById.get(teamA)?.region;
      const regionB = teamsById.get(teamB)?.region;
      const aAccepts = !groupA.teamIds.some(
        (id) => id !== teamA && teamsById.get(id)?.region === regionB
      );
      const bAccepts = !groupB.teamIds.some(
        (id) => id !== teamB && teamsById.get(id)?.region === regionA
      );

      if (aAccepts && bAccepts) {
        swap(groupA, teamA, groupB, teamB);
        break;
      }
    }
  }
}

/**
 * Get seeding pots for display
 */
export function getSeedingPots(qualifiedTeams: Team[]): Pot[] {
  const sortedTeams = [...qualifiedTeams].sort((a, b) => b.skill - a.skill);

  return [
    { tier: 'Pot 1 (Elite)', teams: sortedTeams.slice(0, 16) },
    { tier: 'Pot 2 (Strong)', teams: sortedTeams.slice(16, 32) },
    { tier: 'Pot 3 (Average)', teams: sortedTeams.slice(32, 48) },
    { tier: 'Pot 4 (Emerging)', teams: sortedTeams.slice(48, 64) },
  ];
}

/**
 * Validate group distribution (for testing)
 */
export function validateGroupDistribution(
  groups: WorldCupGroup[],
  _teams: Team[]
): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check each group has exactly 4 teams
  groups.forEach((group) => {
    if (group.teamIds.length !== 4) {
      issues.push(
        `Group ${group.name} has ${group.teamIds.length} teams (expected 4)`
      );
    }
  });

  // Check for duplicate teams
  const allTeamIds = groups.flatMap((g) => g.teamIds);
  const uniqueTeamIds = new Set(allTeamIds);
  if (allTeamIds.length !== uniqueTeamIds.size) {
    issues.push('Duplicate teams found in groups');
  }

  // Check all qualified teams are assigned
  if (allTeamIds.length !== 64) {
    issues.push(`Expected 64 teams, found ${allTeamIds.length}`);
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
