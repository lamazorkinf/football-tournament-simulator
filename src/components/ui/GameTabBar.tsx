import { Menu } from 'lucide-react';
import { useSeasonModeStore } from '../../store/useSeasonModeStore';
import { useModeNav } from '../../hooks/useModeNav';
import { navIcon } from './navIcons';
import type { View } from '../../types/view';

interface GameTabBarProps {
  currentView: View;
  onViewChange: (view: View) => void;
  onStartPress: () => void;
  isPauseOpen: boolean;
}

/**
 * Barra de pestañas de mobile: 4 accesos del modo activo + PAUSA. Cuáles son
 * los 4 lo decide `deriveModeNav` desde el descriptor; acá sólo se dibujan.
 */
export function GameTabBar({ currentView, onViewChange, onStartPress, isPauseOpen }: GameTabBarProps) {
  const nav = useModeNav(currentView);
  const setSeasonTab = useSeasonModeStore((s) => s.setActiveTab);

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
        {nav.primary.map((item) => {
          const Icon = navIcon(item.icon);
          const active = currentView === item.target.view;
          return (
            <button
              key={item.key}
              onClick={() => {
                if (item.target.tab !== undefined) setSeasonTab(item.target.tab);
                onViewChange(item.target.view);
              }}
              className={tabClass(active)}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className={`w-5 h-5 ${active ? 'text-gold' : ''}`} />
              {item.shortLabel}
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
          PAUSA
        </button>
      </div>
    </nav>
  );
}
