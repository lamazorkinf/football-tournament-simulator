import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { Team } from '../types';
import { TeamProfileModal } from '../components/tournament/TeamProfileModal';

interface TeamProfileContextType {
  openTeamProfile: (team: Team) => void;
  closeTeamProfile: () => void;
}

const TeamProfileContext = createContext<TeamProfileContextType | undefined>(undefined);

export function TeamProfileProvider({ children }: { children: ReactNode }) {
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  const openTeamProfile = (team: Team) => {
    setSelectedTeam(team);
  };

  const closeTeamProfile = () => {
    setSelectedTeam(null);
  };

  return (
    <TeamProfileContext.Provider value={{ openTeamProfile, closeTeamProfile }}>
      {children}
      {selectedTeam && <TeamProfileModal team={selectedTeam} onClose={closeTeamProfile} />}
    </TeamProfileContext.Provider>
  );
}

export function useTeamProfile() {
  const context = useContext(TeamProfileContext);
  if (context === undefined) {
    throw new Error('useTeamProfile must be used within a TeamProfileProvider');
  }
  return context;
}
