/**
 * Utility functions for generating SVG paths for bracket connections
 */

export interface BracketLineCoords {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  midX?: number;
}

/**
 * Generates SVG path for connecting two bracket matches
 * Creates a smooth curved line from right of match1 to left of match2
 */
export function generateBracketPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): string {
  const midX = (x1 + x2) / 2;

  // Use cubic bezier curve for smooth connection
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
}

/**
 * Generates coordinates for Round of 16 to Quarter Finals connections
 */
export function getRound16ToQuarterCoords(
  matchIndex: number,
  baseY: number,
  spacing: number,
  horizontalGap: number
): BracketLineCoords {
  const pairIndex = Math.floor(matchIndex / 2);

  const x1 = 0; // Right edge of R16 match
  const y1 = baseY + matchIndex * spacing;
  const x2 = horizontalGap; // Left edge of QF match
  const y2 = baseY + pairIndex * spacing * 2 + spacing / 2;

  return { x1, y1, x2, y2, midX: horizontalGap / 2 };
}

/**
 * Generates coordinates for Quarter Finals to Semi Finals connections
 */
export function getQuarterToSemiCoords(
  matchIndex: number,
  baseY: number,
  spacing: number,
  horizontalGap: number
): BracketLineCoords {
  const pairIndex = Math.floor(matchIndex / 2);

  const x1 = 0;
  const y1 = baseY + matchIndex * spacing;
  const x2 = horizontalGap;
  const y2 = baseY + pairIndex * spacing * 2 + spacing / 2;

  return { x1, y1, x2, y2, midX: horizontalGap / 2 };
}

/**
 * Generates coordinates for Semi Finals to Final connections
 */
export function getSemiToFinalCoords(
  matchIndex: number,
  baseY: number,
  spacing: number,
  horizontalGap: number
): BracketLineCoords {
  const x1 = 0;
  const y1 = baseY + matchIndex * spacing;
  const x2 = horizontalGap;
  const y2 = baseY + spacing / 2;

  return { x1, y1, x2, y2, midX: horizontalGap / 2 };
}

/**
 * Calculates the vertical center position of a match card
 */
export function getMatchCenterY(
  matchIndex: number,
  baseY: number,
  spacing: number,
  cardHeight: number = 120
): number {
  return baseY + matchIndex * spacing + cardHeight / 2;
}

/**
 * Generates path with right-angle connections (alternative style)
 */
export function generateRightAnglePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): string {
  const midX = (x1 + x2) / 2;

  // Right angle connection with horizontal then vertical then horizontal
  return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
}

/**
 * Calculates responsive spacing based on viewport width
 */
export function getResponsiveSpacing(viewportWidth: number): {
  matchSpacing: number;
  horizontalGap: number;
  cardWidth: number;
} {
  if (viewportWidth < 640) {
    // Mobile
    return {
      matchSpacing: 140,
      horizontalGap: 60,
      cardWidth: 280,
    };
  } else if (viewportWidth < 1024) {
    // Tablet
    return {
      matchSpacing: 160,
      horizontalGap: 80,
      cardWidth: 320,
    };
  } else {
    // Desktop
    return {
      matchSpacing: 180,
      horizontalGap: 100,
      cardWidth: 360,
    };
  }
}
