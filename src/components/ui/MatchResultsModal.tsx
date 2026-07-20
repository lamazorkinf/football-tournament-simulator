import { X, Trophy } from 'lucide-react';
import { useMatchResultsStore } from '../../store/useMatchResultsStore';
import { Button } from './Button';

export function MatchResultsModal() {
  const { isOpen, results, title, close } = useMatchResultsStore();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-grass-dark border-4 border-line shadow-hard-panel max-w-3xl w-full max-h-[90vh] sm:max-h-[85vh] overflow-hidden">
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
            {results.map((result, index) => {
              const homeWon = result.homeScore > result.awayScore;
              const awayWon = result.awayScore > result.homeScore;
              const draw = result.homeScore === result.awayScore;

              return (
                <div
                  key={index}
                  className="bg-night border-2 border-grass p-2 sm:p-4 hover:border-line transition-colors"
                >
                  {result.groupName && (
                    <div className="text-xs text-grass-soft mb-1 sm:mb-2 font-medium">
                      {result.groupName}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-1 sm:gap-0">
                    {/* Home Team */}
                    <div className={`flex-1 text-right text-xs sm:text-base ${homeWon ? 'font-bold text-led' : draw ? 'font-semibold text-white' : 'text-grass-soft'} pr-1 sm:pr-2 truncate`}>
                      {result.homeTeam}
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
                    <div className={`flex-1 text-left text-xs sm:text-base ${awayWon ? 'font-bold text-led' : draw ? 'font-semibold text-white' : 'text-grass-soft'} pl-1 sm:pl-2 truncate`}>
                      {result.awayTeam}
                    </div>
                  </div>
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
