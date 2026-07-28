import { useEffect } from 'react';
import { PeriodSelector } from './PeriodSelector';
import { useSeasonModeStore } from '../../store/useSeasonModeStore';
import { useModeNav } from '../../hooks/useModeNav';
import { navIcon } from './navIcons';
import type { View } from '../../types/view';

interface PauseMenuProps {
  isOpen: boolean;
  onClose: () => void;
  currentView: View;
  onViewChange: (view: View) => void;
}

/**
 * Menú de pausa de mobile: todo lo del modo que no entró en la barra de abajo
 * (`nav.overflow`). No tiene listas propias ni sabe qué modo está activo.
 */
export function PauseMenu({ isOpen, onClose, currentView, onViewChange }: PauseMenuProps) {
  const nav = useModeNav(currentView);
  const setSeasonTab = useSeasonModeStore((s) => s.setActiveTab);

  // Cierre con Escape y bloqueo del scroll del body mientras está abierto (en
  // iOS el fondo seguía desplazándose por debajo del overlay).
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Menú de pausa"
      className="fixed inset-0 z-50 lg:hidden bg-night/95 pause-in flex flex-col px-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
    >
      <h2 className="font-arcade text-lg text-gold text-shadow-retro text-center mb-6">⏸ PAUSA</h2>

      <div className="mb-6">
        <PeriodSelector />
      </div>

      <nav className="flex-1 overflow-y-auto space-y-2">
        {nav.overflow.map((item) => {
          const Icon = navIcon(item.icon);
          const active =
            currentView === item.target.view &&
            (item.target.tab === undefined || nav.tab === item.target.tab);
          return (
            <button
              key={item.key}
              onClick={() => {
                if (item.target.tab !== undefined) setSeasonTab(item.target.tab);
                onViewChange(item.target.view);
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
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <button
        onClick={onClose}
        className="mt-6 w-full min-h-12 bg-gold text-night border-4 border-white shadow-hard-btn font-arcade text-xs uppercase active:translate-x-1 active:translate-y-1 active:shadow-none"
      >
        ▶ CONTINUAR
      </button>
    </div>
  );
}
