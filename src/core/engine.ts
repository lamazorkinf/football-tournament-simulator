import type { EngineConfig, KnockoutMatch, MatchResult } from '../types';
import { getEngineConfig } from '../store/useConfigStore';

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

/**
 * Simulates a football match based on team skills
 * @param homeSkill - Home team skill rating (0-100)
 * @param awaySkill - Away team skill rating (0-100)
 * @param disableHomeAdvantage - If true, no home advantage is applied (for World Cup/Knockouts)
 * @param importance - Multiplier for skill changes (default 1)
 * @returns Match result with scores and skill changes
 */
export function simulateMatch(homeSkill: number, awaySkill: number, disableHomeAdvantage = false, importance = 1): MatchResult {
  const config = getEngineConfig();

  // Home advantage: configurable skill points (disabled for World Cup and knockouts)
  const adjustedHomeSkill = disableHomeAdvantage ? homeSkill : homeSkill + config.homeAdvantage;

  // Calculate skill difference (affects expected goals)
  const skillDiff = adjustedHomeSkill - awaySkill;

  // Base expected goals (Poisson-like distribution)
  const homeExpectedGoals = 1.5 + (skillDiff / 50);
  const awayExpectedGoals = 1.5 - (skillDiff / 50);

  // Generate actual goals with randomness
  const homeScore = generateGoals(homeExpectedGoals);
  const awayScore = generateGoals(awayExpectedGoals);

  // Calculate skill updates (ELO-like system)
  const { homeChange, awayChange } = calculateSkillChanges(
    homeSkill,
    awaySkill,
    homeScore,
    awayScore,
    importance,
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
function generateGoals(expectedGoals: number): number {
  // Clamp expected goals to reasonable range
  const lambda = Math.max(0.05, Math.min(4, expectedGoals));

  const limit = Math.exp(-lambda);
  let goals = -1;
  let product = 1;

  do {
    goals++;
    product *= Math.random();
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
 * Simulates a match with potential penalties (for knockout stages)
 * @param importance - Multiplier for skill changes (default 1)
 */
export function simulateMatchWithPenalties(
  homeSkill: number,
  awaySkill: number,
  disableHomeAdvantage = true, // Knockouts are always neutral
  importance = 1,
): MatchResult & { penalties?: { homeScore: number; awayScore: number } } {
  const result = simulateMatch(homeSkill, awaySkill, disableHomeAdvantage, importance);

  // If it's a draw, simulate penalties
  if (result.homeScore === result.awayScore) {
    const penalties = simulatePenalties(homeSkill, awaySkill);
    return { ...result, penalties };
  }

  return result;
}

/**
 * Simulates penalty shootout
 */
function simulatePenalties(
  homeSkill: number,
  awaySkill: number
): { homeScore: number; awayScore: number } {
  // Penalty conversion rate based on skill (75-90% conversion)
  const homeConversionRate = 0.75 + (homeSkill / 100) * 0.15;
  const awayConversionRate = 0.75 + (awaySkill / 100) * 0.15;

  let homeScore = 0;
  let awayScore = 0;

  // Standard 5 penalties each
  for (let i = 0; i < 5; i++) {
    if (Math.random() < homeConversionRate) homeScore++;
    if (Math.random() < awayConversionRate) awayScore++;
  }

  // Sudden death if tied
  while (homeScore === awayScore) {
    if (Math.random() < homeConversionRate) homeScore++;
    if (Math.random() < awayConversionRate) awayScore++;
  }

  return { homeScore, awayScore };
}
