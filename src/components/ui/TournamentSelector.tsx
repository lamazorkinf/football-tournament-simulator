import { useState } from 'react';
import { useTournamentStore } from '../../store/useTournamentStore';
import { ChevronDown, Trophy, Plus, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './Button';

export function TournamentSelector() {
  const {
    tournaments,
    currentTournamentId,
    selectTournament,
    createNewTournament,
  } = useTournamentStore();

  const [isOpen, setIsOpen] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newYear, setNewYear] = useState('');

  const currentTournament = tournaments.find(t => t.id === currentTournamentId);

  const handleCreateNew = async () => {
    const year = parseInt(newYear, 10);
    if (isNaN(year) || year < 2000 || year > 2100) {
      alert('Por favor ingresa un año válido (2000-2100)');
      return;
    }

    // Check if tournament with this year already exists
    if (tournaments.some(t => t.year === year)) {
      alert(`Ya existe un torneo para el año ${year}`);
      return;
    }

    await createNewTournament(year);
    setShowNewModal(false);
    setNewYear('');
    setIsOpen(false);
  };

  const getStatusBadge = (tournament: typeof tournaments[0]) => {
    if (tournament.worldCup?.champion) {
      return (
        <span className="text-xs px-2 py-0.5 bg-black/40 text-led border border-line">
          Completado
        </span>
      );
    }
    if (tournament.worldCup) {
      return (
        <span className="text-xs px-2 py-0.5 bg-black/40 text-gold border border-gold">
          Mundial
        </span>
      );
    }
    return (
      <span className="text-xs px-2 py-0.5 bg-black/40 text-grass-soft border border-grass">
        Clasificatorias
      </span>
    );
  };

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-grass-dark border-2 border-line hover:bg-grass/40 transition-colors"
      >
        <Trophy className="w-4 h-4 text-gold" />
        <span className="font-semibold">
          {currentTournament?.year ?? '2026'}
        </span>
        <ChevronDown className={`w-4 h-4 text-grass-soft transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-30"
              onClick={() => setIsOpen(false)}
            />

            {/* Dropdown Menu */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 max-lg:left-auto max-lg:right-0 mt-2 w-full min-w-[280px] max-w-[calc(100vw-1rem)] bg-grass-dark border-2 border-line shadow-hard-panel z-40 overflow-hidden"
            >
              {/* Header */}
              <div className="px-4 py-3 border-b-2 border-grass bg-night">
                <h3 className="font-arcade text-[10px] text-white text-shadow-retro uppercase">Torneos</h3>
              </div>

              {/* Tournament List */}
              <div className="max-h-64 overflow-y-auto">
                {tournaments.length === 0 ? (
                  <div className="px-4 py-6 text-center text-grass-soft text-sm">
                    No hay torneos disponibles
                  </div>
                ) : (
                  tournaments.map((tournament) => {
                    const isSelected = tournament.id === currentTournamentId;
                    return (
                      <button
                        key={tournament.id}
                        onClick={() => {
                          selectTournament(tournament.id);
                          setIsOpen(false);
                        }}
                        className={`w-full px-4 py-3 flex items-center justify-between hover:bg-grass/40 transition-colors border-b-2 border-grass last:border-b-0 ${
                          isSelected ? 'bg-grass/30' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Trophy className={`w-5 h-5 ${isSelected ? 'text-gold' : 'text-grass-soft'}`} />
                          <div className="text-left">
                            <div className="font-semibold">
                              {tournament.year}
                            </div>
                            <div className="text-xs text-grass-soft">
                              {tournament.name}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {getStatusBadge(tournament)}
                          {isSelected && (
                            <Check className="w-4 h-4 text-gold" />
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Create New Button */}
              <div className="px-4 py-3 border-t-2 border-grass bg-night">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setShowNewModal(true);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Nuevo Torneo
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* New Tournament Modal */}
      <AnimatePresence>
        {showNewModal && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => setShowNewModal(false)}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-grass-dark border-2 border-line shadow-hard-panel z-50 p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <Trophy className="w-6 h-6 text-gold" />
                <h3 className="font-arcade text-sm text-white text-shadow-retro">
                  Nuevo Torneo
                </h3>
              </div>

              <p className="text-grass-soft mb-4 text-sm">
                Ingresa el año del nuevo torneo mundial:
              </p>

              <input
                type="number"
                value={newYear}
                onChange={(e) => setNewYear(e.target.value)}
                placeholder="Ej: 2030"
                min="2000"
                max="2100"
                className="w-full px-4 py-2 bg-night border-2 border-grass text-white placeholder:text-grass-soft focus:ring-2 focus:ring-gold focus:border-transparent outline-none mb-4"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateNew();
                  if (e.key === 'Escape') setShowNewModal(false);
                }}
              />

              <div className="flex gap-2">
                <button
                  onClick={() => setShowNewModal(false)}
                  className="flex-1 px-4 py-2 border-2 border-line text-led hover:bg-grass/40 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleCreateNew}
                  disabled={!newYear}
                  className="flex-1"
                >
                  Crear
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
