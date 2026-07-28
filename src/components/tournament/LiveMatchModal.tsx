import { useEffect, useRef, useState } from 'react';
import { useLiveMatchStore } from '../../store/useLiveMatchStore';
import { useTournamentStore } from '../../store/useTournamentStore';
import { useSeasonModeStore } from '../../store/useSeasonModeStore';
import { buildMatchTimeline, hashSeed, type LiveTimeline } from '../../core/liveMatch';
import { useLiveMatchPlayback, type LiveSpeed } from '../../hooks/useLiveMatchPlayback';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from '../ui/Button';
import { TeamFlag } from '../ui/TeamFlag';
import { Pause, Play, Radio, X } from 'lucide-react';
import type { SimulatedMatchOutcome } from '../../types';

const SPEEDS: LiveSpeed[] = [1, 2, 4];

export function LiveMatchModal() {
  const activeMatch = useLiveMatchStore((s) => s.activeMatch);
  const closeLiveMatch = useLiveMatchStore((s) => s.closeLiveMatch);
  const teams = useTournamentStore((s) => s.teams);
  const simulateMatch = useTournamentStore((s) => s.simulateMatch);
  const simulateKnockoutMatch = useTournamentStore((s) => s.simulateKnockoutMatch);
  const simulateContinentalMatch = useTournamentStore((s) => s.simulateContinentalMatch);
  const simulateConfederationsMatch = useTournamentStore((s) => s.simulateConfederationsMatch);

  const [timeline, setTimeline] = useState<LiveTimeline | null>(null);
  const [failed, setFailed] = useState(false);
  const startedRef = useRef<string | null>(null);

  const playback = useLiveMatchPlayback(timeline, 1);
  const trapRef = useFocusTrap<HTMLDivElement>(Boolean(activeMatch));

  // Reset durante el render al cambiar de partido: evita el frame donde el
  // timeline del partido anterior se mostraría con los equipos del nuevo.
  const [prevMatchId, setPrevMatchId] = useState<string | null>(activeMatch?.matchId ?? null);
  const currentMatchId = activeMatch?.matchId ?? null;
  if (currentMatchId !== prevMatchId) {
    setPrevMatchId(currentMatchId);
    setTimeline(null);
    setFailed(false);
  }

  useEffect(() => {
    if (!activeMatch) {
      startedRef.current = null;
      return;
    }
    // Dispara la simulación una sola vez por partido (evita doble efecto).
    if (startedRef.current === activeMatch.matchId) return;
    startedRef.current = activeMatch.matchId;

    const run = async () => {
      const matchId = activeMatch.matchId;
      let outcome: SimulatedMatchOutcome | null = null;
      switch (activeMatch.kind) {
        case 'qualifier':
        case 'world-cup':
          outcome = await simulateMatch(activeMatch.matchId, activeMatch.groupId ?? '', activeMatch.kind);
          break;
        case 'knockout':
          outcome = await simulateKnockoutMatch(activeMatch.matchId);
          break;
        case 'continental':
          outcome = await simulateContinentalMatch(activeMatch.matchId);
          break;
        case 'confederations':
          outcome = await simulateConfederationsMatch(activeMatch.matchId);
          break;
        case 'season':
          // Los modos de temporada tienen su propio store; el partido puede ser
          // de liga, de grupos o un partido de un cruce (la ida o la vuelta).
          outcome = activeMatch.tournamentId
            ? await useSeasonModeStore
                .getState()
                .simulateMatch(activeMatch.tournamentId, activeMatch.matchId)
            : null;
          break;
      }
      // Si mientras la simulación estaba en vuelo se cerró/abrió otro partido,
      // descartamos el resultado: pintar acá pisaría el timeline del partido
      // que ahora está activo (o mostraría datos de un modal ya cerrado).
      if (startedRef.current !== matchId) return;
      if (!outcome) {
        setFailed(true);
        return;
      }
      setTimeline(
        buildMatchTimeline({
          homeScore: outcome.homeScore,
          awayScore: outcome.awayScore,
          seed: hashSeed(matchId),
          penalties: outcome.penalties,
          extraTime: outcome.extraTime,
        }),
      );
    };
    void run();
  }, [activeMatch, simulateMatch, simulateKnockoutMatch, simulateContinentalMatch, simulateConfederationsMatch]);

  // Cierre con Escape y bloqueo del scroll del fondo, como el resto de los
  // modales. El partido ya está simulado y guardado: cerrar antes de los 90'
  // solo se saltea la reproducción.
  useEffect(() => {
    if (!activeMatch) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLiveMatch();
    };
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [activeMatch, closeLiveMatch]);

  if (!activeMatch) return null;

  const home = teams.find((t) => t.id === activeMatch.homeTeamId);
  const away = teams.find((t) => t.id === activeMatch.awayTeamId);
  const clockLabel =
    playback.phase === 'finished' ? 'FINAL' : playback.phase === 'penalties' ? 'PENALES' : `${playback.minute}'`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`En vivo — ${home?.name ?? activeMatch.homeTeamId} vs ${away?.name ?? activeMatch.awayTeamId}`}
      ref={trapRef}
      tabIndex={-1}
    >
      <div className="w-full max-w-lg bg-grass-dark border-4 border-line shadow-hard-panel p-6 space-y-6">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-gold font-arcade text-xs uppercase">
            <Radio className="w-4 h-4" /> En vivo
          </span>
          <button onClick={closeLiveMatch} aria-label="Cerrar" className="text-grass-soft hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {failed ? (
          <p className="text-center text-grass-soft py-8">No se pudo simular el partido.</p>
        ) : !timeline ? (
          <p className="text-center text-grass-soft py-8 font-arcade text-xs">Simulando…</p>
        ) : (
          <>
            <div className="flex items-center justify-center gap-4">
              <div className="flex flex-col items-center gap-1 w-24">
                {home && <TeamFlag teamId={home.id} teamName={home.name} size={32} />}
                <span className="font-arcade text-[10px] text-white text-center uppercase truncate w-full">
                  {home?.name ?? activeMatch.homeTeamId}
                </span>
              </div>
              <div className="font-terminal text-4xl text-led tabular-nums whitespace-nowrap">
                {`${playback.displayHomeScore} - ${playback.displayAwayScore}`}
              </div>
              <div className="flex flex-col items-center gap-1 w-24">
                {away && <TeamFlag teamId={away.id} teamName={away.name} size={32} />}
                <span className="font-arcade text-[10px] text-white text-center uppercase truncate w-full">
                  {away?.name ?? activeMatch.awayTeamId}
                </span>
              </div>
            </div>

            <div className="text-center font-arcade text-xs text-gold">{clockLabel}</div>

            {playback.penalties && (
              <p className="text-center text-grass-soft text-sm">
                Penales {playback.penalties.homeScore}-{playback.penalties.awayScore}
              </p>
            )}

            <div className="max-h-40 overflow-y-auto space-y-1">
              {playback.revealedGoals.length === 0 ? (
                <p className="text-center text-grass-soft text-xs">Sin goles aún</p>
              ) : (
                playback.revealedGoals.map((g, i) => {
                  const scorer = g.side === 'home' ? home : away;
                  return (
                    <div key={i} className="flex items-center gap-2 text-sm text-white">
                      <span className="font-terminal text-gold tabular-nums w-8">{g.minute}'</span>
                      <span>⚽ {scorer?.name ?? (g.side === 'home' ? activeMatch.homeTeamId : activeMatch.awayTeamId)}</span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
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
              {playback.phase === 'finished' ? (
                <Button variant="primary" size="sm" onClick={closeLiveMatch}>
                  Cerrar
                </Button>
              ) : (
                <div className="flex items-center gap-2">
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
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
