import { useCallback, useEffect, useState } from 'react';
import type { LivePhase, LiveSpeed } from './useLiveMatchPlayback';

const MATCH_MINUTES = 90;
const PENALTY_REVEAL_MS = 1200;

export interface LiveMatchdayPlaybackState {
  phase: LivePhase;
  minute: number;
  speed: LiveSpeed;
  setSpeed: (s: LiveSpeed) => void;
  skipToEnd: () => void;
  /** true una vez revelados los penales (o si no había, al terminar). */
  penaltiesRevealed: boolean;
}

/**
 * Reloj compartido de la jornada en vivo: un único intervalo mueve el minuto
 * 0→90 para todas las tarjetas; los marcadores por tarjeta se derivan con
 * scoreAtMinute, no son estado de este hook. `sessionKey` identifica la
 * sesión activa para resetear el reloj al abrir una nueva.
 */
export function useLiveMatchdayPlayback(
  sessionKey: string | null,
  hasAnyPenalties: boolean,
  initialSpeed: LiveSpeed = 1,
): LiveMatchdayPlaybackState {
  const [minute, setMinute] = useState(0);
  const [phase, setPhase] = useState<LivePhase>('playing');
  const [penaltiesRevealed, setPenaltiesRevealed] = useState(false);
  const [speed, setSpeed] = useState<LiveSpeed>(initialSpeed);

  // Reset durante el render al cambiar de sesión (patrón React "adjusting
  // state when a prop changes"), igual que useLiveMatchPlayback.
  const [prevKey, setPrevKey] = useState(sessionKey);
  if (sessionKey !== prevKey) {
    setPrevKey(sessionKey);
    setMinute(0);
    setPhase('playing');
    setPenaltiesRevealed(false);
  }

  // Reloj compartido.
  useEffect(() => {
    if (!sessionKey || phase !== 'playing') return;
    const id = setInterval(() => {
      setMinute((prev) => (prev + 1 >= MATCH_MINUTES ? MATCH_MINUTES : prev + 1));
    }, 1000 / speed);
    return () => clearInterval(id);
  }, [sessionKey, phase, speed]);

  // Transición al llegar a los 90'.
  useEffect(() => {
    if (!sessionKey || phase !== 'playing') return;
    if (minute >= MATCH_MINUTES) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase(hasAnyPenalties ? 'penalties' : 'finished');
      if (!hasAnyPenalties) setPenaltiesRevealed(true);
    }
  }, [minute, sessionKey, phase, hasAnyPenalties]);

  // Ventana de suspenso única para todos los penales de la jornada.
  useEffect(() => {
    if (phase !== 'penalties') return;
    const id = setTimeout(() => {
      setPenaltiesRevealed(true);
      setPhase('finished');
    }, PENALTY_REVEAL_MS / speed);
    return () => clearTimeout(id);
  }, [phase, speed]);

  const skipToEnd = useCallback(() => {
    if (!sessionKey) return;
    setMinute(MATCH_MINUTES);
    setPenaltiesRevealed(true);
    setPhase('finished');
  }, [sessionKey]);

  return { phase, minute, speed, setSpeed, skipToEnd, penaltiesRevealed };
}
