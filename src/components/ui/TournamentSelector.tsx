import { useState } from 'react';
import { useTournamentStore } from '../../store/useTournamentStore';
import { ChevronDown, Trophy, Plus, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
          Completado
        </span>
      );
    }
    if (tournament.worldCup) {
      return (
        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
          Mundial
        </span>
      );
    }
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
        Clasificatorias
      </span>
    );
  };

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
      >
        <Trophy className="w-4 h-4 text-primary-600" />
        <span className="font-semibold text-gray-900">
          {currentTournament?.year ?? '2026'}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
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
              className="absolute left-0 mt-2 w-full min-w-[280px] bg-white border border-gray-200 rounded-lg shadow-lg z-40 overflow-hidden"
            >
              {/* Header */}
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <h3 className="font-semibold text-gray-900 text-sm">Torneos</h3>
              </div>

              {/* Tournament List */}
              <div className="max-h-64 overflow-y-auto">
                {tournaments.length === 0 ? (
                  <div className="px-4 py-6 text-center text-gray-500 text-sm">
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
                        className={`w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0 ${
                          isSelected ? 'bg-primary-50' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Trophy className={`w-5 h-5 ${isSelected ? 'text-primary-600' : 'text-gray-400'}`} />
                          <div className="text-left">
                            <div className="font-semibold text-gray-900">
                              {tournament.year}
                            </div>
                            <div className="text-xs text-gray-500">
                              {tournament.name}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {getStatusBadge(tournament)}
                          {isSelected && (
                            <Check className="w-4 h-4 text-primary-600" />
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Create New Button */}
              <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => {
                    setShowNewModal(true);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Nuevo Torneo
                </button>
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
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-lg shadow-xl z-50 p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <Trophy className="w-6 h-6 text-primary-600" />
                <h3 className="text-xl font-bold text-gray-900">
                  Nuevo Torneo
                </h3>
              </div>

              <p className="text-gray-600 mb-4 text-sm">
                Ingresa el año del nuevo torneo mundial:
              </p>

              <input
                type="number"
                value={newYear}
                onChange={(e) => setNewYear(e.target.value)}
                placeholder="Ej: 2030"
                min="2000"
                max="2100"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none mb-4"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateNew();
                  if (e.key === 'Escape') setShowNewModal(false);
                }}
              />

              <div className="flex gap-2">
                <button
                  onClick={() => setShowNewModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium text-gray-700"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateNew}
                  disabled={!newYear}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Crear
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
