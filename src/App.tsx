import { useEffect, useState } from 'react';
import { useTournamentStore } from './store/useTournamentStore';
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
import { LiveMatchModal } from './components/tournament/LiveMatchModal';
import { Sidebar } from './components/ui/Sidebar';
import { TournamentSelector } from './components/ui/TournamentSelector';
import { ProgressModal } from './components/ui/ProgressModal';
import { Scanlines } from './components/ui/Scanlines';
import { ToastContainer } from './components/ui/ToastContainer';
import { MatchResultsModal } from './components/ui/MatchResultsModal';
import { GameTabBar } from './components/ui/GameTabBar';
import { PauseMenu } from './components/ui/PauseMenu';
import { ActionDock } from './components/ui/ActionDock';
import { MobileActionProvider } from './hooks/useMobileAction';

type View = 'wizard' | 'qualifiers' | 'worldcup' | 'stats' | 'settings' | 'history' | 'matches' | 'comparison' | 'tournaments' | 'champions' | 'continental' | 'confederations';

function App() {
  const {
    teams,
    currentTournament,
    loadTeamsFromDatabase,
    initializeTournament,
  } = useTournamentStore();

  const { isCollapsed } = useSidebarCollapse();
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
  useEffect(() => {
    loadTeamsFromDatabase();
  }, [loadTeamsFromDatabase]);

  // Reconcile local ↔ DB on mount: initializeTournament ahora reconcilia por
  // recencia (no crea a ciegas) y es idempotente vía initializationInFlight,
  // así que se llama incondicionalmente. Con currentTournament ya rehidratado
  // desde localStorage, esta llamada es la que trae el estado más reciente de
  // la DB (p. ej. lo jugado en otro dispositivo) y actualiza la vista.
  useEffect(() => {
    initializeTournament();
  }, [initializeTournament]);

  if (!currentTournament) {
    return (
      <>
        <Scanlines />
        <div className="min-h-screen flex items-center justify-center bg-night">
          <div className="text-center">
            <p className="font-arcade text-gold blink text-sm">LOADING…</p>
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

      {/* Desktop Sidebar */}
      <Sidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        tournamentYear={currentTournament.year}
      />

      {/* Main content area with dynamic left margin based on sidebar state */}
      <div className={`transition-all duration-300 pb-[calc(9rem+env(safe-area-inset-bottom))] lg:pb-0 ${isCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        {/* Mobile Header */}
        <header className="lg:hidden bg-grass-dark border-b-4 border-grass sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
          <div className="px-4 py-2 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="font-arcade text-xs text-white text-shadow-retro truncate">
                {currentTournament.name}
              </h1>
            </div>
            <div className="flex-shrink-0">
              <TournamentSelector />
            </div>
          </div>
        </header>

        <main className="px-4 sm:px-6 lg:px-8 py-6">
        {currentView === 'wizard' ? (
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
          />
        ) : currentView === 'tournaments' ? (
          <TournamentHistory />
        ) : currentView === 'champions' ? (
          <ChampionsHistory />
        ) : currentView === 'continental' ? (
          <ContinentalView cycle={currentTournament} teams={teams} />
        ) : currentView === 'confederations' ? (
          <ConfederationsCupView cycle={currentTournament} teams={teams} />
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
