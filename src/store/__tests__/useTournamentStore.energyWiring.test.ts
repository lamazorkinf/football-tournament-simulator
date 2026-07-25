import { describe, it, expect, vi } from 'vitest';
import type { Cycle, KnockoutMatch, Team } from '../../types';
import { initializeStandings } from '../../utils/drawSystem';
import { toCycle } from '../../core/cycle';

/**
 * Estas pruebas invocan las acciones REALES del store (no mocks de las
 * acciones, como en roundBatch.test.ts) para ejercer el wiring de energía de
 * la Task 5: qué stageKey usa cada sitio y en qué ramas se guarda
 * `energy`/`extraTime`. Los helpers puros (buildEnergyContext/
 * applyEnergyAfterMatch) ya están cubiertos en useTournamentStore.energy.test.ts;
 * acá el objetivo es la integración: que cada acción, corrida de punta a
 * punta, deje el desgaste en `currentTournament.energy.byTeam`.
 *
 * Supabase queda fuera del camino con `isSupabaseConfigured: () => false`
 * (mismo patrón que useTournamentStore.init.test.ts): las cinco acciones ya
 * ramifican sobre ese booleano antes de tocar cualquier servicio, así que no
 * hace falta mockear adaptiveTournamentService/teamsService/etc. por separado.
 */
vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured: () => false,
  supabase: {},
  escapeOrValue: (v: string) => v,
}));

const { useTournamentStore } = await import('../useTournamentStore');
const { baseTournament, makeDrawnContinentalCycle, makeDrawnConfedCycle } = await import(
  '../../test/fixtures/cycle'
);

function seed(cycle: Cycle, teams: Team[]) {
  useTournamentStore.setState({
    teams,
    tournaments: [cycle],
    currentTournamentId: cycle.id,
    currentTournament: cycle,
    isSavingMatch: false,
    isBatchProcessing: false,
    isDrawing: false,
  });
}

/** Cycle mínimo con un grupo del Mundial (1 partido sin jugar, 4 equipos). */
function makeWorldCupGroupCycle(): { cycle: Cycle; teams: Team[] } {
  const teams: Team[] = [
    { id: 'h1', name: 'Home 1', flag: '🏳️', region: 'Europe', skill: 90 },
    { id: 'a1', name: 'Away 1', flag: '🏳️', region: 'America', skill: 85 },
    { id: 'h2', name: 'Home 2', flag: '🏳️', region: 'Africa', skill: 80 },
    { id: 'a2', name: 'Away 2', flag: '🏳️', region: 'Asia', skill: 75 },
  ];
  const teamIds = teams.map((t) => t.id);
  const cycle: Cycle = {
    ...toCycle(baseTournament()),
    id: 'wc-group-cycle',
    worldCup: {
      groups: [
        {
          id: 'g1',
          name: 'Group A',
          teamIds,
          matches: [
            {
              id: 'm1',
              homeTeamId: 'h1',
              awayTeamId: 'a1',
              homeScore: null,
              awayScore: null,
              isPlayed: false,
              stage: 'world-cup-group',
              matchday: 1,
            },
          ],
          standings: initializeStandings(teamIds),
        },
      ],
      knockout: { roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [], thirdPlace: null, final: null },
      qualifiedTeamIds: teamIds,
    },
    calendar: { phase: 'wc-groups', matchday: 1 },
  };
  return { cycle, teams };
}

/** Cycle mínimo con un grupo de clasificatorias (1 partido sin jugar). */
function makeQualifierGroupCycle(): { cycle: Cycle; teams: Team[] } {
  const teams: Team[] = [
    { id: 'h1', name: 'Home 1', flag: '🏳️', region: 'Europe', skill: 88 },
    { id: 'a1', name: 'Away 1', flag: '🏳️', region: 'Europe', skill: 70 },
  ];
  const teamIds = teams.map((t) => t.id);
  const cycle: Cycle = {
    ...toCycle(baseTournament()),
    id: 'qual-cycle',
    qualifiers: {
      Europe: [
        {
          id: 'g1',
          name: 'Group A',
          region: 'Europe',
          teamIds,
          matches: [
            {
              id: 'm1',
              homeTeamId: 'h1',
              awayTeamId: 'a1',
              homeScore: null,
              awayScore: null,
              isPlayed: false,
              stage: 'qualifier',
              matchday: 1,
            },
          ],
          standings: initializeStandings(teamIds),
          isDrawComplete: true,
        },
      ],
      America: [],
      Africa: [],
      Asia: [],
    },
    calendar: { phase: 'wc-qualifiers', matchday: 1 },
  };
  return { cycle, teams };
}

/** Cycle mínimo con el knockout del Mundial: un cruce de R32 sin jugar. */
function makeWorldCupKnockoutCycle(): { cycle: Cycle; teams: Team[] } {
  const teams: Team[] = [
    { id: 'h1', name: 'Home 1', flag: '🏳️', region: 'Europe', skill: 92 },
    { id: 'a1', name: 'Away 1', flag: '🏳️', region: 'America', skill: 78 },
  ];
  const match: KnockoutMatch = {
    id: 'ko1',
    homeTeamId: 'h1',
    awayTeamId: 'a1',
    homeScore: null,
    awayScore: null,
    isPlayed: false,
    round: 'round-of-32',
  };
  const cycle: Cycle = {
    ...toCycle(baseTournament()),
    id: 'wc-ko-cycle',
    worldCup: {
      groups: [],
      qualifiedTeamIds: ['h1', 'a1'],
      knockout: { roundOf32: [match], roundOf16: [], quarterFinals: [], semiFinals: [], thirdPlace: null, final: null },
    },
    calendar: { phase: 'wc-knockout', matchday: 1 },
  };
  return { cycle, teams };
}

/** Todos los partidos (cualquier ronda) de los 4 brackets continentales. */
function allContinentalMatches(cycle: Cycle): KnockoutMatch[] {
  return Object.values(cycle.continental.brackets).flatMap((b): KnockoutMatch[] => [
    ...b.roundOf64,
    ...b.roundOf32,
    ...b.roundOf16,
    ...b.quarterFinals,
    ...b.semiFinals,
    ...(b.final ? [b.final] : []),
    ...(b.thirdPlace ? [b.thirdPlace] : []),
  ]);
}

describe('wiring de energía en las acciones simulate* del store', () => {
  it('simulateMatch (fase de grupos del Mundial) puebla currentTournament.energy con los dos equipos', async () => {
    const { cycle, teams } = makeWorldCupGroupCycle();
    seed(cycle, teams);

    const outcome = await useTournamentStore.getState().simulateMatch('m1', 'g1', 'world-cup');
    expect(outcome).not.toBeNull();

    const after = useTournamentStore.getState().currentTournament!;
    expect(after.energy?.scope).toBe('world-cup');
    expect(after.energy?.byTeam.h1?.value).toBeLessThan(100);
    expect(after.energy?.byTeam.a1?.value).toBeLessThan(100);
  });

  it('simulateMatchdayBatch (clasificatorias) puebla currentTournament.energy con los dos equipos', async () => {
    const { cycle, teams } = makeQualifierGroupCycle();
    seed(cycle, teams);

    const outcomes = await useTournamentStore.getState().simulateMatchdayBatch([
      { matchId: 'm1', groupId: 'g1', stage: 'qualifier', groupName: 'Group A', region: 'Europe' },
    ]);
    expect(outcomes).toHaveLength(1);

    const after = useTournamentStore.getState().currentTournament!;
    expect(after.energy?.scope).toBe('wc-qualifiers');
    expect(after.energy?.byTeam.h1?.value).toBeLessThan(100);
    expect(after.energy?.byTeam.a1?.value).toBeLessThan(100);
  });

  it('simulateKnockoutMatch (Mundial) puebla la energía y guarda extraTime en el KnockoutMatch', async () => {
    const { cycle, teams } = makeWorldCupKnockoutCycle();
    seed(cycle, teams);

    const outcome = await useTournamentStore.getState().simulateKnockoutMatch('ko1');
    expect(outcome).not.toBeNull();

    const after = useTournamentStore.getState().currentTournament!;
    expect(after.energy?.scope).toBe('world-cup');
    expect(after.energy?.byTeam.h1?.value).toBeLessThan(100);
    expect(after.energy?.byTeam.a1?.value).toBeLessThan(100);

    const updated = after.worldCup!.knockout.roundOf32.find((m) => m.id === 'ko1')!;
    expect(updated.isPlayed).toBe(true);
    expect(typeof updated.extraTime).toBe('boolean');
  });

  it('simulateContinentalMatch puebla la energía y guarda extraTime en el KnockoutMatch', async () => {
    const { cycle, teams } = makeDrawnContinentalCycle();
    const match = allContinentalMatches(cycle).find((m) => !m.isPlayed);
    expect(match).toBeDefined();
    seed(cycle, teams);

    const outcome = await useTournamentStore.getState().simulateContinentalMatch(match!.id);
    expect(outcome).not.toBeNull();

    const after = useTournamentStore.getState().currentTournament!;
    expect(after.energy?.scope).toBe('continental');
    expect(after.energy?.byTeam[match!.homeTeamId]?.value).toBeLessThan(100);
    expect(after.energy?.byTeam[match!.awayTeamId]?.value).toBeLessThan(100);

    const updated = allContinentalMatches(after).find((m) => m.id === match!.id)!;
    expect(updated.isPlayed).toBe(true);
    expect(typeof updated.extraTime).toBe('boolean');
  });

  it('simulateConfederationsMatch (fase de grupos) puebla currentTournament.energy con los dos equipos', async () => {
    const { cycle, teams } = makeDrawnConfedCycle();
    const match = cycle.confederationsCup.groups.flatMap((g) => g.matches).find((m) => !m.isPlayed);
    expect(match).toBeDefined();
    seed(cycle, teams);

    const outcome = await useTournamentStore.getState().simulateConfederationsMatch(match!.id);
    expect(outcome).not.toBeNull();

    const after = useTournamentStore.getState().currentTournament!;
    expect(after.energy?.scope).toBe('confed');
    expect(after.energy?.byTeam[match!.homeTeamId]?.value).toBeLessThan(100);
    expect(after.energy?.byTeam[match!.awayTeamId]?.value).toBeLessThan(100);
  });
});
