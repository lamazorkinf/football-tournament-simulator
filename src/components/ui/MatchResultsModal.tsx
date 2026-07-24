import { useEffect } from 'react';
import { X, Trophy, Star } from 'lucide-react';
import { useMatchResultsStore } from '../../store/useMatchResultsStore';
import { penaltiesLabel } from '../../utils/matchLabels';
import { Button } from './Button';
import { TeamFlag } from './TeamFlag';

export function MatchResultsModal() {
  const { isOpen, results, title, close } = useMatchResultsStore();

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
        <div className="p-3 sm:p-6 overflow-y-auto max-h-[calc(90vh-140px)] sm:max-h-[calc(85vh-80px)]">
          <div className="space-y-2 sm:space-y-3">
            {orderedResults.map((result, index) => {
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
                  {(result.groupName || result.isFavorite) && (
                    <div className="flex items-center gap-1.5 text-xs text-grass-soft mb-1 sm:mb-2 font-medium">
                      {result.isFavorite && (
                        <Star className="w-3.5 h-3.5 text-gold fill-gold flex-shrink-0" aria-label="Equipo favorito" />
                      )}
                      {result.groupName}
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
