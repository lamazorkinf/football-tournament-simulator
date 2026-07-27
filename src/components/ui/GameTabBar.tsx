import { Workflow, CalendarDays, Globe2, Award, Menu, Home, GitCompare, Star, History } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useModeStore } from '../../store/useModeStore';
import type { View } from '../../types/view';

// Etiquetas cortas a propósito: son 5 columnas y Press Start 2P ocupa ~1em por
// carácter, así que el ancho disponible por columna manda. Medido en el
// navegador: a 375px una etiqueta de 7 caracteres entra con CERO margen y a
// 320px se superpone con la de al lado. De ahí el tope de 6.
// "FECHA" es la palabra rioplatense para la tanda de partidos de una jornada.
type Tab = { id: View; icon: LucideIcon; label: string };

const NATIONAL_TABS: Tab[] = [
  { id: 'wizard', icon: Workflow, label: 'INICIO' },
  { id: 'matches', icon: CalendarDays, label: 'FECHA' },
  { id: 'qualifiers', icon: Globe2, label: 'CLASIF' },
  { id: 'worldcup', icon: Award, label: 'COPA' },
];

// En los modos de ligas la sub-navegación (Liga A/B, Copa, Temporada, Escudos)
// vive en la barra de pestañas del propio contenido; acá quedan sólo las vistas
// de nivel superior mode-agnósticas.
const LEAGUE_TABS: Tab[] = [
  { id: 'league', icon: Home, label: 'INICIO' },
  { id: 'comparison', icon: GitCompare, label: 'VERSUS' },
  { id: 'favorites', icon: Star, label: 'FAVS' },
  { id: 'history', icon: History, label: 'DIARIO' },
];

interface GameTabBarProps {
  currentView: View;
  onViewChange: (view: View) => void;
  onStartPress: () => void;
  isPauseOpen: boolean;
}

export function GameTabBar({ currentView, onViewChange, onStartPress, isPauseOpen }: GameTabBarProps) {
  const isNationalMode = useModeStore((s) => s.activeModeKind()) === 'national-cycle';
  const tabs = isNationalMode ? NATIONAL_TABS : LEAGUE_TABS;

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
        {tabs.map(({ id, icon: Icon, label }) => {
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
          PAUSA
        </button>
      </div>
    </nav>
  );
}
