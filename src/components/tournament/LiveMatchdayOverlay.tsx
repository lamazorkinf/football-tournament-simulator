import { useLiveMatchdayStore, type LiveMatchdayEntry } from '../../store/useLiveMatchdayStore';
import { useMatchResultsStore } from '../../store/useMatchResultsStore';
import { useTournamentStore } from '../../store/useTournamentStore';
import { scoreAtMinute } from '../../core/liveMatch';
import { useLiveMatchdayPlayback, type LiveMatchdayPlaybackState } from '../../hooks/useLiveMatchdayPlayback';
import type { LiveSpeed } from '../../hooks/useLiveMatchPlayback';
import { Button } from '../ui/Button';
import { TeamFlag } from '../ui/TeamFlag';
import { Radio, Star, X } from 'lucide-react';
import type { Team } from '../../types';

const SPEEDS: LiveSpeed[] = [1, 2, 4];

/**
 * Overlay full-screen de la "jornada en vivo": una grilla de marcadores con
 * un único reloj compartido 0→90. Commit-then-replay: cuando la sesión se
 * abre, TODOS los resultados ya están comprometidos en el store; cerrar en
 * cualquier momento es seguro y muestra el resumen completo.
 */
export function LiveMatchdayOverlay() {
  const session = useLiveMatchdayStore((s) => s.session);
  const closeSession = useLiveMatchdayStore((s) => s.closeSession);
  const showResults = useMatchResultsStore((s) => s.showResults);
  const teams = useTournamentStore((s) => s.teams);

  const hasAnyPenalties = session?.entries.some((e) => e.timeline.penalties) ?? false;
  // La clave de sesión resetea el reloj al abrir una jornada nueva.
  const sessionKey = session ? session.title + session.entries.map((e) => e.matchId).join(',') : null;
  const playback = useLiveMatchdayPlayback(sessionKey, hasAnyPenalties);

  if (!session) return null;

  const finishAndShowSummary = () => {
    closeSession();
    showResults(session.allResults, session.title);
  };

  const clockLabel =
    playback.phase === 'finished' ? 'FINAL' : playback.phase === 'penalties' ? 'PENALES' : `${playback.minute}'`;

  // Con pocas tarjetas (semis, final) una grilla ancha se ve vacía.
  const gridCols =
    session.entries.length <= 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : session.entries.length <= 4
        ? 'grid-cols-1 sm:grid-cols-2'
        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

  return (
    <div className="fixed inset-0 z-50 bg-black/90 overflow-y-auto">
      {/* Header sticky: estado + reloj compartido + controles */}
      <div className="sticky top-0 z-10 bg-grass-dark border-b-4 border-grass px-4 py-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <div className="flex flex-wrap items-center justify-between gap-3 max-w-7xl mx-auto">
          <span className="flex items-center gap-2 text-gold font-arcade text-xs uppercase min-w-0">
            <Radio className="w-4 h-4 flex-shrink-0 animate-pulse" />
            <span className="truncate">En vivo — {session.title}</span>
          </span>

          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-arcade text-sm text-gold tabular-nums min-w-[70px] text-center">
              {clockLabel}
            </span>
            <div className="flex items-center gap-1">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => playback.setSpeed(s)}
                  className={`px-2 py-1 min-h-9 font-arcade text-[10px] border-2 transition-colors ${
                    playback.speed === s ? 'bg-grass text-white border-line' : 'text-grass-soft border-grass'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
            {playback.phase !== 'finished' && (
              <Button variant="outline" size="sm" onClick={playback.skipToEnd}>
                Saltar al final
              </Button>
            )}
            <button
              onClick={finishAndShowSummary}
              aria-label="Cerrar"
              className="text-grass-soft hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Grilla de marcadores */}
      <div className="max-w-7xl mx-auto p-4 space-y-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div className={`grid ${gridCols} gap-3`}>
          {session.entries.map((entry) => (
            <LiveGridCard key={entry.matchId} entry={entry} teams={teams} playback={playback} />
          ))}
        </div>

        {session.hiddenCount > 0 && (
          <p className="text-center text-grass-soft text-xs">
            +{session.hiddenCount} partidos más de la jornada simulados en segundo plano
          </p>
        )}

        {playback.phase === 'finished' && (
          <div className="flex justify-center pt-2">
            <Button variant="primary" onClick={finishAndShowSummary}>
              Ver resumen de la jornada
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function LiveGridCard({
  entry,
  teams,
  playback,
}: {
  entry: LiveMatchdayEntry;
  teams: Team[];
  playback: LiveMatchdayPlaybackState;
}) {
  const home = teams.find((t) => t.id === entry.homeTeamId);
  const away = teams.find((t) => t.id === entry.awayTeamId);
  const score = scoreAtMinute(entry.timeline, playback.minute);
  const justScored = score.lastGoalMinute === playback.minute && playback.phase === 'playing';
  const showPenalties = playback.penaltiesRevealed && entry.timeline.penalties;

  return (
    <div
      className={`bg-grass-dark border-2 p-3 space-y-2 transition-colors ${
        entry.isFavorite ? 'border-gold' : 'border-grass'
      }`}
    >
      {/* Contexto */}
      <div className="flex items-center gap-2 overflow-hidden">
        {entry.isFavorite && <Star className="w-3.5 h-3.5 text-gold fill-gold flex-shrink-0" />}
        <span className="text-[11px] text-grass-soft truncate">
          {entry.region ? `${entry.region} • ` : ''}
          {entry.groupName}
        </span>
      </div>

      {/* Equipos + marcador */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {home && <TeamFlag teamId={home.id} teamName={home.name} flagUrl={home.flag} size={24} />}
          <span className="font-arcade text-[10px] text-white uppercase truncate">
            {home?.id.toUpperCase() ?? entry.homeTeamId}
          </span>
        </div>
        <span
          className={`font-terminal text-2xl tabular-nums whitespace-nowrap px-1 ${
            justScored ? 'text-gold animate-pulse' : 'text-led'
          }`}
        >
          {score.homeScore} - {score.awayScore}
        </span>
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <span className="font-arcade text-[10px] text-white uppercase truncate">
            {away?.id.toUpperCase() ?? entry.awayTeamId}
          </span>
          {away && <TeamFlag teamId={away.id} teamName={away.name} flagUrl={away.flag} size={24} />}
        </div>
      </div>

      {/* Pie: último gol o penales */}
      <div className="text-[11px] text-grass-soft min-h-4">
        {showPenalties ? (
          <span className="text-gold font-arcade text-[10px]">
            PEN {entry.timeline.penalties!.homeScore}-{entry.timeline.penalties!.awayScore}
          </span>
        ) : score.lastGoalMinute !== null ? (
          <span>⚽ {score.lastGoalMinute}'</span>
        ) : (
          <span>Sin goles</span>
        )}
      </div>
    </div>
  );
}
