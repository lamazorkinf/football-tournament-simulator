/** Rótulos de resultado compartidos por los avisos de partido jugado. */

export interface PenaltiesScore {
  homeScore: number;
  awayScore: number;
}

/** Rótulo del desempate por penales; null si el partido no fue a penales. */
export function penaltiesLabel(penalties?: PenaltiesScore | null): string | null {
  return penalties ? `Penales ${penalties.homeScore} - ${penalties.awayScore}` : null;
}
