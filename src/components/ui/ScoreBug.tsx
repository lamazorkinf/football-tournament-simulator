import type { Team } from '../../types';
import { TeamFlag } from './TeamFlag';
import { TeamNameTooltip } from './TeamNameTooltip';

interface ScoreBugProps {
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number | null;
  awayScore: number | null;
  size?: 'narrow' | 'md' | 'lg';
}

export function ScoreBug({ homeTeam, awayTeam, homeScore, awayScore, size = 'md' }: ScoreBugProps) {
  const played = homeScore !== null && awayScore !== null;
  const flagSize = size === 'lg' ? 32 : 24;
  const digits = size === 'lg' ? 'text-2xl px-4 py-2' : 'text-base px-3 py-1.5';
  const code = size === 'lg' ? 'text-sm' : 'text-[10px]';

  if (size === 'narrow') {
    return (
      <div className="bg-grass-dark border-4 border-line shadow-hard-panel px-3 py-2 space-y-2 w-full">
        <div className="flex items-center justify-between gap-2 font-arcade text-[10px]">
          <span className="flex items-center gap-2 min-w-0">
            <TeamFlag teamId={homeTeam.id} teamName={homeTeam.name} flagUrl={homeTeam.flag} size={24} />
            <TeamNameTooltip teamName={homeTeam.name}>
              <span>{homeTeam.id.toUpperCase()}</span>
            </TeamNameTooltip>
          </span>
          <span className="flex items-center gap-2 min-w-0">
            <TeamNameTooltip teamName={awayTeam.name}>
              <span>{awayTeam.id.toUpperCase()}</span>
            </TeamNameTooltip>
            <TeamFlag teamId={awayTeam.id} teamName={awayTeam.name} flagUrl={awayTeam.flag} size={24} />
          </span>
        </div>
        <div className="bg-black border-2 border-line font-arcade text-led tabular-nums text-center text-xl py-1">
          {played ? `${homeScore}-${awayScore}` : 'VS'}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 bg-grass-dark border-4 border-line shadow-hard-panel px-4 py-3">
      <div className={`flex flex-1 items-center gap-2 font-arcade ${code}`}>
        <TeamFlag teamId={homeTeam.id} teamName={homeTeam.name} flagUrl={homeTeam.flag} size={flagSize} />
        <TeamNameTooltip teamName={homeTeam.name}>
          <span>{homeTeam.id.toUpperCase()}</span>
        </TeamNameTooltip>
      </div>
      <div className={`bg-black border-2 border-line font-arcade text-led tabular-nums ${digits}`}>
        {played ? `${homeScore}-${awayScore}` : 'VS'}
      </div>
      <div className={`flex flex-1 items-center justify-end gap-2 font-arcade ${code}`}>
        <TeamNameTooltip teamName={awayTeam.name}>
          <span>{awayTeam.id.toUpperCase()}</span>
        </TeamNameTooltip>
        <TeamFlag teamId={awayTeam.id} teamName={awayTeam.name} flagUrl={awayTeam.flag} size={flagSize} />
      </div>
    </div>
  );
}
