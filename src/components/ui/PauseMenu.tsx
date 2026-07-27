import { useEffect } from 'react';
import { Globe2, Award, BarChart3, GitCompare, Medal, History, Archive, Settings, Star, Shield } from 'lucide-react';
import { TournamentSelector } from './TournamentSelector';
import { useModeStore } from '../../store/useModeStore';
import type { View } from '../../types/view';

const NATIONAL_MENU_ITEMS: { id: View; icon: typeof Star; label: string }[] = [
  { id: 'favorites', icon: Star, label: 'Favoritos' },
  { id: 'continental', icon: Globe2, label: 'Continental' },
  { id: 'confederations', icon: Award, label: 'Confederaciones' },
  { id: 'stats', icon: BarChart3, label: 'Rendimiento' },
  { id: 'comparison', icon: GitCompare, label: 'Comparar' },
  { id: 'champions', icon: Medal, label: 'Campeones' },
  { id: 'history', icon: History, label: 'Historial' },
  { id: 'tournaments', icon: Archive, label: 'Torneos' },
  { id: 'settings', icon: Settings, label: 'Ajustes' },
];

// Modos de ligas: sólo las vistas mode-agnósticas (las del ciclo mundialista no
// aplican). La sub-navegación de la liga vive en la barra del contenido.
const LEAGUE_MENU_ITEMS: { id: View; icon: typeof Star; label: string }[] = [
  { id: 'league', icon: Shield, label: 'Liga' },
  { id: 'favorites', icon: Star, label: 'Favoritos' },
  { id: 'comparison', icon: GitCompare, label: 'Comparar' },
  { id: 'history', icon: History, label: 'Historial' },
  { id: 'settings', icon: Settings, label: 'Ajustes' },
];

interface PauseMenuProps {
  isOpen: boolean;
  onClose: () => void;
  currentView: View;
  onViewChange: (view: View) => void;
}

export function PauseMenu({ isOpen, onClose, currentView, onViewChange }: PauseMenuProps) {
  const isNationalMode = useModeStore((s) => s.activeModeKind()) === 'national-cycle';
  const menuItems = isNationalMode ? NATIONAL_MENU_ITEMS : LEAGUE_MENU_ITEMS;
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

      {isNationalMode && (
        <div className="mb-6">
          <TournamentSelector />
        </div>
      )}

      <nav className="flex-1 overflow-y-auto space-y-2">
        {menuItems.map(({ id, icon: Icon, label }) => {
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
        ▶ CONTINUAR
      </button>
    </div>
  );
}
