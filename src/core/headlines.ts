import type { MatchHistoryStage } from './formats/rounds';

/**
 * TITULARES — la cuarta derivación pura del proyecto, hermana de `modes/nav.ts`
 * (qué se navega), `modes/nextAction.ts` (qué se hace) y `modes/hubHeader.ts`
 * (en qué anda el modo). Contesta la que faltaba: qué pasó.
 *
 * Sin React, sin stores y sin Supabase, por la misma razón que las otras tres:
 * quien la llama le pasa los partidos ya leídos, y esto se testea con objetos
 * literales.
 *
 * LA SEÑAL. El motor calcula `skillChange = K · importancia · (resultado −
 * esperado)`: la sorpresa ya está medida. Pero `K` y la importancia NO están
 * guardados en la fila de `match_history`, así que acá la sorpresa se
 * reconstruye desde `skillBefore` de los dos lados. Ventaja: recalibrar el
 * motor no reescribe el pasado.
 */

export type HeadlineKind = 'upset' | 'rout' | 'decider' | 'hold' | 'streak';

/**
 * Forma neutra de un partido, a propósito: se construye tanto desde una fila de
 * `match_history` como desde un resultado recién simulado en memoria. Por eso
 * NO es un alias de `MatchHistoryEntry`.
 */
export interface HeadlineMatch {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  homeSkillBefore: number;
  awaySkillBefore: number;
  /**
   * Etapa del partido. OPCIONAL a propósito: lo único que hace es pesar el
   * puntaje vía `STAGE_WEIGHT`, y dentro de una jornada todos los partidos
   * comparten etapa — con lo cual el peso es un multiplicador constante,
   * incapaz de cambiar el orden. El resumen de fecha no la transporta; el Hub
   * sí, porque ahí los partidos vienen de `match_history` y comparar entre
   * etapas importa.
   */
  stage?: MatchHistoryStage;
  wentToExtraTime?: boolean;
  /**
   * Sólo el ciclo mundialista la estampa (`useTournamentStore.ts:2540`); el modo
   * de temporada guarda `wentToExtraTime` pero no la tanda. Su ausencia degrada
   * el titular a ALARGUE, que sigue siendo cierto.
   */
  penalties?: { homeScore: number; awayScore: number };
  /**
   * Los skills previos de esta fila NO se midieron: se fabricaron al
   * reconstruirla. `collectPlayedCycleMatches` rellena `skillBefore` con el
   * skill de HOY porque el partido original nunca llegó a guardarse, así que la
   * brecha que sale de esas columnas es ficción — Bolivia le ganó a Brasil
   * cuando ambos estaban en 70 y la fila reconstruida dice 55 contra 90.
   *
   * Por eso BATACAZO y AGUANTE, los dos titulares que leen la brecha, no se
   * emiten. GOLEADA y PENALES/ALARGUE sí: la diferencia de gol y la forma de
   * definición son datos reales aun en una fila reconstruida.
   */
  skillsReconstructed?: boolean;
}

export interface Headline {
  kind: HeadlineKind;
  /**
   * Etiqueta corta, para `font-arcade`. SIN acentos: Press Start 2P no tiene
   * glifos para las mayúsculas acentuadas y se rinden como cuadrados.
   */
  label: string;
  /** Renglón explicativo, en prosa y con acentos. Sin nombres de equipo: ya están arriba. */
  detail: string;
  /** El partido que ilustra el titular. */
  match: HeadlineMatch;
  /** De quién habla el titular, cuando aplica. Una definición por penales no tiene sujeto. */
  subjectTeamId?: string;
  /** Puntaje final, con peso de etapa y decaimiento. Expuesto para poder testear el orden. */
  score: number;
}

/** Cuántos titulares entran en la portada del Hub. */
export const HEADLINES_LIMIT = 3;

/** Por debajo de esto no vale la pena contarlo. */
const MIN_SCORE = 0.1;
/** Cuánto pierde un titular por cada partido de antigüedad. A los 80, conserva ~0.30. */
const DECAY = 0.985;
/** Brecha de skill que satura la notabilidad de un batacazo. */
const GAP_FULL = 40;
const UPSET_MIN_GAP = 6;
const HOLD_MIN_GAP = 12;
const ROUT_MIN_DIFF = 4;
/** Victorias consecutivas a partir de las cuales una racha es noticia. */
const STREAK_MIN = 4;

/**
 * Un batacazo en una eliminación directa vale más que en una fecha de liga.
 * `continental` se queda neutro porque cubre rondas tempranas y tardías con el
 * mismo `stage` en la tabla: la fila no alcanza para distinguirlas.
 */
const STAGE_WEIGHT: Record<MatchHistoryStage, number> = {
  'world-cup-knockout': 1.3,
  'confed-knockout': 1.1,
  cup: 1.1,
  'world-cup-group': 1.0,
  continental: 1.0,
  league: 1.0,
  qualifier: 0.9,
  'confed-group': 0.9,
};

/** Un titular candidato, antes de aplicar peso de etapa y decaimiento. */
interface Candidate {
  kind: HeadlineKind;
  label: string;
  detail: string;
  subjectTeamId?: string;
  /** Notabilidad en 0..1, comparable entre tipos. */
  base: number;
}

/** Titular con su antigüedad, que se necesita para desempatar y se descarta después. */
interface Ranked {
  headline: Headline;
  index: number;
}

/**
 * Todos los titulares que un partido podría producir. El orden de esta lista es
 * el desempate cuando dos tipos empatan en notabilidad.
 */
function candidatesFor(m: HeadlineMatch): Candidate[] {
  const out: Candidate[] = [];
  const gap = Math.abs(m.homeSkillBefore - m.awaySkillBefore);
  const diff = Math.abs(m.homeScore - m.awayScore);
  const draw = m.homeScore === m.awayScore;
  const homeWon = m.homeScore > m.awayScore;
  const winnerId = homeWon ? m.homeTeamId : m.awayTeamId;
  /** Ver `skillsReconstructed`: en una fila reconstruida la brecha no mide nada. */
  const gapIsReal = !m.skillsReconstructed;

  if (!draw && gapIsReal && gap >= UPSET_MIN_GAP) {
    const winnerSkill = homeWon ? m.homeSkillBefore : m.awaySkillBefore;
    const loserSkill = homeWon ? m.awaySkillBefore : m.homeSkillBefore;
    if (winnerSkill < loserSkill) {
      out.push({
        kind: 'upset',
        label: 'BATACAZO',
        detail: `le ganó a un rival ${Math.round(gap)} puntos mejor`,
        subjectTeamId: winnerId,
        base: Math.min(gap / GAP_FULL, 1),
      });
    }
  }

  if (diff >= ROUT_MIN_DIFF) {
    out.push({
      kind: 'rout',
      label: 'GOLEADA',
      detail: `${diff} goles de diferencia`,
      subjectTeamId: winnerId,
      base: Math.min((diff - 3) / 4, 1),
    });
  }

  if (m.penalties) {
    out.push({
      kind: 'decider',
      label: 'PENALES',
      detail: 'se definió por penales',
      base: 0.7,
    });
  } else if (m.wentToExtraTime) {
    out.push({
      kind: 'decider',
      label: 'ALARGUE',
      detail: 'se resolvió en el alargue',
      base: 0.5,
    });
  }

  // `!m.penalties`: en una eliminación directa definida por penales el marcador
  // queda empatado, pero nadie empató. Sin este guard el AGUANTE corona al que
  // erró la tanda y quedó eliminado, y encima con el puntaje más alto de la
  // portada (la base de `hold` le gana a la de `decider` desde brecha 35).
  if (draw && gapIsReal && !m.penalties && gap >= HOLD_MIN_GAP) {
    out.push({
      kind: 'hold',
      label: 'AGUANTE',
      detail: `empató contra un rival ${Math.round(gap)} puntos mejor`,
      subjectTeamId:
        m.homeSkillBefore < m.awaySkillBefore ? m.homeTeamId : m.awayTeamId,
      // Deliberadamente por debajo de un batacazo de la misma brecha:
      // empatarle al grande es menos que ganarle.
      base: Math.min(gap / GAP_FULL, 1) * 0.8,
    });
  }

  return out;
}

/** El de mayor notabilidad. Empate ⇒ el primero declarado en `candidatesFor`. */
function pickBest(candidates: Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  for (const candidate of candidates) {
    if (!best || candidate.base > best.base) best = candidate;
  }
  return best;
}

function rank(
  candidate: Candidate,
  m: HeadlineMatch,
  index: number,
  decayByAge: boolean,
): Ranked {
  return {
    index,
    headline: {
      kind: candidate.kind,
      label: candidate.label,
      detail: candidate.detail,
      subjectTeamId: candidate.subjectTeamId,
      match: m,
      score:
        candidate.base *
        (m.stage ? STAGE_WEIGHT[m.stage] : 1) *
        (decayByAge ? DECAY ** index : 1),
    },
  };
}

/** Lo que se sabe de un equipo mientras se recorre la ventana hacia atrás. */
interface TeamRun {
  wins: number;
  /** Ya se vio el partido que cortó la racha: recién ahí el número es confiable. */
  bounded: boolean;
  /** Antigüedad del partido más reciente de la racha. */
  index: number;
  match: HeadlineMatch;
}

/**
 * Rachas vigentes, contadas hacia atrás desde el partido más reciente de cada
 * equipo. Sólo se emiten las ACOTADAS: si todos los partidos del equipo en la
 * ventana son victorias, la racha puede ser más larga de lo que se ve y decir el
 * número visible sería subestimar. Se prefiere callar.
 */
function streakCandidates(matches: HeadlineMatch[], decayByAge: boolean): Ranked[] {
  const runs = new Map<string, TeamRun>();

  const note = (teamId: string, won: boolean, m: HeadlineMatch, index: number) => {
    const run = runs.get(teamId);
    if (run?.bounded) return; // ya se cerró: lo de más atrás no cambia nada
    if (!won) {
      runs.set(teamId, run
        ? { ...run, bounded: true }
        : { wins: 0, bounded: true, index, match: m });
      return;
    }
    if (run) runs.set(teamId, { ...run, wins: run.wins + 1 });
    else runs.set(teamId, { wins: 1, bounded: false, index, match: m });
  };

  matches.forEach((m, index) => {
    note(m.homeTeamId, m.homeScore > m.awayScore, m, index);
    note(m.awayTeamId, m.awayScore > m.homeScore, m, index);
  });

  const out: Ranked[] = [];
  for (const [teamId, run] of runs) {
    if (!run.bounded || run.wins < STREAK_MIN) continue;
    out.push(
      rank(
        {
          kind: 'streak',
          label: 'RACHA',
          detail: `${run.wins} victorias al hilo`,
          subjectTeamId: teamId,
          base: Math.min((run.wins - 3) / 5, 1),
        },
        run.match,
        run.index,
        decayByAge,
      ),
    );
  }
  return out;
}

export interface DeriveHeadlinesOptions {
  /** Cuántos titulares devolver. */
  limit?: number;
  /**
   * Penalizar cada titular según su posición en el array, que en el Hub es su
   * antigüedad. `false` para una jornada: sus partidos son simultáneos, no hay
   * más viejo ni más nuevo, y castigar por posición sería arbitrario.
   */
  decayByAge?: boolean;
}

/**
 * @param matches En el Hub, ordenados del más nuevo al más viejo — el orden que
 *   devuelve `getMatchesPage`, donde el índice de cada partido ES su antigüedad.
 *   En un resumen de fecha el orden no significa nada: para eso está
 *   `decayByAge: false`.
 */
export function deriveHeadlines(
  matches: HeadlineMatch[],
  options: DeriveHeadlinesOptions = {},
): Headline[] {
  const { limit = HEADLINES_LIMIT, decayByAge = true } = options;
  const ranked: Ranked[] = [];
  matches.forEach((m, index) => {
    const best = pickBest(candidatesFor(m));
    if (best) ranked.push(rank(best, m, index, decayByAge));
  });
  // Las rachas son por equipo, no por partido, así que se calculan aparte y
  // compiten en la misma tabla. La regla de "un equipo no aparece dos veces" es
  // la que evita "BATACAZO: Ben Hur" + "RACHA: Ben Hur, 6 al hilo".
  ranked.push(...streakCandidates(matches, decayByAge));

  const ordered = ranked
    .filter((r) => r.headline.score >= MIN_SCORE)
    .sort(
      (a, b) =>
        b.headline.score - a.headline.score ||
        a.index - b.index ||
        // Último desempate para que el orden sea determinista y los tests no
        // dependan del orden de iteración.
        a.headline.match.homeTeamId.localeCompare(b.headline.match.homeTeamId),
    );

  // Un equipo no aparece dos veces en la portada: sin esta regla, un equipo con
  // una buena fecha se lleva los tres lugares.
  const used = new Set<string>();
  const out: Headline[] = [];
  for (const { headline } of ordered) {
    if (out.length === limit) break;
    const { homeTeamId, awayTeamId } = headline.match;
    if (used.has(homeTeamId) || used.has(awayTeamId)) continue;
    used.add(homeTeamId);
    used.add(awayTeamId);
    out.push(headline);
  }
  return out;
}

/**
 * Un titular listo para dibujar. La derivación habla de ids; los nombres los
 * resuelve quien tiene el pool de equipos a mano. Vive acá y no en el hook que
 * lo produjo primero porque tiene dos consumidores —la portada del Hub y el
 * resumen de fecha— y un componente no debería importar un tipo desde un hook
 * de datos que no usa.
 */
export interface HeadlineView extends Headline {
  homeTeamName: string;
  awayTeamName: string;
}
