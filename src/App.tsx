import { useEffect, useState, type ReactNode } from 'react';
import { useTournamentStore } from './store/useTournamentStore';
import { useModeStore } from './store/useModeStore';
import { useLiveMatchStore } from './store/useLiveMatchStore';
import { useLiveMatchdayStore } from './store/useLiveMatchdayStore';
import { hydrateSettings } from './lib/hydrateSettings';
import { useSidebarCollapse } from './hooks/useSidebarCollapse';
import { TeamProfileProvider } from './hooks/useTeamProfile';
import { StatsDashboard } from './components/tournament/StatsDashboard';
import { MatchHistory } from './components/tournament/MatchHistory';
import { MatchCenter } from './components/tournament/MatchCenter';
import { TournamentWizard } from './components/tournament/TournamentWizard';
import { SettingsHub } from './components/settings/SettingsHub';
import { TeamComparison } from './components/comparison/TeamComparison';
import { QualifiersView } from './components/tournament/QualifiersView';
import { WorldCupViewEnhanced } from './components/tournament/WorldCupViewEnhanced';
import { TournamentHistory } from './components/tournament/TournamentHistory';
import { ChampionsHistory } from './components/tournament/ChampionsHistory';
import { ContinentalView } from './components/tournament/ContinentalView';
import { ConfederationsCupView } from './components/tournament/ConfederationsCupView';
import { FavoritesView } from './components/favorites/FavoritesView';
import { LiveMatchModal } from './components/tournament/LiveMatchModal';
import { LiveMatchdayOverlay } from './components/tournament/LiveMatchdayOverlay';
import { Sidebar } from './components/ui/Sidebar';
import { TournamentSelector } from './components/ui/TournamentSelector';
import { ProgressModal } from './components/ui/ProgressModal';
import { Scanlines } from './components/ui/Scanlines';
import { ToastContainer } from './components/ui/ToastContainer';
import { MatchResultsModal } from './components/ui/MatchResultsModal';
import { GameTabBar } from './components/ui/GameTabBar';
import { PauseMenu } from './components/ui/PauseMenu';
import { ActionDock } from './components/ui/ActionDock';
import { ConnectionError } from './components/ui/ConnectionError';
import { PixelBar } from './components/ui/PixelBar';
import { SeasonModeView } from './components/tournament/SeasonModeView';
import { MobileActionProvider } from './hooks/useMobileAction';
import { useModeNav } from './hooks/useModeNav';
import { themeForMode } from './lib/modeTheme';
import { Trophy } from 'lucide-react';
import type { View } from './types/view';

function App() {
  const {
    teams,
    currentTournament,
    initStatus,
    loadTeamsFromDatabase,
    initializeTournament,
    refreshFromDatabase,
  } = useTournamentStore();

  const { isCollapsed } = useSidebarCollapse();
  const activeMode = useModeStore((s) => s.activeMode());
  const [currentView, setCurrentView] = useState<View>('wizard');
  const [isPauseOpen, setIsPauseOpen] = useState(false);
  const [viewOptions, setViewOptions] = useState<{ region?: string; groupId?: string }>({});
  const nav = useModeNav(currentView);

  // Navigation handler with optional parameters
  const handleNavigate = (view: string, options?: { region?: string; groupId?: string }) => {
    setCurrentView(view as View);
    if (options) {
      setViewOptions(options);
    } else {
      setViewOptions({});
    }
  };

  const handleTabChange = (view: View) => {
    setCurrentView(view);
    setViewOptions({});
    setIsPauseOpen(false);
  };

  // Load teams from database on mount
  // Lista de modos (competiciones). Debe cargar antes que nada dependa del
  // `kind` del modo activo; el id activo ya viene de localStorage, así que el
  // filtrado por modo funciona aun antes de que resuelva esta llamada.
  useEffect(() => {
    useModeStore.getState().loadModes();
  }, []);

  // Tonalidad de la app según el modo activo: cada modo puede repintar la
  // interfaz (verde selecciones / azul nocturno ligas) escribiendo data-theme
  // en <html>. Las paletas viven en src/index.css.
  useEffect(() => {
    document.documentElement.dataset.theme = themeForMode(activeMode);
  }, [activeMode]);

  useEffect(() => {
    loadTeamsFromDatabase();
  }, [loadTeamsFromDatabase]);

  // Preferencias (config del motor, favoritos, CRT): también viven en la DB.
  useEffect(() => {
    hydrateSettings();
  }, []);

  // Al cambiar de modo, encarrilar la vista para no quedar en una que no aplica
  // (p. ej. 'worldcup' en un modo de temporada, o 'league' en el ciclo). Qué
  // vistas alcanza cada modo sale del descriptor: `nav.view` ya es la efectiva.
  useEffect(() => {
    if (nav.view !== currentView) setCurrentView(nav.view);
  }, [nav.view, currentView]);

  // Carga inicial desde la DB, la única fuente de verdad. Es idempotente vía
  // initializationInFlight, así que se llama incondicionalmente.
  useEffect(() => {
    initializeTournament();
  }, [initializeTournament]);

  // Al volver a la pestaña, recargar el torneo: pudo jugarse en otro
  // dispositivo mientras esta pestaña quedaba con la copia en memoria vieja.
  // Se saltea si hay una simulación en vivo abierta, para no pisar lo que se
  // está jugando (refreshFromDatabase ya cubre los flags de batch/guardado).
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (useLiveMatchStore.getState().activeMatch) return;
      if (useLiveMatchdayStore.getState().session) return;
      refreshFromDatabase();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refreshFromDatabase]);

  if (initStatus === 'error' || initStatus === 'unconfigured') {
    return (
      <>
        <Scanlines />
        <ConnectionError variant={initStatus} onRetry={initializeTournament} />
      </>
    );
  }

  // Sólo el ciclo mundialista bloquea hasta tener un torneo cargado. Los modos
  // de temporada arrancan sin `currentTournament` (sus torneos viven en
  // mode_tournaments): ahí se cae a la pantalla principal, para no atrapar al
  // usuario en un "Cargando…" sin salida (el selector de modo vive en el Sidebar).
  if (!currentTournament && nav.engine === 'national-cycle') {
    return (
      <>
        <Scanlines />
        <div className="min-h-screen flex items-center justify-center bg-night px-6">
          <div className="w-full max-w-xs text-center space-y-6">
            <Trophy className="w-16 h-16 text-gold mx-auto" />
            <p className="font-arcade text-sm text-gold text-shadow-retro">
              FOOTBALL SIM
            </p>
            <PixelBar value={0} max={100} indeterminate />
            <p className="font-arcade text-[10px] text-grass-soft uppercase">
              Cargando torneo…
            </p>
          </div>
        </div>
      </>
    );
  }

  /**
   * Qué panel se dibuja. Las vistas del ciclo mundialista necesitan el torneo
   * cargado; el resto son mode-agnósticas. `nav.view` ya garantiza que la vista
   * aplica a este modo, así que acá no hay ninguna rama por tipo de modo.
   */
  function renderView(): ReactNode {
    const shared: Partial<Record<View, ReactNode>> = {
      settings: <SettingsHub />,
      history: <MatchHistory teams={teams} />,
      comparison: <TeamComparison />,
      favorites: <FavoritesView />,
      tournaments: <TournamentHistory />,
      champions: <ChampionsHistory onNavigate={handleNavigate} />,
      league: <SeasonModeView />,
    };
    if (shared[currentView]) return shared[currentView];
    if (!currentTournament) return <SeasonModeView />;

    const cycleViews: Partial<Record<View, ReactNode>> = {
      wizard: <TournamentWizard onNavigate={handleNavigate} />,
      matches: <MatchCenter tournament={currentTournament} teams={teams} onNavigate={handleNavigate} />,
      stats: <StatsDashboard tournament={currentTournament} teams={teams} />,
      worldcup: <WorldCupViewEnhanced onNavigate={handleNavigate} />,
      qualifiers: (
        <QualifiersView
          initialRegion={viewOptions.region}
          initialGroupId={viewOptions.groupId}
          onNavigate={handleNavigate}
        />
      ),
      continental: <ContinentalView cycle={currentTournament} teams={teams} onNavigate={handleNavigate} />,
      confederations: (
        <ConfederationsCupView cycle={currentTournament} teams={teams} onNavigate={handleNavigate} />
      ),
    };
    return cycleViews[currentView] ?? null;
  }

  return (
    <TeamProfileProvider>
      <MobileActionProvider>
      <Scanlines />
      <div className="min-h-screen bg-night">
        {/* Progress Modal */}
        <ProgressModal />

        {/* Toast Notifications */}
        <ToastContainer />

        {/* Match Results Modal */}
        <MatchResultsModal />

        {/* Live Match Modal */}
        <LiveMatchModal />

        {/* Live Matchday Overlay */}
        <LiveMatchdayOverlay />

      {/* Desktop Sidebar */}
      <Sidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        tournamentYear={currentTournament?.year ?? 0}
      />

      {/* Main content area with dynamic left margin based on sidebar state */}
      <div className={`transition-all duration-300 pb-[calc(9rem+env(safe-area-inset-bottom))] lg:pb-0 ${isCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        {/* Mobile Header */}
        <header className="lg:hidden bg-grass-dark border-b-4 border-grass sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
          <div className="px-4 py-2 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="font-arcade text-xs text-white text-shadow-retro truncate">
                {currentTournament?.name ?? activeMode?.name ?? 'Football Sim'}
              </h1>
            </div>
            <div className="flex-shrink-0">
              {nav.engine === 'national-cycle' && <TournamentSelector />}
            </div>
          </div>
        </header>

        <main className="px-4 sm:px-6 lg:px-8 py-6">
          {renderView()}
        </main>
      </div>
      </div>
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-40">
        <ActionDock />
        <GameTabBar
          currentView={currentView}
          onViewChange={handleTabChange}
          onStartPress={() => setIsPauseOpen((v) => !v)}
          isPauseOpen={isPauseOpen}
        />
      </div>
      <PauseMenu
        isOpen={isPauseOpen}
        onClose={() => setIsPauseOpen(false)}
        currentView={currentView}
        onViewChange={handleTabChange}
      />
      </MobileActionProvider>
    </TeamProfileProvider>
  );
}

export default App;
