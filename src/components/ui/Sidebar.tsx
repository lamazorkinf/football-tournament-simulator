import { ChevronLeft, ChevronRight, Lock, Shield, Trophy } from 'lucide-react';
import { TournamentSelector } from './TournamentSelector';
import { ModeSelector } from './ModeSelector';
import { useModeStore } from '../../store/useModeStore';
import { useSeasonModeStore } from '../../store/useSeasonModeStore';
import { useModeNav } from '../../hooks/useModeNav';
import { navIcon } from './navIcons';
import { useSidebarCollapse } from '../../hooks/useSidebarCollapse';
import type { NavItem } from '../../modes/nav';
import type { View } from '../../types/view';

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
  tournamentYear: number;
}

/**
 * Navegación de escritorio. No sabe qué modo está activo: renderiza las
 * secciones que le da `useModeNav`, derivadas del descriptor. Antes tenía dos
 * listas escritas a mano y una ternaria que elegía entre ellas.
 */
export function Sidebar({ currentView, onViewChange, tournamentYear }: SidebarProps) {
  const { isCollapsed, toggleCollapse } = useSidebarCollapse();
  const activeMode = useModeStore((s) => s.activeMode());
  const seasonYear = useSeasonModeStore((s) => s.year);
  const setSeasonTab = useSeasonModeStore((s) => s.setActiveTab);
  const nav = useModeNav(currentView);

  const isNationalMode = nav.engine === 'national-cycle';

  const renderItem = (item: NavItem) => {
    // Una fase bloqueada muestra candado en lugar de su icono, pero el botón
    // sigue habilitado: entrar lleva al EmptyState que explica el desbloqueo.
    const Icon = item.locked ? Lock : navIcon(item.icon);
    const active =
      currentView === item.target.view &&
      (item.target.tab === undefined || nav.tab === item.target.tab);

    return (
      <button
        key={item.key}
        onClick={() => {
          if (item.target.tab !== undefined) setSeasonTab(item.target.tab);
          onViewChange(item.target.view);
        }}
        title={item.locked ? `${item.label} — todavía bloqueada` : isCollapsed ? item.label : undefined}
        className={`w-full flex items-center gap-3 px-3 py-2.5 transition-all duration-150 ${
          active ? 'bg-grass text-white' : 'text-grass-soft hover:bg-grass/40 hover:text-white'
        } ${item.locked ? 'opacity-50' : ''} ${isCollapsed ? 'justify-center' : ''}`}
      >
        <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-gold' : 'text-grass-soft'}`} />
        {!isCollapsed && (
          <span className="truncate font-arcade text-[10px] uppercase leading-relaxed">
            {active && <span className="text-gold">▶ </span>}
            {item.label}
          </span>
        )}
      </button>
    );
  };

  const headerYear = isNationalMode ? tournamentYear : seasonYear ?? activeMode?.currentYear ?? 0;
  const headerSubtitle = isNationalMode ? 'Ciclo mundial' : activeMode?.name ?? 'Liga y copa';
  const HeaderIcon = isNationalMode ? Trophy : Shield;

  const sections = nav.sections.filter((s) => s.key !== 'footer');
  const footer = nav.sections.find((s) => s.key === 'footer');

  return (
    <aside className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:bg-grass-dark lg:border-r-4 lg:border-grass transition-all duration-300 ${
      isCollapsed ? 'lg:w-20' : 'lg:w-64'
    }`}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-6 border-b-2 border-grass relative">
          {!isCollapsed && (
            <>
              <HeaderIcon className="w-8 h-8 text-gold flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <h1 className="font-arcade text-sm text-gold text-shadow-retro truncate">
                  {headerYear}
                </h1>
                <p className="text-xs text-grass-soft truncate">
                  {headerSubtitle}
                </p>
              </div>
            </>
          )}
          {isCollapsed && (
            <HeaderIcon className="w-8 h-8 text-gold mx-auto" />
          )}

          {/* Collapse Toggle */}
          <button
            onClick={toggleCollapse}
            className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-grass-dark border-2 border-line text-led flex items-center justify-center hover:bg-grass/40 transition-colors z-10"
            title={isCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Mode Selector (competición activa) */}
        {!isCollapsed && (
          <div className="px-4 py-4 border-b-2 border-grass">
            <ModeSelector />
          </div>
        )}

        {/* Tournament Selector — sólo en el ciclo mundialista */}
        {!isCollapsed && isNationalMode && (
          <div className="px-4 py-4 border-b-2 border-grass">
            <TournamentSelector />
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
          {sections.map((section) => (
            <div key={section.key} className="space-y-1">
              {!isCollapsed ? (
                <p className="px-3 font-arcade text-[9px] text-grass-soft uppercase">{section.title}</p>
              ) : (
                <div className="border-t-2 border-grass mx-2" />
              )}
              {section.items.map(renderItem)}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t-2 border-grass">
          {footer?.items.map(renderItem)}
          {!isCollapsed && (
            <div className="px-4 py-4 bg-night">
              <p className="text-xs text-grass-soft text-center">
                Football Tournament Simulator
              </p>
              <p className="text-xs text-grass-soft text-center mt-1">
                v1.0
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
