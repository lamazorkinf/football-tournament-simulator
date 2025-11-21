import { useEffect, useState } from 'react';
import { useTournamentStore } from './store/useTournamentStore';
import { useSidebarCollapse } from './hooks/useSidebarCollapse';
import { StatsDashboard } from './components/tournament/StatsDashboard';
import { MatchHistory } from './components/tournament/MatchHistory';
import { MatchCenter } from './components/tournament/MatchCenter';
import { TournamentOverview } from './components/tournament/TournamentOverview';
import { TournamentWizard } from './components/tournament/TournamentWizard';
import { SettingsHub } from './components/settings/SettingsHub';
import { TeamComparison } from './components/comparison/TeamComparison';
import { QualifiersView } from './components/tournament/QualifiersView';
import { WorldCupViewEnhanced } from './components/tournament/WorldCupViewEnhanced';
import { TournamentHistory } from './components/tournament/TournamentHistory';
import { MobileDrawer } from './components/ui/MobileDrawer';
import { Sidebar } from './components/ui/Sidebar';
import { TournamentSelector } from './components/ui/TournamentSelector';
import { Menu } from 'lucide-react';

type View = 'overview' | 'wizard' | 'qualifiers' | 'worldcup' | 'stats' | 'settings' | 'history' | 'matches' | 'comparison' | 'tournaments';

function App() {
  const {
    teams,
    currentTournament,
    loadTeamsFromDatabase,
    initializeTournament,
  } = useTournamentStore();

  const { isCollapsed } = useSidebarCollapse();
  const [currentView, setCurrentView] = useState<View>('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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

  // Load teams from database on mount
  useEffect(() => {
    loadTeamsFromDatabase();
  }, [loadTeamsFromDatabase]);

  // Initialize tournament after teams are loaded
  useEffect(() => {
    if (!currentTournament) {
      initializeTournament();
    }
  }, [currentTournament, initializeTournament]);

  if (!currentTournament) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading tournament...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Drawer */}
      <MobileDrawer
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        currentView={currentView}
        onViewChange={(view) => setCurrentView(view)}
      />

      {/* Desktop Sidebar */}
      <Sidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        tournamentYear={currentTournament.year}
      />

      {/* Main content area with dynamic left margin based on sidebar state */}
      <div className={`transition-all duration-300 ${isCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        {/* Mobile Header */}
        <header className="lg:hidden bg-white shadow-sm border-b border-gray-200 sticky top-0 z-30">
          <div className="px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <button
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                >
                  <Menu className="w-6 h-6 text-gray-700" />
                </button>
                <div className="min-w-0 flex-1">
                  <h1 className="text-lg font-bold text-gray-900 truncate">
                    {currentTournament.name}
                  </h1>
                  <p className="text-xs text-gray-600 truncate">
                    World Cup Simulator
                  </p>
                </div>
              </div>
              <div className="ml-4 flex-shrink-0">
                <TournamentSelector />
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 sm:px-6 lg:px-8 py-6">
        {currentView === 'overview' ? (
          <TournamentOverview
            tournament={currentTournament}
            teams={teams}
            onNavigate={(view) => setCurrentView(view as View)}
          />
        ) : currentView === 'wizard' ? (
          <TournamentWizard />
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
          <WorldCupViewEnhanced />
        ) : currentView === 'qualifiers' ? (
          <QualifiersView
            initialRegion={viewOptions.region}
            initialGroupId={viewOptions.groupId}
          />
        ) : currentView === 'tournaments' ? (
          <TournamentHistory />
        ) : null}
        </main>

        <footer className="bg-white border-t border-gray-200 mt-12">
          <div className="px-4 sm:px-6 lg:px-8 py-6 text-center text-gray-600 text-sm">
            <p>Football Tournament Simulator - World Cup Edition</p>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
