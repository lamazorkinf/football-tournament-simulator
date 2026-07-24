import type { LucideIcon } from 'lucide-react';
import { Trophy, Globe2, BarChart3, Settings, History, CalendarDays, GitCompare, Workflow, Archive, ChevronLeft, ChevronRight, Medal, Star, Route, Shield, Lock } from 'lucide-react';
import { TournamentSelector } from './TournamentSelector';
import { useSidebarCollapse } from '../../hooks/useSidebarCollapse';

type View = 'wizard' | 'qualifiers' | 'worldcup' | 'stats' | 'settings' | 'history' | 'matches' | 'comparison' | 'tournaments' | 'champions' | 'continental' | 'confederations' | 'favorites';

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
  tournamentYear: number;
  /** Fases del ciclo todavía no desbloqueadas: se marcan, pero siguen navegables. */
  lockedViews?: View[];
}

const SECTIONS: { title: string; items: { id: View; icon: LucideIcon; label: string }[] }[] = [
  {
    title: 'Ciclo actual',
    items: [
      { id: 'wizard', icon: Workflow, label: 'Progreso' },
      { id: 'matches', icon: CalendarDays, label: 'Centro de Partidos' },
      { id: 'continental', icon: Globe2, label: 'Continental' },
      { id: 'confederations', icon: Shield, label: 'Confederaciones' },
      { id: 'qualifiers', icon: Route, label: 'Clasificatorias' },
      { id: 'worldcup', icon: Trophy, label: 'Mundial' },
    ],
  },
  {
    title: 'Análisis',
    items: [
      { id: 'stats', icon: BarChart3, label: 'Estadísticas' },
      { id: 'comparison', icon: GitCompare, label: 'Comparar' },
      { id: 'favorites', icon: Star, label: 'Favoritos' },
    ],
  },
  {
    title: 'Archivo',
    items: [
      { id: 'champions', icon: Medal, label: 'Campeones' },
      { id: 'history', icon: History, label: 'Historial' },
      { id: 'tournaments', icon: Archive, label: 'Torneos' },
    ],
  },
];

const FOOTER_ITEM = { id: 'settings' as View, icon: Settings, label: 'Configuración' };

export function Sidebar({ currentView, onViewChange, tournamentYear, lockedViews }: SidebarProps) {
  const { isCollapsed, toggleCollapse } = useSidebarCollapse();

  const renderItem = (item: { id: View; icon: LucideIcon; label: string }) => {
    const isActive = currentView === item.id;
    const locked = lockedViews?.includes(item.id) ?? false;
    // La fase bloqueada muestra candado en lugar de su icono, pero el botón
    // sigue habilitado: entrar lleva al EmptyState que explica el desbloqueo.
    const Icon = locked ? Lock : item.icon;

    return (
      <button
        key={item.id}
        onClick={() => onViewChange(item.id)}
        title={locked ? `${item.label} — todavía bloqueada` : isCollapsed ? item.label : undefined}
        className={`w-full flex items-center gap-3 px-3 py-2.5 transition-all duration-150 ${
          isActive
            ? 'bg-grass text-white'
            : 'text-grass-soft hover:bg-grass/40 hover:text-white'
        } ${locked ? 'opacity-50' : ''} ${isCollapsed ? 'justify-center' : ''}`}
      >
        <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-gold' : 'text-grass-soft'}`} />
        {!isCollapsed && (
          <span className="truncate font-arcade text-[10px] uppercase leading-relaxed">
            {isActive && <span className="text-gold">▶ </span>}
            {item.label}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:bg-grass-dark lg:border-r-4 lg:border-grass transition-all duration-300 ${
      isCollapsed ? 'lg:w-20' : 'lg:w-64'
    }`}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-6 border-b-2 border-grass relative">
          {!isCollapsed && (
            <>
              <Trophy className="w-8 h-8 text-gold flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <h1 className="font-arcade text-sm text-gold text-shadow-retro truncate">
                  {tournamentYear}
                </h1>
                <p className="text-xs text-grass-soft truncate">
                  Ciclo mundial
                </p>
              </div>
            </>
          )}
          {isCollapsed && (
            <Trophy className="w-8 h-8 text-gold mx-auto" />
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

        {/* Tournament Selector */}
        {!isCollapsed && (
          <div className="px-4 py-4 border-b-2 border-grass">
            <TournamentSelector />
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
          {SECTIONS.map((section) => (
            <div key={section.title} className="space-y-1">
              {!isCollapsed ? (
                <p className="px-3 font-arcade text-[9px] text-grass-soft uppercase">
                  {section.title}
                </p>
              ) : (
                <div className="border-t-2 border-grass mx-2" />
              )}
              {section.items.map((item) => renderItem(item))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t-2 border-grass">
          {renderItem(FOOTER_ITEM)}
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
