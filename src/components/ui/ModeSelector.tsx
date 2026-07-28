import { useState } from 'react';
import { ChevronDown, Check, Globe2, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useModeStore } from '../../store/useModeStore';
import { useTournamentStore } from '../../store/useTournamentStore';
import { useSeasonModeStore } from '../../store/useSeasonModeStore';
import type { ModeKind } from '../../types';

function kindIcon(kind: ModeKind) {
  return kind === 'national-cycle' ? Globe2 : Shield;
}

function kindLabel(kind: ModeKind): string {
  return kind === 'national-cycle' ? 'Selecciones' : 'Liga / Copa';
}

/**
 * Selector del modo activo (competición). Cambiar de modo cambia el pool de
 * equipos y los torneos que ve toda la app: por eso al elegir uno se recargan
 * equipos y se reinicializa el torneo del modo. Los modos no se mezclan.
 */
export function ModeSelector() {
  const modes = useModeStore((s) => s.modes);
  const activeModeId = useModeStore((s) => s.activeModeId);
  const selectMode = useModeStore((s) => s.selectMode);

  const [isOpen, setIsOpen] = useState(false);

  const activeMode = modes.find((m) => m.id === activeModeId) ?? null;

  // Hasta que carga la lista de modos no mostramos el selector (evita parpadeos
  // y un dropdown vacío en el primer render).
  if (modes.length === 0) return null;

  const handleSelect = async (id: string) => {
    setIsOpen(false);
    if (id === activeModeId) return;
    selectMode(id);

    const store = useTournamentStore.getState();
    const isNational = useModeStore.getState().activeModeKind() === 'national-cycle';
    // Resetear el store de la liga siempre (evita arrastrar datos del modo previo).
    useSeasonModeStore.getState().reset();

    if (isNational) {
      await store.loadTeamsFromDatabase();
      await store.initializeTournament();
    } else {
      // Modo de ligas: no hay Cycle. Limpiar el estado del Mundial de una (así la
      // vista cambia al toque) y cargar el plantel del modo; la temporada la
      // carga SeasonModeView. No se pasa por initializeTournament, que es del ciclo.
      useTournamentStore.setState({
        currentTournament: null,
        currentTournamentId: null,
        tournaments: [],
        initStatus: 'ready',
      });
      await store.loadTeamsFromDatabase();
    }
  };

  const ActiveIcon = activeMode ? kindIcon(activeMode.kind) : Globe2;

  return (
    <div className="relative">
      <span className="block text-[10px] font-arcade uppercase text-grass-soft mb-1">
        Modo
      </span>
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-grass-dark border-2 border-line text-white hover:bg-grass/40 transition-colors"
      >
        <ActiveIcon className="w-4 h-4 text-gold flex-shrink-0" />
        <span className="flex-1 text-left truncate font-terminal text-sm">
          {activeMode?.name ?? 'Elegí un modo'}
        </span>
        <ChevronDown
          className={`w-4 h-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setIsOpen(false)} />
            <motion.ul
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute left-0 right-0 mt-1 z-30 bg-grass-dark border-2 border-line shadow-hard-panel max-h-72 overflow-auto"
            >
              {modes.map((mode) => {
                const Icon = kindIcon(mode.kind);
                const isActive = mode.id === activeModeId;
                return (
                  <li key={mode.id}>
                    <button
                      onClick={() => handleSelect(mode.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-grass/40 transition-colors ${
                        isActive ? 'bg-black/40' : ''
                      }`}
                    >
                      <Icon className="w-4 h-4 text-gold flex-shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block font-terminal text-sm text-white truncate">
                          {mode.name}
                        </span>
                        <span className="block text-[10px] text-grass-soft truncate">
                          {kindLabel(mode.kind)}
                        </span>
                      </span>
                      {isActive && <Check className="w-4 h-4 text-led flex-shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </motion.ul>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
