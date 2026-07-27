import { create } from 'zustand';
import type { GameMode, Match, Team } from '../types';
import {
  simulateMatch,
  calculateSkillChanges,
  updateTeamSkill,
  getStageImportance,
  simulateExtraTimeGoals,
  simulatePenalties,
} from '../core/engine';
import { getEngineConfig } from './useConfigStore';
import {
  createLeagueState,
  recalcLeagueStandings,
  isLeagueComplete,
  type LeagueState,
} from '../core/formats/league';
import {
  drawCupFirstRound,
  resolveTie,
  generateNextCupRound,
  isRoundResolved,
  type CupState,
  type TwoLeggedTie,
} from '../core/formats/cup';
import { applyPromotionRelegation } from '../core/formats/season';
import type {
  ModeTournament,
  LeagueTournament,
  CupTournament,
} from '../core/formats/modeTournament';
import { modeTournamentService } from '../services/modeTournamentService';
import { modeSeasonService } from '../services/modeSeasonService';
import { modesService } from '../services/modesService';
import { teamsService } from '../services/teamsService';
import { matchHistoryService } from '../services/matchHistoryService';
import { isSupabaseConfigured } from '../lib/supabase';
import { useTournamentStore } from './useTournamentStore';
import { useModeStore } from './useModeStore';

/**
 * Store de un modo de ligas (league-system). Orquesta una temporada: dos ligas
 * (División A y B) y una copa a doble partido, todo del año en curso. Reutiliza
 * el motor (Elo, prórroga, penales) y persiste skills e historial igual que el
 * modo selecciones; al cerrar la temporada aplica ascensos/descensos.
 *
 * La energía no se modela en estos modos (Etapa 2): los partidos se simulan al
 * 100% de energía. El rating de los equipos SÍ evoluciona y persiste año a año.
 */

const LEAGUE_LEGS = 2 as const; // Villamariense: ida y vuelta.
const PROMOTION_COUNT = 3;

type LeagueModeStatus = 'idle' | 'loading' | 'ready' | 'needs-seed' | 'error';

export interface LeagueTab {
  key: string;
  label: string;
}

/**
 * Pestañas de un modo de ligas según su estado. Fuente única de verdad para la
 * navegación: la usan tanto la sidebar (desktop) como la barra de pestañas del
 * contenido (mobile), así siempre coinciden. La pestaña "Escudos" está siempre
 * disponible (aun sin temporada iniciada); las de la temporada aparecen cuando
 * hay torneos en juego.
 */
export function deriveLeagueTabs(status: LeagueModeStatus, tournaments: ModeTournament[]): LeagueTab[] {
  const ready = status === 'ready' && tournaments.length > 0;
  if (!ready) return [{ key: 'main', label: 'Inicio' }, { key: 'crests', label: 'Escudos' }];

  const leagues = tournaments.filter((t): t is LeagueTournament => t.format === 'league');
  const cup = tournaments.find((t): t is CupTournament => t.format === 'cup') ?? null;
  return [
    ...leagues.map((l) => ({ key: `league-${l.division}`, label: `Liga ${l.division}` })),
    ...(cup ? [{ key: 'cup', label: 'Copa' }] : []),
    { key: 'season', label: 'Temporada' },
    { key: 'crests', label: 'Escudos' },
  ];
}

/** Pestaña efectiva: la pedida si sigue siendo válida, si no la primera. */
export function resolveLeagueTab(tabs: LeagueTab[], requested: string): string {
  return tabs.some((t) => t.key === requested) ? requested : (tabs[0]?.key ?? 'main');
}

interface LeagueModeState {
  modeId: string | null;
  year: number | null;
  divisions: Record<string, string[]>; // composición sembrada del año
  tournaments: ModeTournament[]; // ligas + copa del año
  status: LeagueModeStatus;
  busy: boolean;
  /** Sub-vista activa dentro del modo (Liga A/B, Copa, Temporada, Escudos). */
  activeTab: string;

  loadForMode: (mode: GameMode) => Promise<void>;
  startSeason: () => Promise<void>;
  simulateLeagueMatch: (tournamentId: string, matchId: string, rng?: () => number) => Promise<void>;
  simulateLeagueMatchday: (tournamentId: string, matchday: number, rng?: () => number) => Promise<void>;
  simulateCupTie: (tournamentId: string, tieId: string, rng?: () => number) => Promise<void>;
  closeSeason: () => Promise<void>;
  setActiveTab: (tab: string) => void;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Helpers de equipos (leen/escriben el pool del modo activo en useTournamentStore)
// ---------------------------------------------------------------------------

function teamById(id: string): Team | undefined {
  return useTournamentStore.getState().teams.find((t) => t.id === id);
}

/** Aplica deltas de skill en memoria (useTournamentStore) y devuelve los nuevos valores. */
function applySkillDeltas(deltas: Map<string, number>): Map<string, number> {
  const newSkills = new Map<string, number>();
  const teams = useTournamentStore.getState().teams.map((t) => {
    const delta = deltas.get(t.id);
    if (delta === undefined) return t;
    const skill = updateTeamSkill(t.skill, delta);
    newSkills.set(t.id, skill);
    return { ...t, skill };
  });
  useTournamentStore.setState({ teams });
  return newSkills;
}

/** Persiste skills e historial (best-effort: un fallo de red no pierde el estado en memoria). */
async function persistMatches(
  modeId: string,
  tournamentId: string,
  rows: Array<{
    homeId: string;
    awayId: string;
    homeScore: number;
    awayScore: number;
    stage: 'league' | 'cup';
    homeBefore: number;
    awayBefore: number;
    homeAfter: number;
    awayAfter: number;
    homeChange: number;
    awayChange: number;
    name: string;
    wentToExtraTime?: boolean;
  }>,
  newSkills: Map<string, number>,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    await Promise.all([
      ...rows.map((r) =>
        matchHistoryService.createMatch({
          homeTeamId: r.homeId,
          awayTeamId: r.awayId,
          homeScore: r.homeScore,
          awayScore: r.awayScore,
          stage: r.stage,
          groupName: r.name,
          tournamentId,
          modeId,
          homeSkillBefore: r.homeBefore,
          awaySkillBefore: r.awayBefore,
          homeSkillAfter: r.homeAfter,
          awaySkillAfter: r.awayAfter,
          homeSkillChange: r.homeChange,
          awaySkillChange: r.awayChange,
          wentToExtraTime: r.wentToExtraTime,
        }),
      ),
      teamsService.batchUpdateTeams([...newSkills].map(([id, skill]) => ({ id, skill }))),
    ]);
  } catch (error) {
    console.error('No se pudieron guardar los partidos del modo de ligas:', error);
  }
}

// ---------------------------------------------------------------------------
// Simulación de un partido (liga): devuelve resultado + cambios de Elo
// ---------------------------------------------------------------------------

interface PlayedMatch {
  homeScore: number;
  awayScore: number;
  homeChange: number;
  awayChange: number;
}

function playMatch(home: Team, away: Team, stage: 'league' | 'cup', rng?: () => number): PlayedMatch {
  const config = getEngineConfig();
  const importance = getStageImportance(stage, undefined, config);
  const result = simulateMatch({
    home: { skill: home.skill, energy: 100 },
    away: { skill: away.skill, energy: 100 },
    importance,
    neutral: false, // hay localía: cada equipo juega de local su partido/su leg
    rng,
  });
  return {
    homeScore: result.homeScore,
    awayScore: result.awayScore,
    homeChange: result.homeSkillChange,
    awayChange: result.awaySkillChange,
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useLeagueModeStore = create<LeagueModeState>((set, get) => ({
  modeId: null,
  year: null,
  divisions: {},
  tournaments: [],
  status: 'idle',
  busy: false,
  activeTab: 'season',

  setActiveTab: (tab) => set({ activeTab: tab }),

  reset: () => set({ modeId: null, year: null, divisions: {}, tournaments: [], status: 'idle', busy: false, activeTab: 'season' }),

  loadForMode: async (mode: GameMode) => {
    const year = mode.currentYear ?? new Date().getFullYear();
    set({ modeId: mode.id, year, status: 'loading' });
    try {
      const season = await modeSeasonService.getSeason(mode.id, year);
      if (!season) {
        // El modo existe pero todavía no tiene equipos sembrados en divisiones.
        set({ divisions: {}, tournaments: [], status: 'needs-seed' });
        return;
      }
      const tournaments = await modeTournamentService.listByMode(mode.id, year);
      set({ divisions: season.divisions, tournaments, status: 'ready' });
    } catch (error) {
      console.error('Error cargando el modo de ligas:', error);
      set({ status: 'error' });
    }
  },

  startSeason: async () => {
    const { modeId, year, divisions, tournaments } = get();
    if (!modeId || year === null || get().busy) return;
    if (tournaments.length > 0) return; // ya arrancada
    const divisionNames = Object.keys(divisions).sort();
    if (divisionNames.length === 0) return;

    set({ busy: true });
    try {
      const created: ModeTournament[] = [];

      // Una liga por división (ida y vuelta).
      for (const div of divisionNames) {
        const teamIds = divisions[div];
        const state = createLeagueState(teamIds, LEAGUE_LEGS, `lg-${div}`);
        const name = `Liga ${div} ${year}`;
        const id = isSupabaseConfigured()
          ? await modeTournamentService.create({ modeId, year, format: 'league', name, division: div, state })
          : `local-league-${div}`;
        created.push({ id, modeId, year, name, status: 'in-progress', division: div, format: 'league', state });
      }

      // Copa: cruce A-vs-B usando la composición del año ANTERIOR si existe (así
      // los ascensos/descensos no afectan el sorteo); si no, la del año actual.
      if (divisionNames.length === 2) {
        const [aName, bName] = divisionNames;
        const prev = isSupabaseConfigured()
          ? await modeSeasonService.getSeason(modeId, year - 1)
          : null;
        const source = prev?.divisions[aName] && prev?.divisions[bName] ? prev.divisions : divisions;
        const ties = drawCupFirstRound(source[aName], source[bName]);
        const cupState: CupState = { rounds: [ties] };
        const name = `Copa ${year}`;
        const id = isSupabaseConfigured()
          ? await modeTournamentService.create({ modeId, year, format: 'cup', name, division: null, state: cupState })
          : 'local-cup';
        created.push({ id, modeId, year, name, status: 'in-progress', division: null, format: 'cup', state: cupState });
      }

      set({ tournaments: created, status: 'ready' });
    } catch (error) {
      console.error('No se pudo iniciar la temporada:', error);
    } finally {
      set({ busy: false });
    }
  },

  simulateLeagueMatch: async (tournamentId, matchId, rng) => {
    await simulateLeagueMatches(get, set, tournamentId, (m) => m.id === matchId, rng);
  },

  simulateLeagueMatchday: async (tournamentId, matchday, rng) => {
    await simulateLeagueMatches(get, set, tournamentId, (m) => m.matchday === matchday, rng);
  },

  simulateCupTie: async (tournamentId, tieId, rng) => {
    const { modeId, tournaments } = get();
    if (!modeId || get().busy) return;
    const tournament = tournaments.find((t) => t.id === tournamentId);
    if (!tournament || tournament.format !== 'cup') return;

    set({ busy: true });
    try {
      const cup = tournament as CupTournament;
      const rounds = cup.state.rounds.map((r) => r.map((t) => ({ ...t })));
      const roundIdx = rounds.findIndex((r) => r.some((t) => t.id === tieId));
      if (roundIdx === -1) return;
      const tie = rounds[roundIdx].find((t) => t.id === tieId)!;
      if (tie.winnerId || !tie.homeTeamId || !tie.awayTeamId) return;

      const home = teamById(tie.homeTeamId);
      const away = teamById(tie.awayTeamId);
      if (!home || !away) return;

      const resolved = playTwoLeggedTie(tie, home, away, rng);
      rounds[roundIdx] = rounds[roundIdx].map((t) => (t.id === tieId ? resolved.tie : t));

      // ¿Se completó la ronda? Armar la siguiente (o coronar campeón).
      let championId = cup.state.championId;
      let runnerUpId = cup.state.runnerUpId;
      if (isRoundResolved(rounds[roundIdx])) {
        if (rounds[roundIdx][0].round === 'final') {
          const finalTie = rounds[roundIdx][0];
          championId = finalTie.winnerId;
          runnerUpId = finalTie.loserId;
        } else if (roundIdx === rounds.length - 1) {
          const next = generateNextCupRound(rounds[roundIdx]);
          if (next) rounds.push(next);
        }
      }

      const newState: CupState = { rounds, championId, runnerUpId };
      const status = championId ? 'completed' : 'in-progress';

      // Persistir skills + 2 rows de historial.
      const newSkills = applySkillDeltas(resolved.deltas);
      await persistMatches(modeId, tournamentId, resolved.historyRows(cup.name), newSkills);

      updateTournamentState(set, get, tournamentId, newState, status);
      if (isSupabaseConfigured()) {
        await modeTournamentService.saveState(tournamentId, newState, status).catch((e) =>
          console.error('No se pudo guardar la copa:', e),
        );
      }
    } finally {
      set({ busy: false });
    }
  },

  closeSeason: async () => {
    const { modeId, year, divisions, tournaments } = get();
    if (!modeId || year === null || get().busy) return;

    const leagues = tournaments.filter((t): t is LeagueTournament => t.format === 'league');
    const divisionNames = Object.keys(divisions).sort();
    if (divisionNames.length !== 2) return;
    // Requiere ambas ligas terminadas.
    if (!leagues.every((l) => isLeagueComplete(l.state))) return;

    const [aName, bName] = divisionNames;
    const tableFor = (div: string) => {
      const lg = leagues.find((l) => l.division === div);
      return lg ? recalcLeagueStandings(lg.state).map((s) => s.teamId) : [];
    };

    set({ busy: true });
    try {
      const rollover = applyPromotionRelegation(tableFor(aName), tableFor(bName), PROMOTION_COUNT);
      const nextYear = year + 1;
      if (isSupabaseConfigured()) {
        await modeSeasonService.saveDivision(modeId, nextYear, aName, rollover.A);
        await modeSeasonService.saveDivision(modeId, nextYear, bName, rollover.B);
        await modesService.updateMode(modeId, { currentYear: nextYear });
      }
      // Reflejar el nuevo año en el store de modos y recargar la temporada.
      const modes = useModeStore.getState().modes.map((m) =>
        m.id === modeId ? { ...m, currentYear: nextYear } : m,
      );
      useModeStore.setState({ modes });
      const mode = modes.find((m) => m.id === modeId);
      if (mode) await get().loadForMode(mode);
    } catch (error) {
      console.error('No se pudo cerrar la temporada:', error);
    } finally {
      set({ busy: false });
    }
  },
}));

// ---------------------------------------------------------------------------
// Helpers fuera del create (usan get/set)
// ---------------------------------------------------------------------------

type Get = () => LeagueModeState;
type Set = (partial: Partial<LeagueModeState> | ((s: LeagueModeState) => Partial<LeagueModeState>)) => void;

function updateTournamentState(
  set: Set,
  get: Get,
  tournamentId: string,
  state: LeagueState | CupState,
  status: 'in-progress' | 'completed',
) {
  set({
    tournaments: get().tournaments.map((t) =>
      t.id === tournamentId ? ({ ...t, state, status } as ModeTournament) : t,
    ),
  });
}

/** Simula todos los partidos de una liga que cumplan `pick` (uno o una fecha entera). */
async function simulateLeagueMatches(
  get: Get,
  set: Set,
  tournamentId: string,
  pick: (m: Match) => boolean,
  rng?: () => number,
) {
  const { modeId } = get();
  if (!modeId || get().busy) return;
  const tournament = get().tournaments.find((t) => t.id === tournamentId);
  if (!tournament || tournament.format !== 'league') return;

  set({ busy: true });
  try {
    const league = tournament as LeagueTournament;
    const matches = league.state.matches.map((m) => ({ ...m }));
    const targets = matches.filter((m) => pick(m) && !m.isPlayed);
    if (targets.length === 0) return;

    const deltas = new Map<string, number>();
    const historyRows: Parameters<typeof persistMatches>[2] = [];

    for (const m of targets) {
      const home = teamById(m.homeTeamId);
      const away = teamById(m.awayTeamId);
      if (!home || !away) continue;
      const r = playMatch(home, away, 'league', rng);
      m.homeScore = r.homeScore;
      m.awayScore = r.awayScore;
      m.isPlayed = true;
      deltas.set(home.id, (deltas.get(home.id) ?? 0) + r.homeChange);
      deltas.set(away.id, (deltas.get(away.id) ?? 0) + r.awayChange);
      historyRows.push({
        homeId: home.id,
        awayId: away.id,
        homeScore: r.homeScore,
        awayScore: r.awayScore,
        stage: 'league',
        homeBefore: home.skill,
        awayBefore: away.skill,
        homeAfter: updateTeamSkill(home.skill, r.homeChange),
        awayAfter: updateTeamSkill(away.skill, r.awayChange),
        homeChange: r.homeChange,
        awayChange: r.awayChange,
        name: league.name,
      });
    }

    const newState: LeagueState = {
      ...league.state,
      matches,
      standings: recalcLeagueStandings({ ...league.state, matches }),
    };
    const status = isLeagueComplete(newState) ? 'completed' : 'in-progress';

    const newSkills = applySkillDeltas(deltas);
    await persistMatches(modeId, tournamentId, historyRows, newSkills);

    updateTournamentState(set, get, tournamentId, newState, status);
    if (isSupabaseConfigured()) {
      await modeTournamentService.saveState(tournamentId, newState, status).catch((e) =>
        console.error('No se pudo guardar la liga:', e),
      );
    }
  } finally {
    set({ busy: false });
  }
}

/**
 * Juega los dos partidos de un cruce de copa y lo resuelve (global sin gol de
 * visitante; empate → prórroga en la vuelta y, si sigue, penales). Devuelve el
 * cruce resuelto, los deltas de skill y un builder de filas de historial.
 */
function playTwoLeggedTie(
  tie: TwoLeggedTie,
  home: Team,
  away: Team,
  rng?: () => number,
): {
  tie: TwoLeggedTie;
  deltas: Map<string, number>;
  historyRows: (cupName: string) => Parameters<typeof persistMatches>[2];
} {
  const config = getEngineConfig();
  const importance = getStageImportance('cup', undefined, config);

  // Ida: home de local. Vuelta: away de local.
  const leg1 = simulateMatch({ home: { skill: home.skill, energy: 100 }, away: { skill: away.skill, energy: 100 }, importance, neutral: false, rng });
  const leg2 = simulateMatch({ home: { skill: away.skill, energy: 100 }, away: { skill: home.skill, energy: 100 }, importance, neutral: false, rng });

  let leg2Home = leg2.homeScore; // goles de away (local en la vuelta)
  let leg2Away = leg2.awayScore; // goles de home (visitante en la vuelta)
  let extraTime = false;
  let penalties: { homeScore: number; awayScore: number } | undefined;

  // Global desde la perspectiva de home (local de la ida).
  let aggHome = leg1.homeScore + leg2Away;
  let aggAway = leg1.awayScore + leg2Home;

  if (aggHome === aggAway) {
    extraTime = true;
    // Prórroga en la vuelta: mismo contexto (away de local).
    const et = simulateExtraTimeGoals({ home: { skill: away.skill, energy: 100 }, away: { skill: home.skill, energy: 100 }, importance, neutral: false, rng });
    leg2Home += et.homeGoals;
    leg2Away += et.awayGoals;
    aggHome = leg1.homeScore + leg2Away;
    aggAway = leg1.awayScore + leg2Home;
    if (aggHome === aggAway) {
      // Penales desde la perspectiva de home (tie.homeTeamId).
      penalties = simulatePenalties(home.skill, away.skill, rng);
    }
  }

  // Elo por leg, sobre el marcador final de cada uno (la ida a 90', la vuelta a
  // 90'/120'). Los penales no mueven el Elo (igual que en el motor).
  const leg1Changes = calculateSkillChanges(home.skill, away.skill, leg1.homeScore, leg1.awayScore, importance);
  // En la vuelta el local es `away`: los cambios se calculan con away como "home".
  const leg2Changes = calculateSkillChanges(away.skill, home.skill, leg2Home, leg2Away, importance);

  const deltas = new Map<string, number>();
  deltas.set(home.id, leg1Changes.homeChange + leg2Changes.awayChange);
  deltas.set(away.id, leg1Changes.awayChange + leg2Changes.homeChange);

  const filledLeg1: Match = { ...tie.leg1!, homeScore: leg1.homeScore, awayScore: leg1.awayScore, isPlayed: true };
  const filledLeg2: Match = { ...tie.leg2!, homeScore: leg2Home, awayScore: leg2Away, isPlayed: true };

  const resolvedTie = resolveTie({ ...tie, leg1: filledLeg1, leg2: filledLeg2, extraTime, penalties });

  const homeAfter = updateTeamSkill(home.skill, deltas.get(home.id)!);
  const awayAfter = updateTeamSkill(away.skill, deltas.get(away.id)!);

  return {
    tie: resolvedTie,
    deltas,
    historyRows: (cupName: string) => [
      {
        homeId: home.id, awayId: away.id, homeScore: leg1.homeScore, awayScore: leg1.awayScore,
        stage: 'cup', homeBefore: home.skill, awayBefore: away.skill,
        homeAfter: updateTeamSkill(home.skill, leg1Changes.homeChange), awayAfter: updateTeamSkill(away.skill, leg1Changes.awayChange),
        homeChange: leg1Changes.homeChange, awayChange: leg1Changes.awayChange, name: `${cupName} · Ida`,
      },
      {
        homeId: away.id, awayId: home.id, homeScore: leg2Home, awayScore: leg2Away,
        stage: 'cup', homeBefore: away.skill, awayBefore: home.skill,
        homeAfter: awayAfter, awayAfter: homeAfter,
        homeChange: leg2Changes.homeChange, awayChange: leg2Changes.awayChange, name: `${cupName} · Vuelta`,
        wentToExtraTime: extraTime,
      },
    ],
  };
}
