import { BarChart3, GitCompare, Medal, History, Archive, Settings } from 'lucide-react';
import { TournamentSelector } from './TournamentSelector';

type View = 'wizard' | 'qualifiers' | 'worldcup' | 'stats' | 'settings' | 'history' | 'matches' | 'comparison' | 'tournaments' | 'champions';

const MENU_ITEMS = [
  { id: 'stats' as View, icon: BarChart3, label: 'Statistics' },
  { id: 'comparison' as View, icon: GitCompare, label: 'Comparar' },
  { id: 'champions' as View, icon: Medal, label: 'Campeones' },
  { id: 'history' as View, icon: History, label: 'History' },
  { id: 'tournaments' as View, icon: Archive, label: 'Torneos' },
  { id: 'settings' as View, icon: Settings, label: 'Configuración' },
];

interface PauseMenuProps {
  isOpen: boolean;
  onClose: () => void;
  currentView: View;
  onViewChange: (view: View) => void;
}

export function PauseMenu({ isOpen, onClose, currentView, onViewChange }: PauseMenuProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Menú de pausa"
      className="fixed inset-0 z-50 lg:hidden bg-night/95 pause-in flex flex-col px-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
    >
      <h2 className="font-arcade text-lg text-gold text-shadow-retro text-center mb-6">⏸ PAUSE</h2>

      <div className="mb-6">
        <TournamentSelector />
      </div>

      <nav className="flex-1 overflow-y-auto space-y-2">
        {MENU_ITEMS.map(({ id, icon: Icon, label }) => {
          const active = currentView === id;
          return (
            <button
              key={id}
              onClick={() => {
                onViewChange(id);
                onClose();
              }}
              className={`w-full flex items-center gap-3 px-4 min-h-12 font-arcade text-[10px] uppercase border-2 transition-colors ${
                active
                  ? 'bg-grass text-white border-line'
                  : 'text-grass-soft border-grass hover:bg-grass/40 hover:text-white'
              }`}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-gold' : ''}`} />
              <span className="truncate">
                {active && <span className="text-gold">▶ </span>}
                {label}
              </span>
            </button>
          );
        })}
      </nav>

      <button
        onClick={onClose}
        className="mt-6 w-full min-h-12 bg-gold text-night border-4 border-white shadow-hard-btn font-arcade text-xs uppercase active:translate-x-1 active:translate-y-1 active:shadow-none"
      >
        ▶ RESUME
      </button>
    </div>
  );
}
