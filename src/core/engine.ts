import type { EngineConfig, KnockoutMatch, MatchResult } from '../types';
import { getEngineConfig } from '../store/useConfigStore';
import { clutchMultiplier, effectiveSkill } from './energy';

// Rondas continentales "tardías" (mayor peso Elo). El resto (R64/R32/R16) es "temprana".
const CONTINENTAL_LATE_ROUNDS: ReadonlyArray<KnockoutMatch['round']> = ['quarter', 'semi', 'third-place', 'final'];

/**
 * Peso de importancia (multiplicador del K-Factor) según la etapa y la ronda
 * del partido. Etapa desconocida → 1 (neutro). Solo afecta el cambio de skill.
 */
export function getStageImportance(
  stage: string | undefined,
  round: KnockoutMatch['round'] | undefined,
  config: EngineConfig,
): number {
  const w = config.importanceByStage;
  switch (stage) {
    case 'qualifier':
      return w.qualifier;
    case 'continental':
      return round && CONTINENTAL_LATE_ROUNDS.includes(round) ? w.continentalLate : w.continentalEarly;
    case 'confed-group':
      return w.confedGroup;
    case 'confed-knockout':
      return w.confedKnockout;
    case 'world-cup-group':
      return w.wcGroup;
    case 'world-cup-knockout':
      return w.wcKnockout;
    default:
      return 1;
  }
}

export interface MatchTeamContext {
  skill: number;
  /** 60-100. Usar 100 cuando no hay estado de energía (torneo legacy). */
  energy: number;
}

export interface MatchContext {
  home: MatchTeamContext;
  away: MatchTeamContext;
  /** Peso de la etapa, de `getStageImportance`. */
  importance: number;
  /** Cancha neutral: sin ventaja de local (Mundial y toda eliminación directa). */
  neutral: boolean;
  /** Inyectable para tests; por defecto Math.random. */
  rng?: () => number;
}

/**
 * Simula un partido. El cansancio y el oficio entran por el skill efectivo; el
 * Elo se calcula SIEMPRE con el skill real, así que ganar cansado premia igual.
 */
export function simulateMatch(ctx: MatchContext): MatchResult {
  const config = getEngineConfig();
  const rng = ctx.rng ?? Math.random;

  const homeEffective =
    effectiveSkill(ctx.home.skill, ctx.home.energy, config.fatigue) +
    (ctx.neutral ? 0 : config.homeAdvantage);
  const awayEffective = effectiveSkill(ctx.away.skill, ctx.away.energy, config.fatigue);

  // El oficio amplifica la diferencia según lo exigente que sea el partido.
  const skillDiff =
    (homeEffective - awayEffective) *
    clutchMultiplier(ctx.home.skill, ctx.away.skill, ctx.importance, config.fatigue);

  const homeScore = generateGoals(1.5 + skillDiff / 50, rng);
  const awayScore = generateGoals(1.5 - skillDiff / 50, rng);

  // El Elo usa el skill real (no el efectivo): ganar cansado premia igual.
  const { homeChange, awayChange } = calculateSkillChanges(
    ctx.home.skill,
    ctx.away.skill,
    homeScore,
    awayScore,
    ctx.importance,
  );

  return {
    homeScore,
    awayScore,
    homeSkillChange: homeChange,
    awaySkillChange: awayChange,
  };
}

/**
 * Generates goals based on expected goals using a Poisson distribution
 * (Knuth's algorithm), capped at 7 goals per team
 */
function generateGoals(expectedGoals: number, rng: () => number = Math.random): number {
  // Clamp expected goals to reasonable range
  const lambda = Math.max(0.05, Math.min(4, expectedGoals));

  const limit = Math.exp(-lambda);
  let goals = -1;
  let product = 1;

  do {
    goals++;
    product *= rng();
  } while (product > limit);

  return Math.min(goals, 7);
}

/**
 * Calculates skill rating changes based on match result
 * Uses ELO-like system with K-factor scaled by importance
 */
export function calculateSkillChanges(
  homeSkill: number,
  awaySkill: number,
  homeScore: number,
  awayScore: number,
  importance = 1,
): { homeChange: number; awayChange: number } {
  const config = getEngineConfig();

  // K-factor escalado por la importancia de la etapa
  const kFactor = config.kFactor * importance;

  // Expected result (0-1 scale). The divisor is calibrated so the Elo
  // expectation matches the actual win probability of the goal model
  // on the 30-100 skill scale (~75); chess-style 400 would treat every
  // match as a near coin flip and make ratings drift without bound.
  const expectedHome = 1 / (1 + Math.pow(10, (awaySkill - homeSkill) / config.eloDivisor));

  // Actual result (1 = win, 0.5 = draw, 0 = loss)
  let actualHome: number;
  if (homeScore > awayScore) actualHome = 1;
  else if (homeScore === awayScore) actualHome = 0.5;
  else actualHome = 0;

  // Fractional changes (rounded to 2 decimals to avoid float noise);
  // integer rounding is far too coarse on a 60-point scale
  const homeChange = Math.round(kFactor * (actualHome - expectedHome) * 100) / 100;
  const awayChange = -homeChange;

  return { homeChange, awayChange };
}

/**
 * Updates a team's skill rating, ensuring it stays within bounds
 */
export function updateTeamSkill(currentSkill: number, change: number): number {
  const config = getEngineConfig();
  const newSkill = Math.round((currentSkill + change) * 100) / 100;
  // Keep skill between configured limits
  return Math.max(config.skillMin, Math.min(config.skillMax, newSkill));
}

/**
 * Simula un partido de eliminación directa, con penales si termina empatado.
 * El alargue llega en la Task 3; por ahora el contexto se pasa igual que en
 * `simulateMatch`.
 */
export function simulateMatchWithPenalties(
  ctx: MatchContext,
): MatchResult & { penalties?: { homeScore: number; awayScore: number } } {
  const result = simulateMatch(ctx);

  // If it's a draw, simulate penalties
  if (result.homeScore === result.awayScore) {
    const penalties = simulatePenalties(ctx.home.skill, ctx.away.skill, ctx.rng);
    return { ...result, penalties };
  }

  return result;
}

/**
 * Simula una tanda de penales realista: tiros alternados con "muerte
 * matemática" (la tanda termina en cuanto un equipo ya no puede ser
 * alcanzado con los tiros que le quedan al rival) y muerte súbita si
 * la fase regular termina empatada. `rng` inyectable para tests.
 */
export function simulatePenalties(
  homeSkill: number,
  awaySkill: number,
  rng: () => number = Math.random,
): { homeScore: number; awayScore: number } {
  // Tasa de conversión según skill (75-90%).
  const homeConversionRate = 0.75 + (homeSkill / 100) * 0.15;
  const awayConversionRate = 0.75 + (awaySkill / 100) * 0.15;

  let homeScore = 0;
  let awayScore = 0;
  let homeRemaining = 5;
  let awayRemaining = 5;

  const decided = () =>
    homeScore > awayScore + awayRemaining || awayScore > homeScore + homeRemaining;

  // Fase regular: hasta 5 por lado, alternando; corta al quedar decidida.
  while (homeRemaining > 0 || awayRemaining > 0) {
    if (homeRemaining > 0) {
      if (rng() < homeConversionRate) homeScore++;
      homeRemaining--;
      if (decided()) break;
    }
    if (awayRemaining > 0) {
      if (rng() < awayConversionRate) awayScore++;
      awayRemaining--;
      if (decided()) break;
    }
  }

  // Muerte súbita: de a pares hasta que un par rompa el empate.
  while (homeScore === awayScore) {
    const homeGoal = rng() < homeConversionRate;
    const awayGoal = rng() < awayConversionRate;
    if (homeGoal) homeScore++;
    if (awayGoal) awayScore++;
  }

  return { homeScore, awayScore };
}
