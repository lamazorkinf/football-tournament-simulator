import type { CyclePhase, KnockoutMatch, Match, Region } from '../types';
import { CYCLE_PHASE_ORDER } from './calendar';

/** Etapa de un partido dentro del Match Center (filtro visual + ruteo de acciones). */
export type MatchStage =
  | 'qualifier'
  | 'world-cup'
  | 'knockout'
  | 'continental'
  | 'confederations';

export type MatchWithContext = {
  match: Match;
  stage: MatchStage;
  groupId: string;
  groupName: string;
  region?: Region;
  /** Jornada visual dentro de su fase (ver getDisplayJornada). */
  displayJornada: number;
};

/** Fase del ciclo a la que pertenece una MatchStage. */
export function stageToPhase(stage: MatchStage): CyclePhase {
  switch (stage) {
    case 'qualifier':
      return 'wc-qualifiers';
    case 'world-cup':
      return 'wc-groups';
    case 'knockout':
      return 'wc-knockout';
    case 'continental':
      return 'continental';
    case 'confederations':
      return 'confed';
  }
}

/**
 * Jornada de la eliminatoria del Mundial derivada de la ronda: los KnockoutMatch
 * del mundial no llevan `matchday` estampado. `round-of-64` no existe en el
 * mundial; se mapea defensivamente junto a R32.
 */
const WC_KNOCKOUT_JORNADA: Record<KnockoutMatch['round'], number> = {
  'round-of-128': 1,
  'round-of-64': 1,
  'round-of-32': 1,
  'round-of-16': 2,
  quarter: 3,
  semi: 4,
  'third-place': 5,
  final: 5,
};

/**
 * Jornada visual de un partido dentro de su fase.
 * - Clasificatorias: el template trae 20 matchdays de 1 partido por grupo; la
 *   jornada visual empareja fechas consecutivas → `ceil(matchday/2)`, 10
 *   jornadas de 2 partidos por grupo (el pareo nunca repite equipo).
 * - Grupos de mundial / continental / confederaciones: `matchday` estampado.
 * - Eliminatoria de mundial: derivada de `round` (sin matchday estampado).
 */
export function getDisplayJornada(stage: MatchStage, match: Match): number {
  if (stage === 'qualifier') return Math.ceil((match.matchday ?? 1) / 2);
  if (stage === 'knockout') {
    const round = (match as KnockoutMatch).round;
    return WC_KNOCKOUT_JORNADA[round] ?? match.matchday ?? 1;
  }
  return match.matchday ?? 1;
}

/** Matchdays del template de clasificatorias cubiertos por una jornada visual. */
export function qualifierTemplateMatchdays(displayJornada: number): [number, number] {
  return [displayJornada * 2 - 1, displayJornada * 2];
}

export const PHASE_LABEL: Record<Exclude<CyclePhase, 'completed'>, string> = {
  continental: 'Continental',
  confed: 'Confederaciones',
  'wc-qualifiers': 'Clasificatorias',
  'wc-groups': 'Mundial · Grupos',
  'wc-knockout': 'Mundial · Eliminatorias',
};

const CONTINENTAL_JORNADA_LABEL: Record<number, string> = {
  1: 'R64',
  2: 'R32',
  3: 'Octavos',
  4: 'Cuartos',
  5: 'Semifinales',
  6: 'Final y 3er puesto',
};

const CONFED_JORNADA_LABEL: Record<number, string> = {
  4: 'Semifinales',
  5: 'Final y 3er puesto',
};

const WC_KNOCKOUT_JORNADA_LABEL: Record<number, string> = {
  1: 'R32',
  2: 'Octavos',
  3: 'Cuartos',
  4: 'Semifinales',
  5: 'Final y 3er puesto',
};

/** Label corto de una jornada dentro de su fase (ej: 'Jornada 3', 'Octavos'). */
export function jornadaLabel(phase: CyclePhase, jornada: number): string {
  if (phase === 'continental') return CONTINENTAL_JORNADA_LABEL[jornada] ?? `Ronda ${jornada}`;
  if (phase === 'confed') return CONFED_JORNADA_LABEL[jornada] ?? `Jornada ${jornada}`;
  if (phase === 'wc-knockout') return WC_KNOCKOUT_JORNADA_LABEL[jornada] ?? `Ronda ${jornada}`;
  return `Jornada ${jornada}`;
}

export interface JornadaGroup {
  phase: CyclePhase;
  jornada: number;
  /** Label de la jornada dentro de la fase (ej: 'Jornada 3', 'Cuartos'). */
  label: string;
  /** Label de la fase (ej: 'Clasificatorias', 'Mundial · Eliminatorias'). */
  phaseLabel: string;
  matches: MatchWithContext[];
  isComplete: boolean;
}

/**
 * Agrupa los partidos del ciclo en jornadas identificadas por (fase, número),
 * ordenadas según CYCLE_PHASE_ORDER y por número dentro de cada fase. Los
 * números de matchday se repiten entre fases, por eso la clave es el par.
 */
export function groupIntoJornadas(all: MatchWithContext[]): JornadaGroup[] {
  const byKey = new Map<string, JornadaGroup>();

  for (const item of all) {
    const phase = stageToPhase(item.stage);
    const jornada = item.displayJornada;
    const key = `${phase}#${jornada}`;
    let group = byKey.get(key);
    if (!group) {
      group = {
        phase,
        jornada,
        label: jornadaLabel(phase, jornada),
        phaseLabel: PHASE_LABEL[phase as Exclude<CyclePhase, 'completed'>] ?? phase,
        matches: [],
        isComplete: false,
      };
      byKey.set(key, group);
    }
    group.matches.push(item);
  }

  const groups = [...byKey.values()];
  for (const group of groups) {
    group.isComplete = group.matches.length > 0 && group.matches.every((m) => m.match.isPlayed);
  }
  groups.sort(
    (a, b) =>
      CYCLE_PHASE_ORDER.indexOf(a.phase) - CYCLE_PHASE_ORDER.indexOf(b.phase) ||
      a.jornada - b.jornada,
  );
  return groups;
}

/** Primera jornada (en orden de ciclo) con algún partido sin jugar; null si no queda. */
export function getCurrentJornada(groups: JornadaGroup[]): JornadaGroup | null {
  return groups.find((g) => g.matches.some((m) => !m.match.isPlayed)) ?? null;
}
