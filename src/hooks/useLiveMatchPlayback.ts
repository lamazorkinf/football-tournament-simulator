import { useCallback, useEffect, useState } from 'react';
import type { LiveGoalEvent, LivePenaltiesResult, LiveTimeline } from '../core/liveMatch';

export type LivePhase = 'playing' | 'penalties' | 'finished';
export type LiveSpeed = 1 | 2 | 4;

const MATCH_MINUTES = 90;
const PENALTY_REVEAL_MS = 900;

export interface LivePlaybackState {
  phase: LivePhase;
  minute: number;
  displayHomeScore: number;
  displayAwayScore: number;
  revealedGoals: LiveGoalEvent[];
  penalties?: LivePenaltiesResult;
  speed: LiveSpeed;
  setSpeed: (s: LiveSpeed) => void;
  skipToEnd: () => void;
}

export function useLiveMatchPlayback(
  timeline: LiveTimeline | null,
  initialSpeed: LiveSpeed = 1,
): LivePlaybackState {
  const [minute, setMinute] = useState(0);
  const [phase, setPhase] = useState<LivePhase>('playing');
  const [penaltiesShown, setPenaltiesShown] = useState(false);
  const [speed, setSpeed] = useState<LiveSpeed>(initialSpeed);

  // Reset durante el render al recibir un timeline nuevo (patrón React
  // "adjusting state when a prop changes"): evita el frame intermedio donde
  // el minuto viejo revelaría goles del partido nuevo.
  const [prevTimeline, setPrevTimeline] = useState<LiveTimeline | null>(timeline);
  if (timeline !== prevTimeline) {
    setPrevTimeline(timeline);
    setMinute(0);
    setPhase('playing');
    setPenaltiesShown(false);
  }

  // Reloj: incrementa el minuto mientras se juega.
  useEffect(() => {
    if (!timeline || phase !== 'playing') return;
    const id = setInterval(() => {
      setMinute((prev) => (prev + 1 >= MATCH_MINUTES ? MATCH_MINUTES : prev + 1));
    }, 1000 / speed);
    return () => clearInterval(id);
  }, [timeline, phase, speed]);

  // Transición al llegar a los 90'. Reacciona al reloj externo (setInterval
  // de arriba), no es estado derivable en el render.
  useEffect(() => {
    if (!timeline || phase !== 'playing') return;
    if (minute >= MATCH_MINUTES) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase(timeline.penalties ? 'penalties' : 'finished');
    }
  }, [minute, timeline, phase]);

  // Suspenso de penales y cierre.
  useEffect(() => {
    if (phase !== 'penalties') return;
    const id = setTimeout(() => {
      setPenaltiesShown(true);
      setPhase('finished');
    }, PENALTY_REVEAL_MS / speed);
    return () => clearTimeout(id);
  }, [phase, speed]);

  const skipToEnd = useCallback(() => {
    if (!timeline) return;
    setMinute(MATCH_MINUTES);
    setPenaltiesShown(Boolean(timeline.penalties));
    setPhase('finished');
  }, [timeline]);

  const revealedGoals = timeline ? timeline.goals.filter((g) => g.minute <= minute) : [];
  const last = revealedGoals[revealedGoals.length - 1];

  return {
    phase,
    minute,
    displayHomeScore: last ? last.homeScore : 0,
    displayAwayScore: last ? last.awayScore : 0,
    revealedGoals,
    penalties: penaltiesShown ? timeline?.penalties : undefined,
    speed,
    setSpeed,
    skipToEnd,
  };
}
