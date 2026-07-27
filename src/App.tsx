import { useEffect, useMemo, useState } from 'react';
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
import { LeagueModeView } from './components/tournament/LeagueModeView';
import { MobileActionProvider } from './hooks/useMobileAction';
import { isContinentalDrawn, isConfederationsDrawn } from './utils/cycleProgress';
import { Trophy } from 'lucide-react';

type View = 'wizard' | 'qualifiers' | 'worldcup' | 'stats' | 'settings' | 'history' | 'matches' | 'comparison' | 'tournaments' | 'champions' | 'continental' | 'confederations' | 'favorites';

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
  const isNationalMode = useModeStore((s) => s.activeModeKind()) === 'national-cycle';
  const [currentView, setCurrentView] = useState<View>('wizard');
  const [isPauseOpen, setIsPauseOpen] = useState(false);
  const [viewOptions, setViewOptions] = useState<{ region?: string; groupId?: string }>({});

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

  useEffect(() => {
    loadTeamsFromDatabase();
  }, [loadTeamsFromDatabase]);

  // Preferencias (config del motor, favoritos, CRT): también viven en la DB.
  useEffect(() => {
    hydrateSettings();
  }, []);

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

  // Debe declararse ANTES de los returns condicionales de más abajo: si no,
  // cuando currentTournament pasa de null a existente cambia la cantidad de
  // hooks ejecutados y React lanza "Rendered more hooks than during the
  // previous render" (mismo motivo documentado en TournamentWizard.tsx). Por
  // eso es tolerante a currentTournament nulo.
  const lockedViews = useMemo(() => {
    if (!currentTournament) return [];
    const locked: View[] = [];
    if (!isContinentalDrawn(currentTournament)) locked.push('continental');
    if (!isConfederationsDrawn(currentTournament)) locked.push('confederations');
    if (!currentTournament.confederationsCup.isComplete) locked.push('qualifiers');
    if (!currentTournament.worldCup) locked.push('worldcup');
    return locked;
  }, [currentTournament]);

  if (initStatus === 'error' || initStatus === 'unconfigured') {
    return (
      <>
        <Scanlines />
        <ConnectionError variant={initStatus} onRetry={initializeTournament} />
      </>
    );
  }

  // Sólo el modo selecciones bloquea hasta tener un torneo cargado. Los modos de
  // ligas arrancan sin `currentTournament` (sus torneos son Etapa 2): ahí se cae
  // a la pantalla principal con un placeholder, para no atrapar al usuario en un
  // "Cargando…" sin salida (el selector de modo vive en el Sidebar).
  if (!currentTournament && isNationalMode) {
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
        lockedViews={lockedViews}
      />

      {/* Main content area with dynamic left margin based on sidebar state */}
      <div className={`transition-all duration-300 pb-[calc(9rem+env(safe-area-inset-bottom))] lg:pb-0 ${isCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        {/* Mobile Header */}
        <header className="lg:hidden bg-grass-dark border-b-4 border-grass sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
          <div className="px-4 py-2 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="font-arcade text-xs text-white text-shadow-retro truncate">
                {currentTournament?.name ?? 'Football Sim'}
              </h1>
            </div>
            <div className="flex-shrink-0">
              {isNationalMode && <TournamentSelector />}
            </div>
          </div>
        </header>

        <main className="px-4 sm:px-6 lg:px-8 py-6">
        {!currentTournament ? (
          // Modo de ligas: sus vistas propias (liga, copa, temporada). Ajustes,
          // historial, comparación y favoritos son mode-agnósticos y siguen a mano.
          currentView === 'settings' ? (
            <SettingsHub />
          ) : currentView === 'history' ? (
            <MatchHistory teams={teams} />
          ) : currentView === 'comparison' ? (
            <TeamComparison />
          ) : currentView === 'favorites' ? (
            <FavoritesView />
          ) : (
            <LeagueModeView />
          )
        ) : currentView === 'wizard' ? (
          <TournamentWizard onNavigate={handleNavigate} />
        ) : currentView === 'matches' ? (
          <MatchCenter tournament={currentTournament} teams={teams} onNavigate={handleNavigate} />
        ) : currentView === 'stats' ? (
          <StatsDashboard tournament={currentTournament} teams={teams} />
        ) : currentView === 'history' ? (
          <MatchHistory teams={teams} />
        ) : currentView === 'settings' ? (
          <SettingsHub />
        ) : currentView === 'comparison' ? (
          <TeamComparison />
        ) : currentView === 'worldcup' ? (
          <WorldCupViewEnhanced onNavigate={handleNavigate} />
        ) : currentView === 'qualifiers' ? (
          <QualifiersView
            initialRegion={viewOptions.region}
            initialGroupId={viewOptions.groupId}
            onNavigate={handleNavigate}
          />
        ) : currentView === 'tournaments' ? (
          <TournamentHistory />
        ) : currentView === 'champions' ? (
          <ChampionsHistory onNavigate={handleNavigate} />
        ) : currentView === 'continental' ? (
          <ContinentalView cycle={currentTournament} teams={teams} onNavigate={handleNavigate} />
        ) : currentView === 'confederations' ? (
          <ConfederationsCupView cycle={currentTournament} teams={teams} onNavigate={handleNavigate} />
        ) : currentView === 'favorites' ? (
          <FavoritesView />
        ) : null}
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
