import { Trophy, Globe2, Award, BarChart3, Settings, History, CalendarDays, GitCompare, Workflow, Archive, ChevronLeft, ChevronRight, Medal } from 'lucide-react';
import { TournamentSelector } from './TournamentSelector';
import { useSidebarCollapse } from '../../hooks/useSidebarCollapse';

type View = 'wizard' | 'qualifiers' | 'worldcup' | 'stats' | 'settings' | 'history' | 'matches' | 'comparison' | 'tournaments' | 'champions';

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
  tournamentYear: number;
}

export function Sidebar({ currentView, onViewChange, tournamentYear }: SidebarProps) {
  const { isCollapsed, toggleCollapse } = useSidebarCollapse();
  const menuItems = [
    { id: 'wizard' as View, icon: Workflow, label: 'Progreso' },
    { id: 'matches' as View, icon: CalendarDays, label: 'Centro de Partidos' },
    { id: 'qualifiers' as View, icon: Globe2, label: 'Clasificatorias' },
    { id: 'worldcup' as View, icon: Award, label: 'Mundial' },
    { id: 'stats' as View, icon: BarChart3, label: 'Estadísticas' },
    { id: 'comparison' as View, icon: GitCompare, label: 'Comparar' },
    { id: 'champions' as View, icon: Medal, label: 'Campeones' },
    { id: 'history' as View, icon: History, label: 'Historial' },
    { id: 'tournaments' as View, icon: Archive, label: 'Torneos' },
    { id: 'settings' as View, icon: Settings, label: 'Configuración' },
  ];

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
                  World Cup
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
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 transition-all duration-150 ${
                  isActive
                    ? 'bg-grass text-white'
                    : 'text-grass-soft hover:bg-grass/40 hover:text-white'
                } ${isCollapsed ? 'justify-center' : ''}`}
                title={isCollapsed ? item.label : undefined}
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
          })}
        </nav>

        {/* Footer */}
        {!isCollapsed && (
          <div className="px-4 py-4 border-t-2 border-grass bg-night">
            <p className="text-xs text-grass-soft text-center">
              Football Tournament Simulator
            </p>
            <p className="text-xs text-grass-soft text-center mt-1">
              v1.0
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
