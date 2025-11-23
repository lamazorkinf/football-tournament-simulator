import { X, Trophy } from 'lucide-react';
import { useMatchResultsStore } from '../../store/useMatchResultsStore';

export function MatchResultsModal() {
  const { isOpen, results, title, close } = useMatchResultsStore();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] sm:max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-3 sm:px-6 py-3 sm:py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <Trophy className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" />
            <h2 className="text-base sm:text-xl font-bold truncate">{title}</h2>
          </div>
          <button
            onClick={close}
            className="p-1 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0 ml-2"
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
                  className="bg-gray-50 rounded-lg p-2 sm:p-4 border border-gray-200 hover:border-primary-300 transition-colors"
                >
                  {result.groupName && (
                    <div className="text-xs text-gray-500 mb-1 sm:mb-2 font-medium">
                      {result.groupName}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-1 sm:gap-0">
                    {/* Home Team */}
                    <div className={`flex-1 text-right text-xs sm:text-base ${homeWon ? 'font-bold text-primary-700' : draw ? 'font-semibold' : 'text-gray-600'} pr-1 sm:pr-2 truncate`}>
                      {result.homeTeam}
                    </div>

                    {/* Score */}
                    <div className="px-2 sm:px-6 py-1 sm:py-2 mx-1 sm:mx-4 bg-white rounded-lg border-2 border-gray-300 min-w-[70px] sm:min-w-[100px] flex-shrink-0">
                      <div className="text-center font-bold text-base sm:text-xl text-gray-900">
                        <span className={homeWon ? 'text-primary-600' : ''}>{result.homeScore}</span>
                        <span className="mx-1 sm:mx-2 text-gray-400">-</span>
                        <span className={awayWon ? 'text-primary-600' : ''}>{result.awayScore}</span>
                      </div>
                    </div>

                    {/* Away Team */}
                    <div className={`flex-1 text-left text-xs sm:text-base ${awayWon ? 'font-bold text-primary-700' : draw ? 'font-semibold' : 'text-gray-600'} pl-1 sm:pl-2 truncate`}>
                      {result.awayTeam}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-200">
            <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
              <div>
                <div className="text-xl sm:text-2xl font-bold text-gray-900">{results.length}</div>
                <div className="text-[10px] sm:text-xs text-gray-600">Partidos Jugados</div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-primary-600">
                  {results.reduce((sum, r) => sum + r.homeScore + r.awayScore, 0)}
                </div>
                <div className="text-[10px] sm:text-xs text-gray-600">Goles Totales</div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-blue-600">
                  {(results.reduce((sum, r) => sum + r.homeScore + r.awayScore, 0) / Math.max(results.length, 1)).toFixed(1)}
                </div>
                <div className="text-[10px] sm:text-xs text-gray-600">Prom. Goles/Partido</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-3 sm:px-6 py-3 sm:py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
          <button
            onClick={close}
            className="px-4 sm:px-6 py-2 bg-primary-600 text-white rounded-lg text-sm sm:text-base font-medium hover:bg-primary-700 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
