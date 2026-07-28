import type { KnockoutMatch } from '../types';

/** Torneo al que pertenece un partido. El desgaste se acumula dentro de uno solo. */
export type TournamentScope = 'continental' | 'confed' | 'wc-qualifiers' | 'world-cup';

/** Etapa de un partido, tal como la usa `getStageImportance`. */
export type MatchStage =
  | 'qualifier'
  | 'world-cup-group'
  | 'world-cup-knockout'
  | 'continental'
  | 'confed-group'
  | 'confed-knockout';

export interface TeamEnergy {
  value: number;
  /** Índice de jornada del último partido jugado, para la recuperación perezosa. */
  lastMatchdayIndex: number;
}

export interface EnergyState {
  scope: TournamentScope;
  byTeam: Record<string, TeamEnergy>;
}

export interface FatigueConfig {
  enabled: boolean;
  energyMin: number;
  penaltyPerPoint: number;
  clutchGain: number;
  costBase: number;
  costDifficulty: number;
  costTight: number;
  costExtraTime: number;
  costPenalties: number;
  depthMax: number;
  recovery: number;
  recoveryQualifiers: number;
  /** Fracción del caudal de goles del partido que se juega en el alargue. */
  extraTimeShare: number;
}

export const ENERGY_MAX = 100;

/**
 * Calibrado por simulación sobre los skills reales de la DB (20.000 Mundiales).
 * Ver docs/superpowers/specs/2026-07-24-energia-oficio-prorroga-design.md:
 * con estos valores el top-8 pasa de llevarse el 47,8% de los títulos al 53,9%
 * y los penales bajan del 23,7% al 11,8% de los partidos de eliminación directa.
 */
export const DEFAULT_FATIGUE: FatigueConfig = {
  enabled: true,
  energyMin: 60,
  penaltyPerPoint: 0.2,
  clutchGain: 0.15,
  costBase: 6,
  costDifficulty: 4,
  costTight: 2,
  costExtraTime: 7,
  costPenalties: 2,
  depthMax: 0.25,
  recovery: 4,
  recoveryQualifiers: 8,
  extraTimeShare: (30 / 90) * 0.85,
};

/** Orden de las rondas de eliminación directa. Tercer puesto y final comparten jornada. */
const ROUND_ORDER: Record<KnockoutMatch['round'], number> = {
  // R128 no la usa ningún torneo del juego hoy; se mapea junto a R64 para que
  // el Record quede exhaustivo sobre la taxonomía compartida de rondas.
  'round-of-128': 1,
  'round-of-64': 1,
  'round-of-32': 2,
  'round-of-16': 3,
  quarter: 4,
  semi: 5,
  'third-place': 6,
  final: 6,
};

/**
 * Cada torneo empieza su eliminación directa en una ronda distinta —la
 * continental en R64, el Mundial en R32, Confederaciones en semis— y algunos
 * traen fase de grupos antes. Estas dos tablas alinean todo a un índice que
 * arranca en 1 para el primer partido del torneo.
 */
const KNOCKOUT_START: Record<'continental' | 'world-cup-knockout' | 'confed-knockout', number> = {
  continental: ROUND_ORDER['round-of-64'],
  'world-cup-knockout': ROUND_ORDER['round-of-32'],
  'confed-knockout': ROUND_ORDER.semi,
};

/** Jornadas de fase de grupos que preceden a la eliminación directa (grupos de 4). */
const GROUP_MATCHDAYS_BEFORE: Record<'continental' | 'world-cup-knockout' | 'confed-knockout', number> = {
  continental: 0,
  'world-cup-knockout': 3,
  'confed-knockout': 3,
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Skill normalizado al rango 30-100 de la app. */
const normSkill = (s: number) => clamp01((s - 30) / 70);

/**
 * Importancia normalizada contra 1,6, el peso por defecto del knockout del
 * Mundial. Los pesos son editables desde Ajustes, así que el clamp es
 * load-bearing: subirlos no debe desbordar la dificultad.
 */
const normImp = (i: number) => clamp01(i / 1.6);

export function scopeForStage(stage: MatchStage): TournamentScope {
  switch (stage) {
    case 'continental':
      return 'continental';
    case 'confed-group':
    case 'confed-knockout':
      return 'confed';
    case 'qualifier':
      return 'wc-qualifiers';
    case 'world-cup-group':
    case 'world-cup-knockout':
      return 'world-cup';
  }
}

/**
 * Índice de jornada dentro del torneo, que es el reloj de la recuperación.
 *
 * Se deriva de la RONDA y no de `Match.matchday` porque los partidos de
 * eliminación directa del Mundial no llevan jornada: `knockout.ts` no la
 * asigna (sólo continental y confed lo hacen). La continental arranca
 * directamente en R64, así que no se le suma fase de grupos.
 */
export function matchdayIndexFor(
  stage: MatchStage,
  round: KnockoutMatch['round'] | undefined,
  matchday: number | undefined,
): number {
  switch (stage) {
    case 'qualifier':
    case 'world-cup-group':
    case 'confed-group':
      return matchday ?? 1;
    case 'continental':
    case 'world-cup-knockout':
    case 'confed-knockout': {
      if (!round) return matchday ?? 1;
      return (
        GROUP_MATCHDAYS_BEFORE[stage] + (ROUND_ORDER[round] - KNOCKOUT_START[stage]) + 1
      );
    }
  }
}

export function fatiguePenalty(energy: number, cfg: FatigueConfig): number {
  if (!cfg.enabled) return 0;
  return (ENERGY_MAX - energy) * cfg.penaltyPerPoint;
}

export function effectiveSkill(skill: number, energy: number, cfg: FatigueConfig): number {
  return skill - fatiguePenalty(energy, cfg);
}

/**
 * Cuánto se amplifica la diferencia de skill por el "oficio". Mide qué tan
 * exigente es el partido PARA EL FAVORITO: de ahí el `min` de los dos skills.
 *
 * Es MULTIPLICATIVO a propósito. Con la forma aditiva que se probó primero
 * (`0,6 × calidadMedia + 0,4 × importancia`), unos octavos de Mundial daban
 * dificultad alta aunque enfrente estuviera el peor rival del cuadro, y un
 * equipo exhausto le ganaba a un rival muy inferior MÁS seguido que sin fatiga.
 */
export function clutchMultiplier(
  homeSkill: number,
  awaySkill: number,
  importance: number,
  cfg: FatigueConfig,
): number {
  if (!cfg.enabled) return 1;
  const difficulty = normSkill(Math.min(homeSkill, awaySkill)) * (0.6 + 0.4 * normImp(importance));
  return 1 + difficulty * cfg.clutchGain;
}

export interface EnergyCostInput {
  skill: number;
  oppSkill: number;
  importance: number;
  /** Diferencia de 0 o 1 gol en el resultado FINAL, contando el alargue. */
  tight: boolean;
  extraTime: boolean;
  penalties: boolean;
}

export function matchEnergyCost(input: EnergyCostInput, cfg: FatigueConfig): number {
  if (!cfg.enabled) return 0;
  const opponentDifficulty = 0.6 * normSkill(input.oppSkill) + 0.4 * normImp(input.importance);

  let cost = cfg.costBase + cfg.costDifficulty * opponentDifficulty;
  if (input.tight) cost += cfg.costTight;
  if (input.extraTime) cost += cfg.costExtraTime;
  if (input.penalties) cost += cfg.costPenalties;

  // Profundidad de plantel: los equipos grandes rotan y se cansan menos. Sin
  // esto la fatiga castiga más al grande, que es el que juega más partidos duros.
  return cost * (1 - cfg.depthMax * normSkill(input.skill));
}

const recoveryFor = (scope: TournamentScope, cfg: FatigueConfig) =>
  scope === 'wc-qualifiers' ? cfg.recoveryQualifiers : cfg.recovery;

/**
 * Energía con la que un equipo entra a un partido, ya recuperada por las
 * jornadas que pasaron desde el último que jugó. Un torneo distinto al guardado
 * arranca de cero. No muta nada.
 */
export function resolveEnergy(
  state: EnergyState | undefined,
  scope: TournamentScope,
  matchdayIndex: number,
  teamId: string,
  cfg: FatigueConfig,
): number {
  if (!cfg.enabled) return ENERGY_MAX;
  if (!state || state.scope !== scope) return ENERGY_MAX;

  const entry = state.byTeam[teamId];
  if (!entry) return ENERGY_MAX;

  const rested = Math.max(0, matchdayIndex - entry.lastMatchdayIndex);
  return Math.min(ENERGY_MAX, entry.value + rested * recoveryFor(scope, cfg));
}

/**
 * Estado nuevo tras un partido. Si el torneo cambió, descarta el anterior
 * entero: cada torneo empieza al 100%.
 */
export function commitEnergy(
  state: EnergyState | undefined,
  scope: TournamentScope,
  matchdayIndex: number,
  updates: Array<{ teamId: string; energy: number }>,
  cfg: FatigueConfig,
): EnergyState {
  const base = state && state.scope === scope ? state.byTeam : {};
  const byTeam: Record<string, TeamEnergy> = { ...base };

  for (const { teamId, energy } of updates) {
    byTeam[teamId] = {
      // El piso sale del config, no de la constante: el usuario puede bajarlo
      // desde Ajustes y clampear contra el default lo ignoraría en silencio.
      value: Math.max(cfg.energyMin, Math.min(ENERGY_MAX, energy)),
      lastMatchdayIndex: matchdayIndex,
    };
  }

  return { scope, byTeam };
}
