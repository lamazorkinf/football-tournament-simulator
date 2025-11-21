import { Trophy, Globe2, Award, BarChart3, Settings, History, CalendarDays, LayoutDashboard, GitCompare, Workflow, Archive, ChevronLeft, ChevronRight } from 'lucide-react';
import { TournamentSelector } from './TournamentSelector';
import { useSidebarCollapse } from '../../hooks/useSidebarCollapse';

type View = 'overview' | 'wizard' | 'qualifiers' | 'worldcup' | 'stats' | 'settings' | 'history' | 'matches' | 'comparison' | 'tournaments';

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
  tournamentYear: number;
}

export function Sidebar({ currentView, onViewChange, tournamentYear }: SidebarProps) {
  const { isCollapsed, toggleCollapse } = useSidebarCollapse();
  const menuItems = [
    { id: 'overview' as View, icon: LayoutDashboard, label: 'Overview' },
    { id: 'wizard' as View, icon: Workflow, label: 'Progreso' },
    { id: 'matches' as View, icon: CalendarDays, label: 'Match Center' },
    { id: 'qualifiers' as View, icon: Globe2, label: 'Qualifiers' },
    { id: 'worldcup' as View, icon: Award, label: 'Mundial' },
    { id: 'stats' as View, icon: BarChart3, label: 'Statistics' },
    { id: 'comparison' as View, icon: GitCompare, label: 'Comparar' },
    { id: 'history' as View, icon: History, label: 'History' },
    { id: 'tournaments' as View, icon: Archive, label: 'Torneos' },
    { id: 'settings' as View, icon: Settings, label: 'Configuración' },
  ];

  return (
    <aside className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:bg-white lg:border-r lg:border-gray-200 transition-all duration-300 ${
      isCollapsed ? 'lg:w-20' : 'lg:w-64'
    }`}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-6 border-b border-gray-200 bg-gradient-to-r from-primary-50 to-primary-100 relative">
          {!isCollapsed && (
            <>
              <Trophy className="w-8 h-8 text-primary-600 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <h1 className="text-lg font-bold text-gray-900 truncate">
                  {tournamentYear}
                </h1>
                <p className="text-xs text-gray-600 truncate">
                  World Cup
                </p>
              </div>
            </>
          )}
          {isCollapsed && (
            <Trophy className="w-8 h-8 text-primary-600 mx-auto" />
          )}

          {/* Collapse Toggle */}
          <button
            onClick={toggleCollapse}
            className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-white border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors shadow-sm z-10"
            title={isCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4 text-gray-600" />
            ) : (
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            )}
          </button>
        </div>

        {/* Tournament Selector */}
        {!isCollapsed && (
          <div className="px-4 py-4 border-b border-gray-200">
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
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 font-semibold shadow-sm'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                } ${isCollapsed ? 'justify-center' : ''}`}
                title={isCollapsed ? item.label : undefined}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-primary-600' : 'text-gray-500'}`} />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        {!isCollapsed && (
          <div className="px-4 py-4 border-t border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-600 text-center">
              Football Tournament Simulator
            </p>
            <p className="text-xs text-gray-500 text-center mt-1">
              v1.0
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
