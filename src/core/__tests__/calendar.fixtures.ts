import type {
  Cycle,
  ContinentalBracket,
  ContinentalStage,
  ConfederationsCup,
  KnockoutMatch,
  Match,
  Region,
} from '../../types';

export const REGIONS: Region[] = ['Europe', 'America', 'Africa', 'Asia'];

export function makeMatch(
  id: string,
  matchday: number,
  isPlayed = false,
  stage = 'continental',
): Match {
  return {
    id,
    homeTeamId: `${id}-h`,
    awayTeamId: `${id}-a`,
    homeScore: isPlayed ? 1 : null,
    awayScore: isPlayed ? 0 : null,
    isPlayed,
    stage,
    matchday,
  };
}

export function makeKnockoutMatch(
  id: string,
  round: KnockoutMatch['round'],
  matchday: number,
  isPlayed = false,
  stage = 'continental',
): KnockoutMatch {
  return { ...makeMatch(id, matchday, isPlayed, stage), round };
}

export function makeEmptyBracket(region: Region): ContinentalBracket {
  return {
    region,
    roundOf64: [],
    roundOf32: [],
    roundOf16: [],
    quarterFinals: [],
    semiFinals: [],
    final: null,
    byeTeamIds: [],
  };
}

export function makeContinentalStage(
  overrides: Partial<Record<Region, ContinentalBracket>> = {},
): ContinentalStage {
  const brackets = {} as Record<Region, ContinentalBracket>;
  for (const r of REGIONS) brackets[r] = overrides[r] ?? makeEmptyBracket(r);
  return { brackets, isComplete: false };
}

export function makeConfederationsCup(): ConfederationsCup {
  return {
    groups: [],
    knockout: { semiFinals: [], thirdPlace: null, final: null },
    isComplete: false,
  };
}

export function makeCycle(overrides: Partial<Cycle> = {}): Cycle {
  const base: Cycle = {
    id: 'cycle-1',
    name: 'Ciclo 2026',
    year: 2026,
    qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
    worldCup: null,
    isQualifiersComplete: false,
    hasAnyMatchPlayed: false,
    continental: makeContinentalStage(),
    confederationsCup: makeConfederationsCup(),
    calendar: { phase: 'continental', matchday: 1 },
  };
  return { ...base, ...overrides };
}
