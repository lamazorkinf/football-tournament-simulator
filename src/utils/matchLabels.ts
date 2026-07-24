/** Rótulos de resultado compartidos por los avisos de partido jugado. */

export interface PenaltiesScore {
  homeScore: number;
  awayScore: number;
}

export interface MatchScore {
  homeScore: number;
  awayScore: number;
  penalties?: PenaltiesScore | null;
}

/** Rótulo del desempate por penales; null si el partido no fue a penales. */
export function penaltiesLabel(penalties?: PenaltiesScore | null): string | null {
  return penalties ? `Penales ${penalties.homeScore} - ${penalties.awayScore}` : null;
}

/** Línea de resultado de un partido, con los penales si los hubo. */
export function matchResultToastText(
  homeName: string,
  awayName: string,
  score: MatchScore,
): string {
  const base = `${homeName} ${score.homeScore} - ${score.awayScore} ${awayName}`;
  const penales = penaltiesLabel(score.penalties);
  return penales ? `${base} · ${penales}` : base;
}
