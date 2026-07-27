import type { Team, WorldCupGroup } from '../types';
import { nanoid } from 'nanoid';
import { initializeStandings } from './scheduler';
import type { WorldCupFixtureLetter } from '../constants/fixtureTemplate';
import {
  drawPots,
  generateGroupFixturesFromTemplate,
  groupLabel,
} from './formats/groupStage';

/**
 * Sorteo del Mundial: 64 equipos, 16 grupos de 4, un equipo por bombo.
 *
 * Desde la unificación de formatos esto es un ADAPTADOR sobre la primitiva de
 * fase de grupos (core/formats/groupStage.ts). Lo propio del Mundial son sólo
 * tres datos: los 4 bombos por skill, el reparto en serpiente y la diversidad
 * regional — los tres son flags de la primitiva. La plantilla `fifa-4` da los 6
 * partidos por grupo en 3 fechas.
 */

interface Pot {
  teams: Team[];
  tier: string;
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
  const byMerit = [...qualifiedTeams].sort((a, b) => b.skill - a.skill).map((t) => t.id);
  const regionById = new Map(qualifiedTeams.map((team) => [team.id, team.region]));

  const buckets = drawPots(
    byMerit,
    { groupCount: 16, groupSize: 4 },
    {
      kind: 'pots',
      snake: true,
      avoidSameRegion: true,
      regionOf: (id) => regionById.get(id),
    }
  );

  return buckets.map((bucket, i) => {
    const id = nanoid();
    // groupSize 4 ⇒ la primitiva sólo emite letras A-D, que es WorldCupFixtureLetter.
    const letterAssignments = bucket.potLetters as Record<string, WorldCupFixtureLetter>;
    return {
      id,
      name: `Group ${groupLabel(i)}`,
      teamIds: [...bucket.teamIds],
      matches: generateGroupFixturesFromTemplate(
        letterAssignments,
        'fifa-4',
        'world-cup-group',
        id
      ),
      standings: initializeStandings(bucket.teamIds),
      letterAssignments,
    };
  });
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
