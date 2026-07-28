import type { LucideIcon } from 'lucide-react';
import { Trophy, Globe2, BarChart3, Settings, History, CalendarDays, GitCompare, Workflow, Archive, ChevronLeft, ChevronRight, Medal, Star, Route, Shield, Lock } from 'lucide-react';
import { TournamentSelector } from './TournamentSelector';
import { ModeSelector } from './ModeSelector';
import { useModeStore } from '../../store/useModeStore';
import { useSeasonModeStore, deriveSeasonTabs, resolveSeasonTab, type SeasonTab } from '../../store/useSeasonModeStore';
import { navIcon } from './navIcons';
import { useSidebarCollapse } from '../../hooks/useSidebarCollapse';
import type { View } from '../../types/view';

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
  tournamentYear: number;
  /** Fases del ciclo todavía no desbloqueadas: se marcan, pero siguen navegables. */
  lockedViews?: View[];
}

type NavItem = { id: View; icon: LucideIcon; label: string };
type NavSection = { title: string; items: NavItem[] };

// Ciclo mundialista (modo selecciones).
const NATIONAL_SECTIONS: NavSection[] = [
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
    title: 'Datos',
    items: [
      { id: 'stats', icon: BarChart3, label: 'Rendimiento' },
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

// Datos mode-agnósticos que siguen a mano en los modos de ligas (funcionan sin
// un ciclo de selecciones cargado).
const LEAGUE_DATA_SECTION: NavSection = {
  title: 'Datos',
  items: [
    { id: 'comparison', icon: GitCompare, label: 'Comparar' },
    { id: 'favorites', icon: Star, label: 'Favoritos' },
    { id: 'history', icon: History, label: 'Historial' },
  ],
};

const FOOTER_ITEM: NavItem = { id: 'settings', icon: Settings, label: 'Ajustes' };

export function Sidebar({ currentView, onViewChange, tournamentYear, lockedViews }: SidebarProps) {
  const { isCollapsed, toggleCollapse } = useSidebarCollapse();
  const isNationalMode = useModeStore((s) => s.activeModeKind()) === 'national-cycle';
  const activeMode = useModeStore((s) => s.activeMode());

  // Estado del modo de temporada (para el header y su navegación).
  const leagueYear = useSeasonModeStore((s) => s.year);
  const seasonDescriptor = useSeasonModeStore((s) => s.descriptor);
  const leagueStatus = useSeasonModeStore((s) => s.status);
  const leagueTournaments = useSeasonModeStore((s) => s.tournaments);
  const leagueActiveTab = useSeasonModeStore((s) => s.activeTab);
  const setLeagueTab = useSeasonModeStore((s) => s.setActiveTab);

  const renderButton = (
    { icon: Icon, label }: { icon: LucideIcon; label: string },
    { active, locked, onClick }: { active: boolean; locked?: boolean; onClick: () => void },
    key: string,
  ) => {
    // La fase bloqueada muestra candado en lugar de su icono, pero el botón
    // sigue habilitado: entrar lleva al EmptyState que explica el desbloqueo.
    const ShownIcon = locked ? Lock : Icon;
    return (
      <button
        key={key}
        onClick={onClick}
        title={locked ? `${label} — todavía bloqueada` : isCollapsed ? label : undefined}
        className={`w-full flex items-center gap-3 px-3 py-2.5 transition-all duration-150 ${
          active ? 'bg-grass text-white' : 'text-grass-soft hover:bg-grass/40 hover:text-white'
        } ${locked ? 'opacity-50' : ''} ${isCollapsed ? 'justify-center' : ''}`}
      >
        <ShownIcon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-gold' : 'text-grass-soft'}`} />
        {!isCollapsed && (
          <span className="truncate font-arcade text-[10px] uppercase leading-relaxed">
            {active && <span className="text-gold">▶ </span>}
            {label}
          </span>
        )}
      </button>
    );
  };

  // Un item "de vista" (currentView === id): usado en selecciones y en la
  // sección Datos de los modos de ligas.
  const renderViewItem = (item: NavItem) =>
    renderButton(item, {
      active: currentView === item.id,
      locked: lockedViews?.includes(item.id) ?? false,
      onClick: () => onViewChange(item.id),
    }, item.id);

  // Navegación del modo de temporada: cada pestaña vive en
  // useSeasonModeStore.activeTab y la vista de contenido es 'league'. Las
  // pestañas y sus iconos salen del descriptor del modo.
  const leagueTabs = deriveSeasonTabs(seasonDescriptor, leagueStatus, leagueTournaments);
  const resolvedLeagueTab = resolveSeasonTab(leagueTabs, leagueActiveTab);
  const renderLeagueTabItem = (t: SeasonTab) =>
    renderButton(
      { icon: navIcon(t.icon), label: t.label },
      {
        active: currentView === 'league' && resolvedLeagueTab === t.key,
        onClick: () => {
          setLeagueTab(t.key);
          onViewChange('league');
        },
      },
      `lt-${t.key}`,
    );

  const headerYear = isNationalMode ? tournamentYear : leagueYear ?? activeMode?.currentYear ?? 0;
  const headerSubtitle = isNationalMode ? 'Ciclo mundial' : activeMode?.name ?? 'Liga y copa';
  const HeaderIcon = isNationalMode ? Trophy : Shield;

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

        {/* Tournament Selector — sólo en modo selecciones */}
        {!isCollapsed && isNationalMode && (
          <div className="px-4 py-4 border-b-2 border-grass">
            <TournamentSelector />
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
          {isNationalMode
            ? NATIONAL_SECTIONS.map((section) => (
                <div key={section.title} className="space-y-1">
                  {!isCollapsed ? (
                    <p className="px-3 font-arcade text-[9px] text-grass-soft uppercase">{section.title}</p>
                  ) : (
                    <div className="border-t-2 border-grass mx-2" />
                  )}
                  {section.items.map((item) => renderViewItem(item))}
                </div>
              ))
            : (
              <>
                <div className="space-y-1">
                  {!isCollapsed ? (
                    <p className="px-3 font-arcade text-[9px] text-grass-soft uppercase">Temporada</p>
                  ) : (
                    <div className="border-t-2 border-grass mx-2" />
                  )}
                  {leagueTabs.map((t) => renderLeagueTabItem(t))}
                </div>
                <div className="space-y-1">
                  {!isCollapsed ? (
                    <p className="px-3 font-arcade text-[9px] text-grass-soft uppercase">{LEAGUE_DATA_SECTION.title}</p>
                  ) : (
                    <div className="border-t-2 border-grass mx-2" />
                  )}
                  {LEAGUE_DATA_SECTION.items.map((item) => renderViewItem(item))}
                </div>
              </>
            )}
        </nav>

        {/* Footer */}
        <div className="border-t-2 border-grass">
          {renderViewItem(FOOTER_ITEM)}
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
