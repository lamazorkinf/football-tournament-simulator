import { useTeamProfile } from '../../hooks/useTeamProfile';
import type { Team } from '../../types';

interface ClickableTeamNameProps {
  team: Team;
  children: React.ReactNode;
  className?: string;
}

export function ClickableTeamName({ team, children, className = '' }: ClickableTeamNameProps) {
  const { openTeamProfile } = useTeamProfile();

  return (
    <span
      onClick={() => openTeamProfile(team)}
      className={`cursor-pointer hover:text-primary-600 hover:underline transition-colors ${className}`}
      title={`Ver perfil de ${team.name}`}
    >
      {children}
    </span>
  );
}
