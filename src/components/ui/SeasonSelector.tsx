import { useState } from 'react';
import { useSeasonModeStore } from '../../store/useSeasonModeStore';
import { ChevronDown, Calendar, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Elegir temporada en un modo de temporada — el equivalente del
 * `TournamentSelector` del ciclo mundialista.
 *
 * La diferencia con el ciclo es que acá las temporadas no se crean a mano: cada
 * una nace al cerrar la anterior. Por eso no hay botón de "nueva", y por eso
 * sólo el año en curso se puede jugar: las viejas se miran.
 */
export function SeasonSelector() {
  const year = useSeasonModeStore((s) => s.year);
  const currentYear = useSeasonModeStore((s) => s.currentYear);
  const availableYears = useSeasonModeStore((s) => s.availableYears);
  const selectYear = useSeasonModeStore((s) => s.selectYear);

  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex items-center gap-2 px-4 py-2 bg-grass-dark border-2 border-line hover:bg-grass/40 transition-colors"
      >
        <Calendar className="w-4 h-4 text-gold" />
        <span className="font-semibold">{year ?? '—'}</span>
        <ChevronDown
          className={`w-4 h-4 text-grass-soft transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />

            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              role="listbox"
              className="absolute left-0 max-lg:left-auto max-lg:right-0 mt-2 w-full min-w-[280px] max-w-[calc(100vw-1rem)] bg-grass-dark border-2 border-line shadow-hard-panel z-40 overflow-hidden"
            >
              <div className="px-4 py-3 border-b-2 border-grass bg-night">
                <h3 className="font-arcade text-[10px] text-white text-shadow-retro uppercase">
                  Temporadas
                </h3>
              </div>

              <div className="max-h-64 overflow-y-auto">
                {availableYears.length === 0 ? (
                  <div className="px-4 py-6 text-center text-grass-soft text-sm">
                    No hay temporadas disponibles
                  </div>
                ) : (
                  availableYears.map((y) => {
                    const isSelected = y === year;
                    const isCurrent = y === currentYear;
                    return (
                      <button
                        key={y}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          selectYear(y);
                          setIsOpen(false);
                        }}
                        className={`w-full px-4 py-3 flex items-center justify-between hover:bg-grass/40 transition-colors border-b-2 border-grass last:border-b-0 ${
                          isSelected ? 'bg-grass/30' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Calendar
                            className={`w-5 h-5 ${isSelected ? 'text-gold' : 'text-grass-soft'}`}
                          />
                          <div className="text-left">
                            <div className="font-semibold">{y}</div>
                            <div className="text-xs text-grass-soft">
                              {isCurrent ? 'Se está jugando' : 'Sólo lectura'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isCurrent ? (
                            <span className="text-xs px-2 py-0.5 bg-black/40 text-gold border border-gold">
                              En curso
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 bg-black/40 text-led border border-line">
                              Cerrada
                            </span>
                          )}
                          {isSelected && <Check className="w-4 h-4 text-gold" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
