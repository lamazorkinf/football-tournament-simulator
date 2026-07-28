import type { MatchHistoryStage } from './formats/rounds';
import {
  calculateSkillChanges,
  simulateExtraTimeGoals,
  simulateMatch,
  simulateMatchWithPenalties,
  simulatePenalties,
  updateTeamSkill,
  type MatchContext,
} from './engine';

/**
 * JUGAR UN PARTIDO — el paso que va entre el formato (quién juega contra quién)
 * y la persistencia (qué se guarda). Puro: no toca stores, Supabase ni el reloj.
 * El peso de la etapa entra como número, así que no lee la configuración del
 * motor: eso lo resuelve el llamador.
 *
 * Existe para que un cruce a ida y vuelta se juegue igual en cualquier modo.
 * Esa lógica —global sin gol de visitante, prórroga en la vuelta, penales desde
 * la perspectiva del local de la ida, Elo por partido— vivía sólo dentro del
 * store del modo de ligas, y un modo nuevo con copa habría tenido que copiarla.
 *
 * Un cruce se juega PARTIDO A PARTIDO (`playTieLeg`), nunca los dos de una: la
 * ida y la vuelta son dos jornadas distintas del torneo y el usuario las juega
 * por separado, igual que cualquier otro partido del juego.
 */

/** Energía a la que juega un equipo cuando el modo no la modela. */
export const FULL_ENERGY = 100;

export interface PipelineTeam {
  id: string;
  skill: number;
}

export interface PlayContext {
  /** Peso Elo de la etapa (`getStageImportance`). */
  importance: number;
  /** Cancha neutral: sin ventaja de local. */
  neutral: boolean;
  /** Inyectable para tests; por defecto Math.random. */
  rng?: () => number;
  /**
   * Energía 60-100 de cada equipo. Ausente ⇒ ambos al 100%: los modos de
   * temporada no modelan desgaste. Es el ÚNICO lugar donde vive ese default.
   */
  energy?: { home: number; away: number };
}

function contextFor(
  home: PipelineTeam,
  away: PipelineTeam,
  o: PlayContext,
): MatchContext {
  return {
    home: { skill: home.skill, energy: o.energy?.home ?? FULL_ENERGY },
    away: { skill: away.skill, energy: o.energy?.away ?? FULL_ENERGY },
    importance: o.importance,
    neutral: o.neutral,
    rng: o.rng,
  };
}

// ---------------------------------------------------------------------------
// Un partido
// ---------------------------------------------------------------------------

export interface PlayedMatch {
  homeScore: number;
  awayScore: number;
  homeChange: number;
  awayChange: number;
  /** Goles marcados EN el alargue. El marcador ya los incluye. */
  extraTime?: { homeGoals: number; awayGoals: number };
  /** Sólo si el alargue tampoco alcanzó. */
  penalties?: { homeScore: number; awayScore: number };
}

/**
 * Juega un partido suelto. Con `decisive` (una eliminación a partido único)
 * resuelve el empate con prórroga y, si hace falta, penales; el marcador que
 * devuelve es el de los 120' y el Elo sale de ése, igual que en el motor.
 */
export function playOneMatch(
  home: PipelineTeam,
  away: PipelineTeam,
  o: PlayContext & { decisive?: boolean },
): PlayedMatch {
  const ctx = contextFor(home, away, o);
  const result: ReturnType<typeof simulateMatchWithPenalties> = o.decisive
    ? simulateMatchWithPenalties(ctx)
    : simulateMatch(ctx);
  return {
    homeScore: result.homeScore,
    awayScore: result.awayScore,
    homeChange: result.homeSkillChange,
    awayChange: result.awaySkillChange,
    ...(result.extraTime ? { extraTime: result.extraTime } : {}),
    ...(result.penalties ? { penalties: result.penalties } : {}),
  };
}

// ---------------------------------------------------------------------------
// Un cruce (1 o 2 partidos)
// ---------------------------------------------------------------------------

export type TieLegs = 1 | 2;

/** Marcador de un partido del cruce, con la localía REAL de ese partido. */
export interface LegScore {
  homeScore: number;
  awayScore: number;
}

export interface PlayedLeg extends PlayedMatch {
  /**
   * Global del cruce contando este partido, desde la perspectiva del local de
   * la IDA. Con `legs: 1` es el marcador del partido.
   */
  aggregate: { home: number; away: number };
}

/** Global de un cruce visto desde el local de la ida (sin gol de visitante). */
function aggregateOf(legs: LegScore[]): { home: number; away: number } {
  let home = 0;
  let away = 0;
  legs.forEach((leg, i) => {
    // Los partidos impares (la vuelta) se juegan con la localía invertida.
    home += i % 2 === 0 ? leg.homeScore : leg.awayScore;
    away += i % 2 === 0 ? leg.awayScore : leg.homeScore;
  });
  return { home, away };
}

/**
 * Juega UN partido de un cruce de eliminación. `home`/`away` son los del cruce
 * (los de la IDA): con `legIndex` impar la localía se invierte sola, y el
 * marcador que devuelve es siempre el del local REAL de ese partido.
 *
 * En el último partido —y sólo si el cruce es `decisive`— se resuelve el
 * empate: el global no aplica gol de visitante, así que si queda igualado hay
 * 30' de prórroga con la localía de ese partido y, si sigue igualado, penales
 * desde la perspectiva del local de la ida. Por eso `previous` es obligatorio
 * para la vuelta: sin la ida no se sabe si hay que jugar el alargue.
 *
 * El Elo sale del marcador final de ESTE partido: los penales no lo mueven.
 */
export function playTieLeg(
  home: PipelineTeam,
  away: PipelineTeam,
  o: PlayContext & {
    legs: TieLegs;
    /** 0 = ida, 1 = vuelta. */
    legIndex: number;
    /** Marcadores de los partidos ya jugados del cruce, en orden. */
    previous?: LegScore[];
    decisive?: boolean;
  },
): PlayedLeg {
  const decisive = o.decisive ?? true;
  const isLast = o.legIndex === o.legs - 1;
  // En la vuelta el local es `away`.
  const local = o.legIndex % 2 === 0 ? home : away;
  const visitor = o.legIndex % 2 === 0 ? away : home;
  const ctx = contextFor(local, visitor, o);

  const result = simulateMatch(ctx);
  let homeScore = result.homeScore;
  let awayScore = result.awayScore;
  let extraTime: { homeGoals: number; awayGoals: number } | undefined;
  let penalties: { homeScore: number; awayScore: number } | undefined;

  const previous = o.previous ?? [];
  const aggregate = () => aggregateOf([...previous, { homeScore, awayScore }]);

  let agg = aggregate();
  if (isLast && decisive && agg.home === agg.away) {
    const et = simulateExtraTimeGoals(ctx);
    extraTime = et;
    homeScore += et.homeGoals;
    awayScore += et.awayGoals;
    agg = aggregate();
    if (agg.home === agg.away) {
      penalties = simulatePenalties(home.skill, away.skill, o.rng);
    }
  }

  const changes = calculateSkillChanges(
    local.skill,
    visitor.skill,
    homeScore,
    awayScore,
    o.importance,
  );

  return {
    homeScore,
    awayScore,
    homeChange: changes.homeChange,
    awayChange: changes.awayChange,
    aggregate: agg,
    ...(extraTime ? { extraTime } : {}),
    ...(penalties ? { penalties } : {}),
  };
}

// ---------------------------------------------------------------------------
// Filas de historial
// ---------------------------------------------------------------------------

/**
 * Una fila de `match_history`. El `modeId` NO va acá: lo pone quien persiste,
 * que es el único que sabe a qué modo pertenece la escritura, y es obligatorio
 * (ver el bug de atribución que arregló la etapa 0b).
 */
export interface HistoryRow {
  homeId: string;
  awayId: string;
  homeScore: number;
  awayScore: number;
  stage: MatchHistoryStage;
  homeBefore: number;
  awayBefore: number;
  homeAfter: number;
  awayAfter: number;
  homeChange: number;
  awayChange: number;
  /** Nombre de la competición/instancia que se muestra en el historial. */
  name: string;
  wentToExtraTime?: boolean;
}

/**
 * Nombre de un partido de cruce en el historial: un cruce a ida y vuelta se
 * etiqueta `<name> · Ida` y `<name> · Vuelta`; uno a partido único usa `name`
 * tal cual.
 */
export function tieLegName(name: string, legs: TieLegs, legIndex: number): string {
  return legs === 2 ? `${name} · ${legIndex === 0 ? 'Ida' : 'Vuelta'}` : name;
}

/** Fila de historial de un partido suelto (una liga, una fase de grupos, un leg). */
export function matchHistoryRow(
  home: PipelineTeam,
  away: PipelineTeam,
  played: PlayedMatch,
  o: { stage: MatchHistoryStage; name: string },
): HistoryRow {
  return {
    homeId: home.id,
    awayId: away.id,
    homeScore: played.homeScore,
    awayScore: played.awayScore,
    stage: o.stage,
    homeBefore: home.skill,
    awayBefore: away.skill,
    homeAfter: updateTeamSkill(home.skill, played.homeChange),
    awayAfter: updateTeamSkill(away.skill, played.awayChange),
    homeChange: played.homeChange,
    awayChange: played.awayChange,
    name: o.name,
    ...(played.extraTime ? { wentToExtraTime: true } : {}),
  };
}
