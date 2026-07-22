import type { Cycle, Team, Region } from '../types';
import type { CreateMatchHistoryParams } from './matchHistoryService';
import { isSupabaseConfigured } from '../lib/supabase';
import { matchHistoryService } from './matchHistoryService';

export interface CycleMatchInput {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  stage: 'continental' | 'confed-group' | 'confed-knockout';
  region?: Region;
  groupName?: string;
  cycleMatchId: string;
  tournamentId: string;
  homeSkillBefore: number;
  awaySkillBefore: number;
  homeSkillAfter: number;
  awaySkillAfter: number;
}

/** Construye los params normalizados de match_history para un partido del ciclo. */
export function buildMatchParams(input: CycleMatchInput): CreateMatchHistoryParams {
  return {
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    homeScore: input.homeScore,
    awayScore: input.awayScore,
    stage: input.stage,
    region: input.region,
    groupName: input.groupName,
    tournamentId: input.tournamentId,
    homeSkillBefore: input.homeSkillBefore,
    awaySkillBefore: input.awaySkillBefore,
    homeSkillAfter: input.homeSkillAfter,
    awaySkillAfter: input.awaySkillAfter,
    homeSkillChange: input.homeSkillAfter - input.homeSkillBefore,
    awaySkillChange: input.awaySkillAfter - input.awaySkillBefore,
    metadata: { cycleMatchId: input.cycleMatchId },
  };
}

/**
 * Reúne todos los partidos continental/confed JUGADOS del ciclo como params.
 * Uso: backfill de lo ya jugado. Los skills before/after no se guardaron
 * históricamente, así que se rellenan con el skill actual del equipo (change 0);
 * el H2H usa solo el resultado (goles/stage), no estos campos.
 */
export function collectPlayedCycleMatches(cycle: Cycle, teams: Team[]): CreateMatchHistoryParams[] {
  const skillOf = (id: string) => teams.find((t) => t.id === id)?.skill ?? 0;
  const params: CreateMatchHistoryParams[] = [];

  const pushPlayed = (
    m: { id: string; homeTeamId: string; awayTeamId: string; homeScore: number | null; awayScore: number | null; isPlayed: boolean },
    stage: CycleMatchInput['stage'],
    groupName: string | undefined,
    region?: Region,
  ) => {
    if (!m.isPlayed || m.homeScore == null || m.awayScore == null) return;
    params.push(buildMatchParams({
      homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
      homeScore: m.homeScore, awayScore: m.awayScore,
      stage, region, groupName, cycleMatchId: m.id, tournamentId: cycle.id,
      homeSkillBefore: skillOf(m.homeTeamId), awaySkillBefore: skillOf(m.awayTeamId),
      homeSkillAfter: skillOf(m.homeTeamId), awaySkillAfter: skillOf(m.awayTeamId),
    }));
  };

  // Continental
  if (cycle.continental?.brackets) {
    (Object.keys(cycle.continental.brackets) as Region[]).forEach((region) => {
      const b = cycle.continental.brackets[region];
      [
        ...b.roundOf64, ...b.roundOf32, ...b.roundOf16,
        ...b.quarterFinals, ...b.semiFinals,
        ...(b.final ? [b.final] : []),
        ...(b.thirdPlace ? [b.thirdPlace] : []),
      ].forEach((m) => pushPlayed(m, 'continental', m.round, region));
    });
  }

  // Confederaciones — grupos
  cycle.confederationsCup?.groups.forEach((g) => {
    g.matches.forEach((m) => pushPlayed(m, 'confed-group', g.name));
  });

  // Confederaciones — knockout
  const ko = cycle.confederationsCup?.knockout;
  if (ko) {
    [
      ...ko.semiFinals,
      ...(ko.final ? [ko.final] : []),
      ...(ko.thirdPlace ? [ko.thirdPlace] : []),
    ].forEach((m) => pushPlayed(m, 'confed-knockout', m.round));
  }

  return params;
}

/**
 * Persiste en match_history los partidos continental/confed JUGADOS del ciclo
 * que todavía no estén (idempotente por metadata.cycleMatchId). No-op sin
 * Supabase. Devuelve cuántas filas insertó.
 */
export async function backfillCycleMatchHistory(cycle: Cycle, teams: Team[]): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const all = collectPlayedCycleMatches(cycle, teams);
  if (all.length === 0) return 0;
  const existing = await matchHistoryService.getExistingCycleMatchIds(cycle.id);
  const missing = all.filter((p) => {
    const cid = (p.metadata as { cycleMatchId?: string }).cycleMatchId;
    return cid != null && !existing.has(cid);
  });
  if (missing.length === 0) return 0;
  await matchHistoryService.createMatchesBatch(missing);
  return missing.length;
}
