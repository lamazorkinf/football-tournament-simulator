import {
  toCycle,
  drawContinentalStage,
  recordContinentalMatch,
  drawConfederationsStage,
  type KnockoutResult,
} from '../../core/cycle';
import type { Cycle, KnockoutMatch, Region, Team, Tournament } from '../../types';

const REGIONS: Region[] = ['Europe', 'America', 'Africa', 'Asia'];

export function baseTournament(): Tournament {
  return {
    id: 't1',
    name: 'World Cup 2026',
    year: 2026,
    qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
    worldCup: null,
    isQualifiersComplete: false,
    hasAnyMatchPlayed: false,
  };
}

function makeRegionTeams(region: Region, count: number): Team[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${region}-${i}`,
    name: `${region} ${i}`,
    flag: '🏳️',
    region,
    skill: 100 - i,
  }));
}

export function teamsByRegion(): Record<Region, Team[]> {
  return {
    Europe: makeRegionTeams('Europe', 55),
    Asia: makeRegionTeams('Asia', 55),
    Africa: makeRegionTeams('Africa', 55),
    America: makeRegionTeams('America', 45),
  };
}

/** Ciclo con continental sorteado (calendario en continental md1, R64 poblada). */
export function makeDrawnContinentalCycle(): { cycle: Cycle; teams: Team[] } {
  const byRegion = teamsByRegion();
  const teams = REGIONS.flatMap((r) => byRegion[r]);
  const cycle = drawContinentalStage(toCycle(baseTournament()), byRegion);
  return { cycle, teams };
}

/** Juega toda la jornada continental actual (gana el local) y devuelve el ciclo avanzado. */
export function playContinentalMatchday(cycle: Cycle): Cycle {
  const md = cycle.calendar.matchday;
  const matches = Object.values(cycle.continental.brackets)
    .flatMap((b): KnockoutMatch[] => [
      ...b.roundOf64, ...b.roundOf32, ...b.roundOf16,
      ...b.quarterFinals, ...b.semiFinals, ...(b.final ? [b.final] : []),
    ])
    .filter((m) => (m.matchday ?? 0) === md && !m.isPlayed);
  let next = cycle;
  for (const m of matches) {
    const result: KnockoutResult = {
      homeScore: 1, awayScore: 0, winnerId: m.homeTeamId, loserId: m.awayTeamId,
    };
    next = recordContinentalMatch(next, m.id, result);
  }
  return next;
}

/** Ciclo con continental COMPLETO (6 jornadas jugadas). */
export function makeContinentalDoneCycle(): { cycle: Cycle; teams: Team[] } {
  const { teams } = makeDrawnContinentalCycle();
  let cycle = makeDrawnContinentalCycle().cycle;
  for (let i = 0; i < 6; i++) cycle = playContinentalMatchday(cycle);
  return { cycle, teams };
}

/** Continental completo con finalistas sintéticos (rápido; sin correr 6 jornadas). */
export function cycleWithContinentalDone(): { cycle: Cycle; teams: Team[] } {
  const teams: Team[] = [];
  const base = toCycle(baseTournament());
  const brackets = { ...base.continental.brackets };
  REGIONS.forEach((r, ri) => {
    const champ: Team = { id: `${r}-champ`, name: `${r} C`, flag: '🏳️', region: r, skill: 90 - ri };
    const runner: Team = { id: `${r}-runner`, name: `${r} R`, flag: '🏳️', region: r, skill: 80 - ri };
    teams.push(champ, runner);
    brackets[r] = { ...brackets[r], championId: champ.id, runnerUpId: runner.id };
  });
  const cycle: Cycle = {
    ...base,
    continental: { brackets, isComplete: true },
    calendar: { phase: 'continental', matchday: 6 },
  };
  return { cycle, teams };
}

/** Ciclo con Copa Confederaciones sorteada (calendario en confed md1, 2 grupos). */
export function makeDrawnConfedCycle(): { cycle: Cycle; teams: Team[] } {
  const { cycle, teams } = cycleWithContinentalDone();
  return { cycle: drawConfederationsStage(cycle, teams), teams };
}
