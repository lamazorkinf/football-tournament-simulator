import { useEffect, useMemo, useState } from 'react';
import { X, Trophy, Star, ChevronDown, ChevronRight } from 'lucide-react';
import { useMatchResultsStore } from '../../store/useMatchResultsStore';
import type { MatchResult } from '../../store/useMatchResultsStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { penaltiesLabel } from '../../utils/matchLabels';
import { regionLabel } from '../../utils/regionLabels';
import { Button } from './Button';
import { TeamFlag } from './TeamFlag';
import { deriveHeadlines, type HeadlineMatch, type HeadlineView } from '../../core/headlines';
import { HeadlinesCard } from '../hub/HeadlinesCard';
import { TableMovesCard } from './TableMovesCard';

/**
 * Por encima de esto la lista de resultados arranca plegada. El corte está
 * entre los dos tamaños reales de fecha: una de liga son ~10 partidos y se
 * sigue viendo entera, y una de clasificatorias son ~84 y era un muro.
 */
const RESULTS_COLLAPSE_THRESHOLD = 12;

/**
 * Un resultado sólo produce titular si trae con qué medir la sorpresa. Los
 * productores viejos —o cualquiera que no haya capturado el pool de equipos
 * antes de simular— devuelven `null` y quedan afuera sin romper nada.
 */
function resultToHeadlineMatch(r: MatchResult): HeadlineMatch | null {
  if (!r.homeTeamId || !r.awayTeamId) return null;
  if (r.homeSkillBefore === undefined || r.awaySkillBefore === undefined) return null;
  return {
    homeTeamId: r.homeTeamId,
    awayTeamId: r.awayTeamId,
    homeScore: r.homeScore,
    awayScore: r.awayScore,
    homeSkillBefore: r.homeSkillBefore,
    awaySkillBefore: r.awaySkillBefore,
    wentToExtraTime: r.wentToExtraTime,
    // La etapa no viaja: dentro de una jornada todos los partidos comparten la
    // misma, así que su peso sería un multiplicador constante.
    ...(r.penalties ? { penalties: r.penalties } : {}),
  };
}

export function MatchResultsModal() {
  const { isOpen, results, title, table, close } = useMatchResultsStore();
  const trapRef = useFocusTrap<HTMLDivElement>(isOpen);

  // Cierre con Escape y bloqueo del scroll del body mientras está abierto.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, close]);

  // Estado del plegable derivado de las props, sin efecto: el mismo patrón que
  // `TeamFlag.tsx:50-55`. Un `useEffect` con `setState` dispararía la regla
  // `react-hooks/set-state-in-effect`.
  const [prevResults, setPrevResults] = useState(results);
  const [showList, setShowList] = useState(results.length <= RESULTS_COLLAPSE_THRESHOLD);
  if (results !== prevResults) {
    setPrevResults(results);
    setShowList(results.length <= RESULTS_COLLAPSE_THRESHOLD);
  }

  const headlines = useMemo<HeadlineView[]>(() => {
    const matches = results
      .map(resultToHeadlineMatch)
      .filter((m): m is HeadlineMatch => m !== null);
    // Los partidos de una fecha son SIMULTÁNEOS: no hay más viejo ni más nuevo.
    const derived = deriveHeadlines(matches, { decayByAge: false });
    const nameById = new Map<string, string>();
    for (const r of results) {
      if (r.homeTeamId) nameById.set(r.homeTeamId, r.homeTeam);
      if (r.awayTeamId) nameById.set(r.awayTeamId, r.awayTeam);
    }
    return derived.map((h) => ({
      ...h,
      homeTeamName: nameById.get(h.match.homeTeamId) ?? h.match.homeTeamId,
      awayTeamName: nameById.get(h.match.awayTeamId) ?? h.match.awayTeamId,
    }));
  }, [results]);

  if (!isOpen) return null;

  // Los partidos de equipos favoritos van arriba de todo. `sort` es estable
  // (ES2019+), así que dentro de cada bloque se conserva el orden de la jornada.
  const orderedResults = [...results].sort(
    (a, b) => Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite)),
  );

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-2 sm:p-4"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      ref={trapRef}
      tabIndex={-1}
    >
      <div
        className="bg-grass-dark border-4 border-line shadow-hard-panel max-w-3xl w-full max-h-[90vh] sm:max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b-4 border-grass px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <Trophy className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 text-gold" />
            <h2 className="font-arcade text-xs text-gold uppercase truncate">{title}</h2>
          </div>
          <button
            onClick={close}
            className="p-1 text-grass-soft hover:bg-grass/40 transition-colors flex-shrink-0 ml-2"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Results */}
        <div className="p-3 sm:p-6 overflow-y-auto max-h-[calc(90vh-140px)] sm:max-h-[calc(85vh-80px)] space-y-4">
          <HeadlinesCard headlines={headlines} />

          {table && <TableMovesCard table={table} />}

          <button
            onClick={() => setShowList((open) => !open)}
            aria-expanded={showList}
            className="w-full flex items-center gap-2 font-arcade text-[10px] text-grass-soft uppercase hover:text-white transition-colors"
          >
            {/* Iconos y no '▾'/'▸': Press Start 2P no trae esos glifos y caen
                al fallback monoespaciado, con otra métrica, al lado de texto
                arcade. */}
            {showList ? (
              <ChevronDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            )}
            {results.length === 1 ? 'El resultado' : `Los ${results.length} resultados`}
          </button>

          {showList && (
          <div className="space-y-2 sm:space-y-3">
            {orderedResults.map((result, index) => {
              // La etapa ya está en el título del resumen (una jornada es de
              // una sola fase); lo que cambia partido a partido es dónde se
              // juega: "Europa · R64", "América · Grupo C".
              const context = [
                result.region ? regionLabel(result.region) : null,
                result.groupName,
              ]
                .filter(Boolean)
                .join(' · ');

              // Un partido que fue a penales no termina empatado: el ganador es
              // el que ganó desde el punto, aunque el marcador diga 1-1.
              const penales = penaltiesLabel(result.penalties);
              const homeWon = result.penalties
                ? result.penalties.homeScore > result.penalties.awayScore
                : result.homeScore > result.awayScore;
              const awayWon = result.penalties
                ? result.penalties.awayScore > result.penalties.homeScore
                : result.awayScore > result.homeScore;
              const draw = !homeWon && !awayWon;

              return (
                <div
                  key={index}
                  data-testid="match-result"
                  className={`bg-night border-2 p-2 sm:p-4 transition-colors ${
                    result.isFavorite ? 'border-gold' : 'border-grass hover:border-line'
                  }`}
                >
                  {(context || result.isFavorite) && (
                    <div className="flex items-center gap-1.5 text-xs text-grass-soft mb-1 sm:mb-2 font-medium">
                      {result.isFavorite && (
                        <Star className="w-3.5 h-3.5 text-gold fill-gold flex-shrink-0" aria-label="Equipo favorito" />
                      )}
                      {context}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-1 sm:gap-0">
                    {/* Home Team */}
                    <div className="flex flex-1 items-center justify-end gap-2 min-w-0 pr-1 sm:pr-2">
                      {result.homeTeamId && (
                        <TeamFlag
                          teamId={result.homeTeamId}
                          teamName={result.homeTeam}
                          size={24}
                          className="flex-shrink-0"
                        />
                      )}
                      <span className={`text-xs sm:text-base truncate ${homeWon ? 'font-bold text-led' : draw ? 'font-semibold text-white' : 'text-grass-soft'}`}>
                        {result.homeTeam}
                      </span>
                    </div>

                    {/* Score */}
                    <div className="px-2 sm:px-6 py-1 sm:py-2 mx-1 sm:mx-4 bg-black border-2 border-line min-w-[70px] sm:min-w-[100px] flex-shrink-0">
                      <div className="text-center font-terminal text-base sm:text-xl tabular-nums">
                        <span className={homeWon ? 'text-led' : 'text-white'}>{result.homeScore}</span>
                        <span className="mx-1 sm:mx-2 text-grass-soft">-</span>
                        <span className={awayWon ? 'text-led' : 'text-white'}>{result.awayScore}</span>
                      </div>
                    </div>

                    {/* Away Team */}
                    <div className="flex flex-1 items-center justify-start gap-2 min-w-0 pl-1 sm:pl-2">
                      <span className={`text-xs sm:text-base truncate ${awayWon ? 'font-bold text-led' : draw ? 'font-semibold text-white' : 'text-grass-soft'}`}>
                        {result.awayTeam}
                      </span>
                      {result.awayTeamId && (
                        <TeamFlag
                          teamId={result.awayTeamId}
                          teamName={result.awayTeam}
                          size={24}
                          className="flex-shrink-0"
                        />
                      )}
                    </div>
                  </div>

                  {penales && (
                    <div className="mt-1 sm:mt-2 text-center font-arcade text-[10px] text-gold uppercase">
                      {penales}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )}

          {/* Summary */}
          <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t-2 border-grass">
            <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
              <div>
                <div className="text-xl sm:text-2xl font-terminal text-led tabular-nums">{results.length}</div>
                <div className="text-[10px] sm:text-xs text-grass-soft">Partidos Jugados</div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-terminal text-led tabular-nums">
                  {results.reduce((sum, r) => sum + r.homeScore + r.awayScore, 0)}
                </div>
                <div className="text-[10px] sm:text-xs text-grass-soft">Goles Totales</div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-terminal text-led tabular-nums">
                  {(results.reduce((sum, r) => sum + r.homeScore + r.awayScore, 0) / Math.max(results.length, 1)).toFixed(1)}
                </div>
                <div className="text-[10px] sm:text-xs text-grass-soft">Prom. Goles/Partido</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-3 sm:px-6 py-3 sm:py-4 border-t-4 border-grass flex justify-end">
          <Button onClick={close}>Cerrar</Button>
        </div>
      </div>
    </div>
  );
}
