import { createContext, useContext, useState, useMemo, useCallback } from 'react';
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

  const openTeamProfile = useCallback((team: Team) => {
    setSelectedTeam(team);
  }, []);

  const closeTeamProfile = useCallback(() => {
    setSelectedTeam(null);
  }, []);

  // Memoizar el value: TeamProfileProvider es el nodo raíz, así que recrearlo
  // en cada render re-renderizaba toda la app al abrir/cerrar cualquier perfil.
  const value = useMemo(
    () => ({ openTeamProfile, closeTeamProfile }),
    [openTeamProfile, closeTeamProfile]
  );

  return (
    <TeamProfileContext.Provider value={value}>
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
