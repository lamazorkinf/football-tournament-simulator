import { Workflow, CalendarDays, Globe2, Award, Menu } from 'lucide-react';

type View = 'wizard' | 'qualifiers' | 'worldcup' | 'stats' | 'settings' | 'history' | 'matches' | 'comparison' | 'tournaments' | 'champions' | 'continental' | 'confederations' | 'favorites';

// Etiquetas cortas a propósito: son 5 columnas y Press Start 2P es una
// tipografía ancha (~1em por carácter), así que arriba de 7 caracteres se
// desborda en pantallas de 375px. "JORNADA" usa la misma palabra que el resto
// de la app para la tanda de partidos.
const TABS = [
  { id: 'wizard' as View, icon: Workflow, label: 'INICIO' },
  { id: 'matches' as View, icon: CalendarDays, label: 'JORNADA' },
  { id: 'qualifiers' as View, icon: Globe2, label: 'CLASIF' },
  { id: 'worldcup' as View, icon: Award, label: 'COPA' },
];

interface GameTabBarProps {
  currentView: View;
  onViewChange: (view: View) => void;
  onStartPress: () => void;
  isPauseOpen: boolean;
}

export function GameTabBar({ currentView, onViewChange, onStartPress, isPauseOpen }: GameTabBarProps) {
  const tabClass = (active: boolean) =>
    `flex flex-col items-center justify-center gap-1 min-h-14 pt-2 pb-1 font-arcade text-[10px] uppercase transition-colors active:translate-y-0.5 ${
      active
        ? 'bg-grass text-white shadow-[inset_0_4px_0_var(--color-gold)]'
        : 'text-grass-soft hover:bg-grass/40'
    }`;

  return (
    <nav
      aria-label="Navegación principal"
      className="bg-grass-dark border-t-4 border-grass pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-5">
        {TABS.map(({ id, icon: Icon, label }) => {
          const active = currentView === id;
          return (
            <button
              key={id}
              onClick={() => onViewChange(id)}
              className={tabClass(active)}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className={`w-5 h-5 ${active ? 'text-gold' : ''}`} />
              {label}
            </button>
          );
        })}
        <button
          onClick={onStartPress}
          className={tabClass(isPauseOpen)}
          aria-expanded={isPauseOpen}
          aria-haspopup="dialog"
        >
          <Menu className={`w-5 h-5 ${isPauseOpen ? 'text-gold' : ''}`} />
          MENÚ
        </button>
      </div>
    </nav>
  );
}
