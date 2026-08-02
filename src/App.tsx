import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTournamentStore } from './store/useTournamentStore';
import { useModeStore } from './store/useModeStore';
import { useLiveMatchStore } from './store/useLiveMatchStore';
import { useLiveMatchdayStore } from './store/useLiveMatchdayStore';
import { useSeasonModeStore } from './store/useSeasonModeStore';
import { hydrateSettings } from './lib/hydrateSettings';
import { useSidebarCollapse } from './hooks/useSidebarCollapse';
import { TeamProfileProvider } from './hooks/useTeamProfile';
import { StatsDashboard } from './components/tournament/StatsDashboard';
import { MatchHistory } from './components/tournament/MatchHistory';
import { MatchCenter } from './components/tournament/MatchCenter';
import { HubView } from './components/hub/HubView';
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
import { PeriodSelector } from './components/ui/PeriodSelector';
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
import { useModeDescriptor } from './hooks/useModeDescriptor';
import { useNextAction } from './hooks/useNextAction';
import { useRecentHeadlines } from './hooks/useRecentHeadlines';
import { themeForMode } from './lib/modeTheme';
import { deriveHubHeader } from './modes/hubHeader';
import { descriptorForMode } from './modes/registry';
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
  const [currentView, setCurrentView] = useState<View>('hub');
  const [isPauseOpen, setIsPauseOpen] = useState(false);
  const [viewOptions, setViewOptions] = useState<{ region?: string; groupId?: string }>({});
  const nav = useModeNav(currentView);

  // Navigation handler with optional parameters. Estable (sólo usa setters de
  // estado, que React garantiza estables): así las vistas que lo reciben como
  // prop no se re-renderizan de gusto, y `navigateTo` puede memoizarse.
  const handleNavigate = useCallback(
    (view: string, options?: { region?: string; groupId?: string }) => {
      setCurrentView(view as View);
      if (options) {
        setViewOptions(options);
      } else {
        setViewOptions({});
      }
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Estado del Hub. TODOS estos hooks van ANTES de los `return` condicionales de
  // más abajo (initStatus y !currentTournament): si cambia la cantidad de hooks
  // ejecutados entre renders, React lanza "Rendered more hooks than during the
  // previous render".
  // ---------------------------------------------------------------------------
  // El adaptador descarta a propósito un eventual segundo argumento:
  // `handleNavigate` lo usa para opciones de vista (región, grupo) y `Nav` lo
  // tiene tipado como sub-pestaña, dos cosas distintas. `deriveNextAction` nunca
  // pasa el segundo argumento. Va memoizado porque es dependencia del `useMemo`
  // de `useNextAction`: con una función nueva por render no acertaría nunca.
  const navigateTo = useCallback((view: View) => handleNavigate(view), [handleNavigate]);
  const nextAction = useNextAction(navigateTo);
  // El hook se llama SIEMPRE, en todos los renders: lo que cambia con la vista
  // es su argumento, no si se lo invoca (ver el comentario de arriba sobre la
  // cantidad de hooks). Apagado fuera del Hub porque la portada sólo se dibuja
  // ahí, y simular una tanda de octavos con el Hub desmontado disparaba una
  // consulta de 80 filas por partido contra la misma conexión que los writes.
  const headlines = useRecentHeadlines(currentView === 'hub');
  // Suscripción, no getState(): el Hub tiene que re-renderizar cuando la lista
  // de modos termina de cargar.
  const modesLoaded = useModeStore((s) => s.isLoaded);
  const seasonStatus = useSeasonModeStore((s) => s.status);
  const seasonYear = useSeasonModeStore((s) => s.year);
  const seasonCurrentYear = useSeasonModeStore((s) => s.currentYear);
  const seasonTournaments = useSeasonModeStore((s) => s.tournaments);
  const hubDescriptor = useModeDescriptor();

  // Cabecera del Hub (título, fase, progreso, motivo de cierre): derivación pura
  // en `modes/`, igual que la navegación y la próxima acción. Acá sólo se leen
  // los stores.
  const hub = useMemo(
    () =>
      deriveHubHeader({
        descriptor: hubDescriptor,
        cycle: currentTournament,
        season: {
          status: seasonStatus,
          tournaments: seasonTournaments,
          year: seasonYear,
          currentYear: seasonCurrentYear,
        },
      }),
    [hubDescriptor, currentTournament, seasonStatus, seasonTournaments, seasonYear, seasonCurrentYear],
  );

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

  /**
   * Cargar la temporada del modo activo.
   *
   * Vive acá, con las demás cargas de arranque, y NO adentro de una vista: la
   * temporada es del MODO, no de una pantalla. Cuando la disparaba
   * `SeasonModeView` alcanzaba de casualidad, porque la raíz de un modo de
   * temporada era `'league'` y esa vista montaba al entrar; con el Hub como raíz
   * única, entrar al modo dejaba la temporada sin cargar para siempre ("Cargando…"
   * eterno, sin año y sin competiciones).
   *
   * La dependencia es el ID y no el objeto del modo: `loadForMode` no tiene guard
   * de reentrada, y el objeto se reemplaza por identidad cada vez que se reescribe
   * la lista de modos (`closeSeason`, por ejemplo, que además ya recarga sola).
   * Así se carga exactamente una vez por modo al que se entra —incluso si la lista
   * de modos resuelve después que el id, porque ahí el id efectivo pasa de null al
   * del modo— y se vuelve a cargar al cambiar de modo con la app abierta.
   */
  const seasonModeId =
    activeMode && descriptorForMode(activeMode).engine === 'season' ? activeMode.id : null;
  useEffect(() => {
    if (!seasonModeId) return;
    const mode = useModeStore.getState().activeMode();
    if (mode) useSeasonModeStore.getState().loadForMode(mode);
  }, [seasonModeId]);

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
      // El Hub va acá y no en `cycleViews` porque aplica a los dos motores y no
      // necesita `currentTournament`: un modo de temporada nunca tiene uno.
      hub: (
        <HubView
          title={hub.title}
          phaseLabel={hub.phaseLabel}
          progress={hub.progress}
          nextAction={nextAction}
          ladder={nav.sections.find((s) => s.key === 'competition')?.items ?? []}
          currentView={currentView}
          onSelectStep={(item) => {
            if (item.target.tab !== undefined) {
              useSeasonModeStore.getState().setActiveTab(item.target.tab);
            }
            handleNavigate(item.target.view);
          }}
          headlines={headlines}
          // Mientras la lista de modos no resuelva, el descriptor que tenemos es
          // el de arranque y la cabecera está describiendo un modo que capaz no
          // es el activo: eso también es "todavía no sé", no un cierre.
          idle={modesLoaded ? hub.idle : { kind: 'loading' }}
          onNewTournament={
            nav.engine === 'national-cycle' ? () => handleNavigate('tournaments') : undefined
          }
        />
      ),
      settings: <SettingsHub />,
      history: <MatchHistory teams={teams} />,
      comparison: <TeamComparison />,
      favorites: <FavoritesView />,
      tournaments: <TournamentHistory />,
      champions: <ChampionsHistory onNavigate={handleNavigate} />,
      league: <SeasonModeView onNavigate={handleNavigate} />,
    };
    if (shared[currentView]) return shared[currentView];
    if (!currentTournament) return <SeasonModeView onNavigate={handleNavigate} />;

    const cycleViews: Partial<Record<View, ReactNode>> = {
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
              <PeriodSelector />
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
