import { Button } from '../ui/Button';
import { Radio } from 'lucide-react';
import { useLiveMatchStore, type LiveMatchKind } from '../../store/useLiveMatchStore';

interface WatchLiveButtonProps {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  kind: LiveMatchKind;
  groupId?: string;
  disabled?: boolean;
  className?: string;
}

export function WatchLiveButton({
  matchId,
  homeTeamId,
  awayTeamId,
  kind,
  groupId,
  disabled = false,
  className,
}: WatchLiveButtonProps) {
  const openLiveMatch = useLiveMatchStore((s) => s.openLiveMatch);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        openLiveMatch({ matchId, homeTeamId, awayTeamId, kind, groupId });
      }}
      className={`gap-1 ${className ?? ''}`}
    >
      <Radio className="w-3 h-3" /> Ver en vivo
    </Button>
  );
}
