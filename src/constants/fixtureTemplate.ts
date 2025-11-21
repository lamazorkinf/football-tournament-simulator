/**
 * FIFA-style fixture template for 5-team groups
 * Each team plays every other team twice (home and away)
 * Total: 20 matches (10 first leg + 10 second leg)
 *
 * Letters A-E represent pot positions:
 * - A: Pot 1 (top seeds)
 * - B: Pot 2
 * - C: Pot 3
 * - D: Pot 4
 * - E: Pot 5
 */

export type FixtureLetter = 'A' | 'B' | 'C' | 'D' | 'E';

export interface FixtureTemplate {
  matchday: number;
  home: FixtureLetter;
  away: FixtureLetter;
  isSecondLeg: boolean;
}

export const FIXTURE_TEMPLATE: FixtureTemplate[] = [
  // First leg matches (Matchdays 1-10)
  { matchday: 1, home: 'B', away: 'E', isSecondLeg: false },
  { matchday: 2, home: 'D', away: 'A', isSecondLeg: false },
  { matchday: 3, home: 'A', away: 'C', isSecondLeg: false },
  { matchday: 4, home: 'E', away: 'D', isSecondLeg: false },
  { matchday: 5, home: 'B', away: 'A', isSecondLeg: false },
  { matchday: 6, home: 'C', away: 'D', isSecondLeg: false },
  { matchday: 7, home: 'C', away: 'E', isSecondLeg: false },
  { matchday: 8, home: 'D', away: 'B', isSecondLeg: false },
  { matchday: 9, home: 'B', away: 'C', isSecondLeg: false },
  { matchday: 10, home: 'E', away: 'A', isSecondLeg: false },

  // Second leg matches (Matchdays 11-20)
  { matchday: 11, home: 'E', away: 'B', isSecondLeg: true },
  { matchday: 12, home: 'A', away: 'D', isSecondLeg: true },
  { matchday: 13, home: 'C', away: 'A', isSecondLeg: true },
  { matchday: 14, home: 'D', away: 'E', isSecondLeg: true },
  { matchday: 15, home: 'A', away: 'B', isSecondLeg: true },
  { matchday: 16, home: 'D', away: 'C', isSecondLeg: true },
  { matchday: 17, home: 'E', away: 'C', isSecondLeg: true },
  { matchday: 18, home: 'B', away: 'D', isSecondLeg: true },
  { matchday: 19, home: 'C', away: 'B', isSecondLeg: true },
  { matchday: 20, home: 'A', away: 'E', isSecondLeg: true },
];
