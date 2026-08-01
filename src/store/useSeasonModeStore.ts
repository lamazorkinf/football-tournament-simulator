import { create } from 'zustand';
import type { GameMode, Match, MatchdayOutcome, SimulatedMatchOutcome, Team } from '../types';
import { updateTeamSkill, getStageImportance } from '../core/engine';
import {
  matchHistoryRow,
  playOneMatch,
  playTieLeg,
  tieLegName,
  type HistoryRow,
} from '../core/matchPipeline';
import { getEngineConfig } from './useConfigStore';
import { recalcLeagueStandings, isLeagueComplete, type LeagueState } from '../core/formats/league';
import {
  advanceBracket,
  findTieByMatchId,
  isBracketComplete,
  isLegPlayable,
  legIndexOf,
  recordBracketMatch,
  type Bracket,
  type TieLegs,
} from '../core/formats/bracket';
import { currentModeJornada } from '../core/formats/modeJornada';
import {
  isGroupStageComplete,
  recordGroupStageMatch,
  type GroupStageState,
} from '../core/formats/groupStage';
import { applyPromotionLadder } from '../core/formats/season';
import type { MatchHistoryStage } from '../core/formats/rounds';
import type {
  GroupsKnockoutState,
  ModeTournament,
  ModeTournamentState,
  LigaTournament,
} from '../core/formats/modeTournament';
import type { Competition, ModeDescriptor } from '../modes/types';
import { competitionForLegacyRow, descriptorForMode } from '../modes/registry';
import {
  createCompetitionState,
  drawKnockoutFromGroups,
  knockoutStageFor,
  type SeasonContext,
} from '../modes/competitionRun';
import { modeTournamentService } from '../services/modeTournamentService';
import { modeSeasonService } from '../services/modeSeasonService';
import { modesService } from '../services/modesService';
import { teamsService } from '../services/teamsService';
import { matchHistoryService } from '../services/matchHistoryService';
import { isSupabaseConfigured } from '../lib/supabase';
import { useTournamentStore } from './useTournamentStore';
import { useModeStore } from './useModeStore';

/**
 * Store de un modo de TEMPORADA: un año, N divisiones y N competiciones.
 *
 * Todo lo que antes era propio de la Liga Villamariense —dos divisiones, dos
 * ligas a ida y vuelta, una copa cruzada, tres ascensos— ahora sale del
 * descriptor del modo (`src/modes/`). El store no sabe cuántas divisiones ni
 * qué competiciones hay: las corre. Sumar un modo de temporada es escribir su
 * `modes.config`, no tocar este archivo.
 *
 * La energía no se modela en estos modos: los partidos se simulan al 100%. El
 * rating de los equipos SÍ evoluciona y persiste año a año.
 */

export type SeasonModeStatus = 'idle' | 'loading' | 'ready' | 'needs-seed' | 'error';

/**
 * La navegación del modo (qué pestañas hay y cuál está activa) NO vive acá:
 * se deriva del descriptor en `modes/nav.ts`, igual para la sidebar, la barra
 * mobile y el menú de pausa. El store sólo guarda cuál pidió el usuario.
 */
interface SeasonModeState {
  modeId: string | null;
  descriptor: ModeDescriptor;
  /** El año que se está mirando. No siempre es el que corre. */
  year: number | null;
  /**
   * El año en curso del modo (`modes.current_year`). Es el único que se puede
   * jugar: mirar una temporada vieja es de sólo lectura, y cerrarla desde ahí
   * mandaría el modo para atrás.
   */
  currentYear: number | null;
  /** Temporadas sembradas, de la más nueva a la más vieja. */
  availableYears: number[];
  /** Composición sembrada del año en curso, por división. */
  divisions: Record<string, string[]>;
  /** Composición del año anterior (los sorteos con `usePreviousYear` la usan). */
  previousDivisions: Record<string, string[]> | null;
  tournaments: ModeTournament[];
  status: SeasonModeStatus;
  busy: boolean;
  /** Sub-vista activa dentro del modo (una competición o una pestaña propia). */
  activeTab: string;

  loadForMode: (mode: GameMode) => Promise<void>;
  /** Mirar otra temporada del mismo modo. */
  selectYear: (year: number) => Promise<void>;
  startSeason: () => Promise<void>;
  /**
   * Juega UN partido, sea de liga, de grupos o de un cuadro (un cruce a ida y
   * vuelta se juega en dos llamadas, una por partido). Devuelve el resultado
   * comprometido para reproducirlo en vivo, o `null` si no se pudo jugar.
   */
  simulateMatch: (
    tournamentId: string,
    matchId: string,
    rng?: () => number,
  ) => Promise<SimulatedMatchOutcome | null>;
  /** Juega una fecha concreta de una liga o de una fase de grupos. */
  simulateMatchday: (
    tournamentId: string,
    matchday: number,
    rng?: () => number,
  ) => Promise<MatchdayOutcome[]>;
  /** Juega la jornada en curso, sea cual sea el formato (ver `currentModeJornada`). */
  simulateJornada: (tournamentId: string, rng?: () => number) => Promise<MatchdayOutcome[]>;
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
  rows: HistoryRow[],
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
    console.error('No se pudieron guardar los partidos del modo de temporada:', error);
  }
}

/** Peso Elo de una etapa, con la configuración vigente. */
function importanceOf(stage: MatchHistoryStage): number {
  return getStageImportance(stage, undefined, getEngineConfig());
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/** Descriptor inerte mientras no hay modo cargado: no corre nada. */
const NO_MODE: ModeDescriptor = {
  divisions: [],
  promotion: null,
  competitions: [],
  theme: 'default',
  extraTabs: [],
  dataTabs: [],
  archiveTabs: [],
  engine: 'season',
};

type SeasonModeData = Omit<
  SeasonModeState,
  | 'loadForMode'
  | 'selectYear'
  | 'startSeason'
  | 'simulateMatch'
  | 'simulateMatchday'
  | 'simulateJornada'
  | 'closeSeason'
  | 'setActiveTab'
  | 'reset'
>;

const EMPTY: SeasonModeData = {
  modeId: null,
  descriptor: NO_MODE,
  year: null,
  currentYear: null,
  availableYears: [],
  divisions: {},
  previousDivisions: null,
  tournaments: [],
  status: 'idle',
  busy: false,
  activeTab: 'season',
};

export const useSeasonModeStore = create<SeasonModeState>((set, get) => ({
  ...EMPTY,

  setActiveTab: (tab) => set({ activeTab: tab }),

  reset: () => set({ ...EMPTY }),

  loadForMode: async (mode: GameMode) => {
    const year = mode.currentYear ?? new Date().getFullYear();
    const descriptor = descriptorForMode(mode);
    // Al entrar (o volver) a un modo se mira siempre el año en curso.
    set({ modeId: mode.id, descriptor, year, currentYear: year, status: 'loading' });
    try {
      const years = await modeSeasonService.listYears(mode.id);
      // El año en curso puede no tener fila todavía (modo recién creado, sin
      // sembrar): igual tiene que estar en la lista, es el que se va a iniciar.
      set({ availableYears: [...new Set([year, ...years])].sort((a, b) => b - a) });
    } catch (error) {
      console.error('No se pudieron listar las temporadas del modo:', error);
      set({ availableYears: [year] });
    }
    await loadSeasonYear(set, mode.id, descriptor, year);
  },

  selectYear: async (year: number) => {
    const { modeId, descriptor, year: current, busy } = get();
    if (!modeId || busy || year === current) return;
    set({ year, status: 'loading' });
    await loadSeasonYear(set, modeId, descriptor, year);
  },

  startSeason: async () => {
    const { modeId, year, currentYear, descriptor, tournaments } = get();
    if (!modeId || year === null || get().busy) return;
    if (year !== currentYear) return; // mirando una temporada vieja: sólo lectura
    if (tournaments.length > 0) return; // ya arrancada
    if (Object.keys(get().divisions).length === 0 && descriptor.divisions.length > 0) return;

    set({ busy: true });
    try {
      const created: ModeTournament[] = [];
      // En orden del descriptor: una competición puede alimentarse de otra, y
      // `runs` va acumulando las ya creadas para que pueda resolverla.
      const ordered = [...descriptor.competitions].sort((a, b) => a.order - b.order);

      for (const competition of ordered) {
        const ctx = seasonContext(get, indexByCompetition(created));
        const state = createCompetitionState(competition, ctx);
        if (!state) continue; // todavía no se puede armar (le faltan participantes)

        const division =
          competition.entrants.from === 'division' ? competition.entrants.division : null;
        const name = `${competition.name} ${year}`;
        const id = isSupabaseConfigured()
          ? await modeTournamentService.create({
              modeId,
              year,
              format: competition.format,
              competitionId: competition.id,
              name,
              division,
              state,
            })
          : `local-${competition.id}`;

        created.push({
          id,
          modeId,
          competitionId: competition.id,
          year,
          name,
          status: 'in-progress',
          division,
          format: competition.format,
          state,
        } as ModeTournament);
      }

      set({ tournaments: created, status: 'ready' });
    } catch (error) {
      console.error('No se pudo iniciar la temporada:', error);
    } finally {
      set({ busy: false });
    }
  },

  simulateMatch: async (tournamentId, matchId, rng) => {
    const tournament = get().tournaments.find((t) => t.id === tournamentId);
    if (!tournament) return null;
    // Un partido de cuadro se juega por su cruce (necesita el global de la ida
    // para saber si va al alargue); el resto, por el fixture.
    const bracket = bracketOf(tournament);
    if (bracket && findTieByMatchId(bracket, matchId)) {
      return simulateBracketLeg(get, set, tournamentId, matchId, rng);
    }
    const outcomes = await simulateMatches(get, set, tournamentId, (m) => m.id === matchId, rng);
    return outcomes[0] ?? null;
  },

  simulateMatchday: async (tournamentId, matchday, rng) =>
    simulateMatches(get, set, tournamentId, (m) => m.matchday === matchday, rng),

  simulateJornada: async (tournamentId, rng) => {
    const tournament = get().tournaments.find((t) => t.id === tournamentId);
    if (!tournament) return [];
    const jornada = currentModeJornada(tournament);
    if (!jornada) return [];

    // Liga y grupos van por fecha; el cuadro, partido a partido (secuencial:
    // cada uno relee el estado, y la ronda puede avanzar en el camino).
    if (jornada.matchday !== undefined) {
      return simulateMatches(get, set, tournamentId, (m) => m.matchday === jornada.matchday, rng);
    }
    const outcomes: MatchdayOutcome[] = [];
    for (const match of jornada.matches) {
      const outcome = await simulateBracketLeg(get, set, tournamentId, match.id, rng);
      if (outcome) outcomes.push(outcome);
    }
    return outcomes;
  },

  closeSeason: async () => {
    const { modeId, year, currentYear, descriptor, tournaments } = get();
    if (!modeId || year === null || get().busy) return;
    // Cerrar desde una temporada vieja mandaría `currentYear` para atrás y
    // reescribiría divisiones ya jugadas. La vista de un año pasado no ofrece
    // el botón, pero el guard va acá: es el store el que no puede permitirlo.
    if (year !== currentYear) return;
    if (!descriptor.promotion || descriptor.divisions.length < 2) return;

    // Una tabla por división, en el orden que declara el descriptor. Requiere
    // que la liga de cada división esté terminada.
    const tables: string[][] = [];
    for (const division of descriptor.divisions) {
      const competition = descriptor.competitions.find(
        (c) =>
          c.format === 'liga' &&
          c.entrants.from === 'division' &&
          c.entrants.division === division,
      );
      const run = competition
        ? tournaments.find(
            (t): t is LigaTournament =>
              t.competitionId === competition.id && t.format === 'liga',
          )
        : undefined;
      if (!run || !isLeagueComplete(run.state)) return;
      tables.push(recalcLeagueStandings(run.state).map((s) => s.teamId));
    }
    if (tables.length !== descriptor.divisions.length) return;

    set({ busy: true });
    try {
      const { divisions: next } = applyPromotionLadder(tables, descriptor.promotion.count);
      const nextYear = year + 1;
      if (isSupabaseConfigured()) {
        for (let i = 0; i < descriptor.divisions.length; i++) {
          await modeSeasonService.saveDivision(modeId, nextYear, descriptor.divisions[i], next[i]);
        }
        await modesService.updateMode(modeId, { currentYear: nextYear });
      }
      // Reflejar el nuevo año en el store de modos y recargar la temporada.
      const modes = useModeStore.getState().modes.map((m) =>
        m.id === modeId ? { ...m, currentYear: nextYear } : m,
      );
      useModeStore.setState({ modes });
      const mode = modes.find((m) => m.id === modeId);
      if (mode) await get().loadForMode(mode);
      else set({ divisions: Object.fromEntries(descriptor.divisions.map((d, i) => [d, next[i]])) });
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

type Get = () => SeasonModeState;
type Set = (partial: Partial<SeasonModeState> | ((s: SeasonModeState) => Partial<SeasonModeState>)) => void;

/**
 * Carga una temporada concreta: su composición de divisiones, la del año
 * anterior (que usan los sorteos con `usePreviousYear`) y sus torneos.
 *
 * Es lo mismo para el año en curso y para uno viejo — la diferencia no está en
 * cómo se lee sino en qué se puede hacer después, y eso lo deciden los guards
 * de `startSeason`/`closeSeason` contra `currentYear`.
 */
async function loadSeasonYear(
  set: Set,
  modeId: string,
  descriptor: ModeDescriptor,
  year: number,
): Promise<void> {
  try {
    const season = await modeSeasonService.getSeason(modeId, year);
    if (!season) {
      // El año existe pero todavía no tiene equipos sembrados en divisiones.
      set({ divisions: {}, previousDivisions: null, tournaments: [], status: 'needs-seed' });
      return;
    }
    const [tournaments, previous] = await Promise.all([
      modeTournamentService.listByMode(modeId, year, (format, division) =>
        competitionForLegacyRow(descriptor, format, division)?.id ?? null,
      ),
      modeSeasonService.getSeason(modeId, year - 1),
    ]);
    set({
      divisions: season.divisions,
      previousDivisions: previous?.divisions ?? null,
      tournaments,
      status: 'ready',
    });
  } catch (error) {
    console.error('Error cargando la temporada:', error);
    set({ status: 'error' });
  }
}

function indexByCompetition(tournaments: ModeTournament[]): Record<string, ModeTournament> {
  return Object.fromEntries(tournaments.map((t) => [t.competitionId, t]));
}

function seasonContext(get: Get, runs: Record<string, ModeTournament>): SeasonContext {
  const { divisions, previousDivisions } = get();
  const teams = useTournamentStore.getState().teams;
  return {
    divisions,
    previousDivisions,
    // Orden de mérito: las siembras por rating esperan mejor → peor.
    allTeamIds: [...teams].sort((a, b) => b.skill - a.skill).map((t) => t.id),
    runs,
    teams,
  };
}

/** La competición del descriptor que corre un torneo. */
function competitionOf(get: Get, tournament: ModeTournament): Competition | undefined {
  return get().descriptor.competitions.find((c) => c.id === tournament.competitionId);
}

function updateTournament(
  set: Set,
  get: Get,
  tournamentId: string,
  state: ModeTournamentState,
  status: 'in-progress' | 'completed',
) {
  set({
    tournaments: get().tournaments.map((t) =>
      t.id === tournamentId ? ({ ...t, state, status } as ModeTournament) : t,
    ),
  });
}

async function saveTournament(
  tournamentId: string,
  state: ModeTournamentState,
  status: 'in-progress' | 'completed',
) {
  if (!isSupabaseConfigured()) return;
  await modeTournamentService
    .saveState(tournamentId, state, status)
    .catch((e) => console.error('No se pudo guardar el torneo:', e));
}

// ---------------------------------------------------------------------------
// Partidos sueltos (liga y fase de grupos)
// ---------------------------------------------------------------------------

/**
 * Simula todos los partidos de un torneo que cumplan `pick`: una fecha entera o
 * un partido. Cubre los dos formatos con fixture numerado —la liga y la fase de
 * grupos— porque el motor es el mismo; lo único que cambia es dónde se cargan
 * los resultados. Los partidos de cuadro van por `simulateBracketLeg`.
 *
 * Devuelve lo que se comprometió, para poder reproducirlo en vivo.
 */
async function simulateMatches(
  get: Get,
  set: Set,
  tournamentId: string,
  pick: (m: Match) => boolean,
  rng?: () => number,
): Promise<MatchdayOutcome[]> {
  const { modeId, year, currentYear } = get();
  if (!modeId || get().busy) return [];
  if (year !== currentYear) return []; // temporada vieja: sólo lectura
  const tournament = get().tournaments.find((t) => t.id === tournamentId);
  if (!tournament || tournament.format === 'eliminacion') return [];
  const competition = competitionOf(get, tournament);
  if (!competition) return [];

  const source: Match[] =
    tournament.format === 'liga'
      ? tournament.state.matches
      : tournament.state.groups.groups.flatMap((g) => g.matches);
  const targets = source.filter((m) => pick(m) && !m.isPlayed);
  if (targets.length === 0) return [];

  set({ busy: true });
  try {
    const teams = useTournamentStore.getState().teams;
    const deltas = new Map<string, number>();
    const historyRows: HistoryRow[] = [];
    const scores = new Map<string, { homeScore: number; awayScore: number }>();
    const outcomes: MatchdayOutcome[] = [];

    for (const m of targets) {
      const home = teamById(m.homeTeamId);
      const away = teamById(m.awayTeamId);
      if (!home || !away) continue;
      const played = playOneMatch(home, away, {
        importance: importanceOf(competition.stage),
        neutral: false, // hay localía: cada equipo juega de local su partido
        rng,
      });
      scores.set(m.id, { homeScore: played.homeScore, awayScore: played.awayScore });
      outcomes.push({
        matchId: m.id,
        homeTeamId: home.id,
        awayTeamId: away.id,
        homeScore: played.homeScore,
        awayScore: played.awayScore,
      });
      deltas.set(home.id, (deltas.get(home.id) ?? 0) + played.homeChange);
      deltas.set(away.id, (deltas.get(away.id) ?? 0) + played.awayChange);
      historyRows.push(
        matchHistoryRow(home, away, played, {
          stage: competition.stage,
          name: tournament.name,
        }),
      );
    }
    if (scores.size === 0) return [];

    let newState: ModeTournamentState;
    let status: 'in-progress' | 'completed';

    if (tournament.format === 'liga') {
      const matches = tournament.state.matches.map((m) => {
        const score = scores.get(m.id);
        return score ? { ...m, ...score, isPlayed: true } : m;
      });
      const league: LeagueState = {
        ...tournament.state,
        matches,
        standings: recalcLeagueStandings({ ...tournament.state, matches }),
      };
      newState = league;
      status = isLeagueComplete(league) ? 'completed' : 'in-progress';
    } else {
      let groups: GroupStageState = tournament.state.groups;
      for (const [matchId, score] of scores) {
        groups = recordGroupStageMatch(groups, matchId, score, teams);
      }
      // Grupos completos ⇒ se sortea el cuadro (si la competición tiene uno).
      const withGroups: GroupsKnockoutState = { ...tournament.state, groups };
      const advanced = drawKnockoutFromGroups(
        competition,
        withGroups,
        seasonContext(get, indexByCompetition(get().tournaments)),
      );
      newState = advanced;
      status = seasonCompetitionDone(competition, advanced) ? 'completed' : 'in-progress';
    }

    const newSkills = applySkillDeltas(deltas);
    await persistMatches(modeId, tournamentId, historyRows, newSkills);

    updateTournament(set, get, tournamentId, newState, status);
    await saveTournament(tournamentId, newState, status);
    return outcomes;
  } finally {
    set({ busy: false });
  }
}

// ---------------------------------------------------------------------------
// Cruces de eliminación
// ---------------------------------------------------------------------------

/** El cuadro de un torneo, sea una eliminación pura o el que sigue a los grupos. */
function bracketOf(tournament: ModeTournament): Bracket | null {
  if (tournament.format === 'eliminacion') return tournament.state;
  if (tournament.format === 'grupos-eliminacion') return tournament.state.bracket;
  return null;
}

function withBracket(tournament: ModeTournament, bracket: Bracket): ModeTournamentState {
  return tournament.format === 'eliminacion' ? bracket : { ...tournament.state, bracket };
}

/** ¿Terminó la competición? Sin cuadro propio alcanza con que cierren los grupos. */
function seasonCompetitionDone(competition: Competition, state: ModeTournamentState): boolean {
  if (competition.format === 'liga') return isLeagueComplete(state as LeagueState);
  if (competition.format === 'eliminacion') return isBracketComplete(state as Bracket);
  const groups = state as GroupsKnockoutState;
  if (!competition.knockout) return isGroupStageComplete(groups.groups);
  return groups.bracket ? isBracketComplete(groups.bracket) : false;
}

/**
 * Juega UN partido de un cuadro y avanza la llave si el cruce quedó definido.
 *
 * Un cruce a ida y vuelta se juega en dos llamadas —son dos jornadas distintas
 * del torneo, como en cualquier copa de verdad—, y la segunda es la que resuelve
 * el empate: prórroga y, si hace falta, penales. La ida no se puede saltear
 * (`isLegPlayable`): sin ella no se sabe cómo llega el global a la vuelta.
 */
async function simulateBracketLeg(
  get: Get,
  set: Set,
  tournamentId: string,
  matchId: string,
  rng?: () => number,
): Promise<MatchdayOutcome | null> {
  const { modeId, year, currentYear } = get();
  if (!modeId || get().busy) return null;
  if (year !== currentYear) return null; // temporada vieja: sólo lectura
  const tournament = get().tournaments.find((t) => t.id === tournamentId);
  if (!tournament) return null;
  const competition = competitionOf(get, tournament);
  const bracket = bracketOf(tournament);
  if (!competition || !bracket) return null;

  const tie = findTieByMatchId(bracket, matchId);
  if (!tie || !tie.homeTeamId || !tie.awayTeamId) return null;
  if (!isLegPlayable(tie, matchId)) return null;
  const home = teamById(tie.homeTeamId);
  const away = teamById(tie.awayTeamId);
  if (!home || !away) return null;

  set({ busy: true });
  try {
    // La etapa del cuadro no es la de los grupos: pesa distinto en el Elo.
    const stage: MatchHistoryStage =
      competition.format === 'grupos-eliminacion'
        ? knockoutStageFor(competition.stage)
        : competition.stage;

    const legIndex = legIndexOf(tie, matchId);
    const legs = tie.matches.length as TieLegs;
    const played = playTieLeg(home, away, {
      legs,
      legIndex,
      // Los partidos ya jugados del cruce: de ahí sale el global.
      previous: tie.matches.slice(0, legIndex).map((m) => ({
        homeScore: m.homeScore ?? 0,
        awayScore: m.awayScore ?? 0,
      })),
      importance: importanceOf(stage),
      neutral: bracket.neutral,
      rng,
    });

    // El local REAL de este partido: la vuelta invierte la localía del cruce.
    const local = legIndex % 2 === 0 ? home : away;
    const visitor = legIndex % 2 === 0 ? away : home;

    let next = recordBracketMatch(bracket, matchId, {
      homeScore: played.homeScore,
      awayScore: played.awayScore,
      ...(played.extraTime ? { extraTime: true } : {}),
      ...(played.penalties ? { penalties: played.penalties } : {}),
    });
    next = advanceBracket(next);

    const newState = withBracket(tournament, next);
    const status = seasonCompetitionDone(competition, newState) ? 'completed' : 'in-progress';

    const newSkills = applySkillDeltas(
      new Map([
        [local.id, played.homeChange],
        [visitor.id, played.awayChange],
      ]),
    );
    await persistMatches(
      modeId,
      tournamentId,
      [
        matchHistoryRow(local, visitor, played, {
          stage,
          name: tieLegName(tournament.name, legs, legIndex),
        }),
      ],
      newSkills,
    );

    updateTournament(set, get, tournamentId, newState, status);
    await saveTournament(tournamentId, newState, status);

    return {
      matchId,
      homeTeamId: local.id,
      awayTeamId: visitor.id,
      homeScore: played.homeScore,
      awayScore: played.awayScore,
      ...(played.penalties ? { penalties: played.penalties } : {}),
      ...(played.extraTime ? { extraTime: played.extraTime } : {}),
    };
  } finally {
    set({ busy: false });
  }
}
