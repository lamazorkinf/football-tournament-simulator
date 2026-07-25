import { useLiveMatchdayStore, type LiveMatchdayEntry } from '../../store/useLiveMatchdayStore';
import { useMatchResultsStore } from '../../store/useMatchResultsStore';
import { useTournamentStore } from '../../store/useTournamentStore';
import { getEngineConfig } from '../../store/useConfigStore';
import { scoreAtMinute } from '../../core/liveMatch';
import {
  useLiveMatchdayPlayback,
  REGULATION_MINUTES,
  EXTRA_TIME_MINUTES,
  type LiveMatchdayPlaybackState,
} from '../../hooks/useLiveMatchdayPlayback';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { LiveSpeed } from '../../hooks/useLiveMatchPlayback';
import { Button } from '../ui/Button';
import { TeamFlag } from '../ui/TeamFlag';
import { Pause, Play, Radio, Star, X } from 'lucide-react';
import { useEffect } from 'react';
import type { Team } from '../../types';

const SPEEDS: LiveSpeed[] = [1, 2, 4];

/**
 * Overlay full-screen de la "jornada en vivo": una grilla de marcadores con
 * un único reloj compartido 0→90 (0→120 si algún partido de la grilla fue a
 * alargue). Commit-then-replay: cuando la sesión se abre, TODOS los
 * resultados ya están comprometidos en el store; cerrar en cualquier momento
 * es seguro y muestra el resumen completo.
 */
export function LiveMatchdayOverlay() {
  const session = useLiveMatchdayStore((s) => s.session);
  const closeSession = useLiveMatchdayStore((s) => s.closeSession);
  const showResults = useMatchResultsStore((s) => s.showResults);
  const teams = useTournamentStore((s) => s.teams);

  const hasAnyPenalties = session?.entries.some((e) => e.timeline.penalties) ?? false;
  // Si UN SOLO partido de la grilla fue a alargue, el reloj compartido llega
  // a 120 en vez de a 90: todas las tarjetas esperan juntas a que termine.
  const hasAnyExtraTime = session?.entries.some((e) => e.timeline.hasExtraTime) ?? false;
  // La clave de sesión resetea el reloj al abrir una jornada nueva. El espacio
  // separa el título de la lista de ids: evita que un título terminado en
  // dígitos colisione con el primer matchId al concatenar la clave.
  const sessionKey = session
    ? `${session.title} ${session.entries.map((e) => e.matchId).join(',')}`
    : null;
  const playback = useLiveMatchdayPlayback(sessionKey, hasAnyPenalties, hasAnyExtraTime);
  const trapRef = useFocusTrap<HTMLDivElement>(Boolean(session));

  // Cierre con Escape y bloqueo del scroll del fondo, como el resto de los
  // modales. Cerrar en cualquier momento es seguro: los resultados ya están
  // comprometidos y salir muestra el resumen completo.
  useEffect(() => {
    if (!session) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      closeSession();
      showResults(session.allResults, session.title);
    };
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [session, closeSession, showResults]);

  if (!session) return null;

  const finishAndShowSummary = () => {
    closeSession();
    showResults(session.allResults, session.title);
  };

  const clockLabel =
    playback.phase === 'finished' ? 'FINAL' : playback.phase === 'penalties' ? 'PENALES' : `${playback.minute}'`;

  // Con pocas tarjetas (semis, final) una grilla ancha se ve vacía.
  const gridCols =
    session.entries.length <= 4
      ? 'grid-cols-1 sm:grid-cols-2'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`En vivo — ${session.title}`}
      ref={trapRef}
      tabIndex={-1}
    >
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
              <>
                <button
                  onClick={playback.togglePause}
                  aria-label={playback.isPaused ? 'Reanudar' : 'Pausar'}
                  className="px-2 py-1 min-h-9 border-2 border-grass text-grass-soft hover:text-white hover:bg-grass/40 transition-colors"
                >
                  {playback.isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
                <Button variant="outline" size="sm" onClick={playback.skipToEnd}>
                  Saltar al final
                </Button>
              </>
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
  const hasGoals = score.homeGoalMinutes.length > 0 || score.awayGoalMinutes.length > 0;

  // Energía de ENTRADA de cada equipo, la que resolvió `buildEnergyContext`
  // al simular (viaja desde el store por `MatchdayOutcome` →
  // `LiveMatchdayEntry`, ver useLiveMatchdayStore.ts). NO se lee de
  // `cycle.energy`: para cuando esta tarjeta se muestra, commit-then-replay
  // ya comprometió el partido, así que el ciclo tiene la energía POSTERIOR
  // al costo del partido (sistemáticamente menor, el costo resta 6 como
  // mínimo). El criterio es que en pantalla el partido "se sigue jugando",
  // así que corresponde mostrar con cuánta energía llegaron, no con cuánta
  // quedaron.
  const fatigueEnabled = getEngineConfig().fatigue.enabled;
  const { homeEnergy, awayEnergy } = entry;

  // El "FINAL" de CADA tarjeta se decide con el minuto de cierre de SU
  // partido, no con la fase del reloj compartido: si otro partido de la
  // grilla fue a alargue, el reloj sigue corriendo hasta el 120 aunque este
  // ya haya terminado a los 90. Si el partido definió por penales, esperamos
  // al mismo reveal compartido que ya usa el badge "PEN" (es un evento único
  // de toda la sesión, no por tarjeta).
  const ownFinalMinute = entry.timeline.hasExtraTime ? EXTRA_TIME_MINUTES : REGULATION_MINUTES;
  const isCardFinal = entry.timeline.penalties
    ? playback.penaltiesRevealed
    : playback.minute >= ownFinalMinute;

  // Quién va ganando ahora mismo. Con penales manda el punto: un 1-1 que se
  // definió desde los doce pasos no es empate.
  const pens = showPenalties ? entry.timeline.penalties! : null;
  const homeLeads = pens ? pens.homeScore > pens.awayScore : score.homeScore > score.awayScore;
  const awayLeads = pens ? pens.awayScore > pens.homeScore : score.awayScore > score.homeScore;
  const teamClass = (leads: boolean) =>
    `font-arcade text-[10px] uppercase truncate ${leads ? 'text-led' : 'text-white'}`;

  // Los minutos van del lado del equipo que marcó; el del minuto en curso se
  // resalta para que se note quién acaba de convertir.
  const minuteList = (minutes: number[]) =>
    minutes.map((min, i) => (
      <span
        key={`${min}-${i}`}
        className={min === playback.minute && playback.phase === 'playing' ? 'text-gold' : undefined}
      >
        {min}'
      </span>
    ));

  return (
    <div
      data-testid="live-card"
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
        {/* Con 20 tarjetas, el reloj del header no alcanza para saber si lo que
            estás viendo es el resultado definitivo — y con alargue mixto en
            la grilla, la fase global tampoco: puede seguir en 'playing' por
            OTRO partido mientras este ya cerró su propio marcador. */}
        {isCardFinal && (
          <span className="ml-auto font-arcade text-[9px] text-gold flex-shrink-0">FINAL</span>
        )}
      </div>

      {/* Equipos + marcador */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {home && <TeamFlag teamId={home.id} teamName={home.name} size={24} />}
          <span className={teamClass(homeLeads)}>{home?.id.toUpperCase() ?? entry.homeTeamId}</span>
          {fatigueEnabled && (
            <span className="text-[10px] text-grass-soft tabular-nums flex-shrink-0">
              {Math.round(homeEnergy)}%
            </span>
          )}
        </div>
        <span
          className={`font-terminal text-2xl tabular-nums whitespace-nowrap px-1 ${
            justScored ? 'text-gold animate-pulse' : 'text-led'
          }`}
        >
          {score.homeScore} - {score.awayScore}
        </span>
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          {fatigueEnabled && (
            <span className="text-[10px] text-grass-soft tabular-nums flex-shrink-0">
              {Math.round(awayEnergy)}%
            </span>
          )}
          <span className={teamClass(awayLeads)}>{away?.id.toUpperCase() ?? entry.awayTeamId}</span>
          {away && <TeamFlag teamId={away.id} teamName={away.name} size={24} />}
        </div>
      </div>

      {/* Pie: los goles de cada equipo de su lado del marcador (+ penales) */}
      <div className="flex items-start justify-between gap-2 text-[11px] text-grass-soft min-h-4">
        {score.homeGoalMinutes.length > 0 ? (
          <span
            className="flex flex-1 min-w-0 flex-wrap items-center gap-x-1"
            aria-label={`Goles de ${home?.name ?? entry.homeTeamId}`}
          >
            <span aria-hidden="true">⚽</span>
            {minuteList(score.homeGoalMinutes)}
          </span>
        ) : (
          <span className="flex-1" />
        )}

        {showPenalties ? (
          <span className="text-gold font-arcade text-[10px] flex-shrink-0">
            PEN {entry.timeline.penalties!.homeScore}-{entry.timeline.penalties!.awayScore}
          </span>
        ) : hasGoals ? null : (
          <span className="flex-shrink-0">Sin goles</span>
        )}

        {score.awayGoalMinutes.length > 0 ? (
          <span
            className="flex flex-1 min-w-0 flex-wrap items-center justify-end gap-x-1"
            aria-label={`Goles de ${away?.name ?? entry.awayTeamId}`}
          >
            {minuteList(score.awayGoalMinutes)}
            <span aria-hidden="true">⚽</span>
          </span>
        ) : (
          <span className="flex-1" />
        )}
      </div>
    </div>
  );
}
