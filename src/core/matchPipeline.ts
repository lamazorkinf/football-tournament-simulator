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
 * JUGAR UN PARTIDO O UN CRUCE — el paso que va entre el formato (quién juega
 * contra quién) y la persistencia (qué se guarda). Puro: no toca stores,
 * Supabase ni el reloj. El peso de la etapa entra como número, así que no lee
 * la configuración del motor: eso lo resuelve el llamador.
 *
 * Existe para que un cruce a ida y vuelta se juegue igual en cualquier modo.
 * Antes esa lógica —global sin gol de visitante, prórroga en la vuelta, penales
 * desde la perspectiva del local de la ida, Elo por leg— vivía sólo dentro del
 * store del modo de ligas, y un modo nuevo con copa habría tenido que copiarla.
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
  /** Sólo en partidos decisivos que se fueron al alargue. */
  extraTime?: boolean;
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
    ...(result.extraTime ? { extraTime: true } : {}),
    ...(result.penalties ? { penalties: result.penalties } : {}),
  };
}

// ---------------------------------------------------------------------------
// Un cruce (1 o 2 partidos)
// ---------------------------------------------------------------------------

export type TieLegs = 1 | 2;

export interface PlayedTie {
  /** Marcadores en el orden de los partidos, con el local REAL de cada uno. */
  legs: Array<{ homeScore: number; awayScore: number }>;
  /** Cambios de Elo por partido, también con el local real de cada uno. */
  legChanges: Array<{ homeChange: number; awayChange: number }>;
  /** Global desde la perspectiva del local de la IDA. */
  aggregate: { home: number; away: number };
  extraTime: boolean;
  /** Perspectiva del local de la ida. */
  penalties?: { homeScore: number; awayScore: number };
  /** Delta total de skill por equipo, sumando los dos partidos. */
  deltas: Map<string, number>;
}

/**
 * Juega un cruce. `home`/`away` son los del PRIMER partido; con `legs: 2` la
 * vuelta se juega con la localía invertida.
 *
 * El global no aplica gol de visitante (regla actual del juego). Si `decisive`
 * y el global queda empatado, hay 30' de prórroga en el último partido con su
 * misma localía y, si sigue igualado, penales desde la perspectiva del local de
 * la ida. El Elo se calcula por partido sobre su marcador final: los penales no
 * lo mueven.
 */
export function playTie(
  home: PipelineTeam,
  away: PipelineTeam,
  o: PlayContext & { legs: TieLegs; decisive?: boolean },
): PlayedTie {
  const decisive = o.decisive ?? true;

  if (o.legs === 1) {
    const played = playOneMatch(home, away, { ...o, decisive });
    return {
      legs: [{ homeScore: played.homeScore, awayScore: played.awayScore }],
      legChanges: [{ homeChange: played.homeChange, awayChange: played.awayChange }],
      aggregate: { home: played.homeScore, away: played.awayScore },
      extraTime: played.extraTime ?? false,
      ...(played.penalties ? { penalties: played.penalties } : {}),
      deltas: new Map([
        [home.id, played.homeChange],
        [away.id, played.awayChange],
      ]),
    };
  }

  // Ida: `home` de local. Vuelta: `away` de local.
  const leg1 = simulateMatch(contextFor(home, away, o));
  const leg2 = simulateMatch(contextFor(away, home, o));

  let leg2Home = leg2.homeScore; // goles de `away`, local en la vuelta
  let leg2Away = leg2.awayScore; // goles de `home`, visitante en la vuelta
  let extraTime = false;
  let penalties: { homeScore: number; awayScore: number } | undefined;

  const aggregate = () => ({
    home: leg1.homeScore + leg2Away,
    away: leg1.awayScore + leg2Home,
  });

  let agg = aggregate();
  if (decisive && agg.home === agg.away) {
    extraTime = true;
    // Prórroga en la vuelta: mismo contexto, `away` sigue de local.
    const et = simulateExtraTimeGoals(contextFor(away, home, o));
    leg2Home += et.homeGoals;
    leg2Away += et.awayGoals;
    agg = aggregate();
    if (agg.home === agg.away) {
      penalties = simulatePenalties(home.skill, away.skill, o.rng);
    }
  }

  // Elo por partido, sobre el marcador final de cada uno (la ida a 90', la
  // vuelta a 90' o 120').
  const leg1Changes = calculateSkillChanges(
    home.skill,
    away.skill,
    leg1.homeScore,
    leg1.awayScore,
    o.importance,
  );
  // En la vuelta el local es `away`: los cambios se calculan con away como "home".
  const leg2Changes = calculateSkillChanges(
    away.skill,
    home.skill,
    leg2Home,
    leg2Away,
    o.importance,
  );

  return {
    legs: [
      { homeScore: leg1.homeScore, awayScore: leg1.awayScore },
      { homeScore: leg2Home, awayScore: leg2Away },
    ],
    legChanges: [leg1Changes, leg2Changes],
    aggregate: agg,
    extraTime,
    ...(penalties ? { penalties } : {}),
    deltas: new Map([
      [home.id, leg1Changes.homeChange + leg2Changes.awayChange],
      [away.id, leg1Changes.awayChange + leg2Changes.homeChange],
    ]),
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

export interface HistoryOptions {
  stage: MatchHistoryStage;
  /** Nombre base de la competición. */
  name: string;
  /**
   * Nombre por partido. Por defecto, un cruce de dos partidos se etiqueta
   * `<name> · Ida` y `<name> · Vuelta`; uno solo usa `name` tal cual.
   */
  legNames?: string[];
}

function defaultLegNames(name: string, legs: number): string[] {
  return legs === 2 ? [`${name} · Ida`, `${name} · Vuelta`] : [name];
}

/**
 * Filas de historial de un cruce, una por partido, con la localía real de cada
 * uno.
 *
 * Los skills "después" siguen la convención que ya tenía el modo de ligas: en
 * los partidos intermedios se muestra el efecto de ESE partido sobre el skill
 * de partida, y en el último el skill final del cruce completo. `before` es
 * siempre el skill con el que el equipo llegó al cruce.
 */
export function tieHistoryRows(
  home: PipelineTeam,
  away: PipelineTeam,
  played: PlayedTie,
  o: HistoryOptions,
): HistoryRow[] {
  const names = o.legNames ?? defaultLegNames(o.name, played.legs.length);
  const lastIndex = played.legs.length - 1;

  const finalSkill = new Map<string, number>([
    [home.id, updateTeamSkill(home.skill, played.deltas.get(home.id) ?? 0)],
    [away.id, updateTeamSkill(away.skill, played.deltas.get(away.id) ?? 0)],
  ]);

  return played.legs.map((leg, i) => {
    // Los partidos impares (la vuelta) se juegan con la localía invertida.
    const local = i % 2 === 0 ? home : away;
    const visitor = i % 2 === 0 ? away : home;
    const changes = played.legChanges[i];

    const after = (team: PipelineTeam, change: number): number =>
      i === lastIndex
        ? finalSkill.get(team.id)!
        : updateTeamSkill(team.skill, change);

    return {
      homeId: local.id,
      awayId: visitor.id,
      homeScore: leg.homeScore,
      awayScore: leg.awayScore,
      stage: o.stage,
      homeBefore: local.skill,
      awayBefore: visitor.skill,
      homeAfter: after(local, changes.homeChange),
      awayAfter: after(visitor, changes.awayChange),
      homeChange: changes.homeChange,
      awayChange: changes.awayChange,
      name: names[i] ?? o.name,
      ...(i === lastIndex && played.extraTime ? { wentToExtraTime: true } : {}),
    };
  });
}

/** Fila de historial de un partido suelto (una liga, una fase de grupos). */
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
