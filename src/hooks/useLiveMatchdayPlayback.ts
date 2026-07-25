import { useCallback, useEffect, useState } from 'react';
import type { LivePhase, LiveSpeed } from './useLiveMatchPlayback';

// Exportadas: LiveMatchdayOverlay las necesita para decidir el "FINAL" de
// CADA tarjeta según el minuto de cierre de SU partido (90 o 120), no según
// la fase del reloj compartido (que puede seguir corriendo por el alargue de
// otro partido de la grilla).
export const REGULATION_MINUTES = 90;
export const EXTRA_TIME_MINUTES = 120;
const PENALTY_REVEAL_MS = 1200;

export interface LiveMatchdayPlaybackState {
  phase: LivePhase;
  minute: number;
  speed: LiveSpeed;
  setSpeed: (s: LiveSpeed) => void;
  skipToEnd: () => void;
  /** true una vez revelados los penales (o si no había, al terminar). */
  penaltiesRevealed: boolean;
  /** Reloj frenado: ni corre el minuto ni se revelan los penales. */
  isPaused: boolean;
  togglePause: () => void;
}

/**
 * Reloj compartido de la jornada en vivo: un único intervalo mueve el minuto
 * 0→90 (o 0→120 si algún partido de la sesión fue a alargue) para todas las
 * tarjetas; los marcadores por tarjeta se derivan con scoreAtMinute, no son
 * estado de este hook. `sessionKey` identifica la sesión activa para
 * resetear el reloj al abrir una nueva. El reloj es único para toda la
 * grilla, así que si UN SOLO partido tuvo alargue, todos esperan hasta el 120
 * antes de pasar a penales/final (evita revelar penales de otro partido antes
 * de que termine el alargue del que todavía juega).
 */
export function useLiveMatchdayPlayback(
  sessionKey: string | null,
  hasAnyPenalties: boolean,
  hasAnyExtraTime: boolean,
  initialSpeed: LiveSpeed = 1,
): LiveMatchdayPlaybackState {
  const [minute, setMinute] = useState(0);
  const [phase, setPhase] = useState<LivePhase>('playing');
  const [penaltiesRevealed, setPenaltiesRevealed] = useState(false);
  const [speed, setSpeed] = useState<LiveSpeed>(initialSpeed);
  const [isPaused, setIsPaused] = useState(false);

  // Reset durante el render al cambiar de sesión (patrón React "adjusting
  // state when a prop changes"), igual que useLiveMatchPlayback.
  const [prevKey, setPrevKey] = useState(sessionKey);
  if (sessionKey !== prevKey) {
    setPrevKey(sessionKey);
    setMinute(0);
    setPhase('playing');
    setPenaltiesRevealed(false);
    setIsPaused(false);
  }

  const finalMinute = hasAnyExtraTime ? EXTRA_TIME_MINUTES : REGULATION_MINUTES;

  // Reloj compartido.
  useEffect(() => {
    if (!sessionKey || phase !== 'playing' || isPaused) return;
    const id = setInterval(() => {
      setMinute((prev) => (prev + 1 >= finalMinute ? finalMinute : prev + 1));
    }, 1000 / speed);
    return () => clearInterval(id);
  }, [sessionKey, phase, speed, isPaused, finalMinute]);

  // Transición al llegar al final (90' o 120' con alargue).
  useEffect(() => {
    if (!sessionKey || phase !== 'playing') return;
    if (minute >= finalMinute) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase(hasAnyPenalties ? 'penalties' : 'finished');
      if (!hasAnyPenalties) setPenaltiesRevealed(true);
    }
  }, [minute, sessionKey, phase, hasAnyPenalties, finalMinute]);

  // Ventana de suspenso única para todos los penales de la jornada. En pausa
  // el suspenso también espera: al reanudar arranca de nuevo la ventana.
  useEffect(() => {
    if (phase !== 'penalties' || isPaused) return;
    const id = setTimeout(() => {
      setPenaltiesRevealed(true);
      setPhase('finished');
    }, PENALTY_REVEAL_MS / speed);
    return () => clearTimeout(id);
  }, [phase, speed, isPaused]);

  const skipToEnd = useCallback(() => {
    if (!sessionKey) return;
    setMinute(finalMinute);
    setPenaltiesRevealed(true);
    setPhase('finished');
    setIsPaused(false);
  }, [sessionKey, finalMinute]);

  const togglePause = useCallback(() => setIsPaused((p) => !p), []);

  return { phase, minute, speed, setSpeed, skipToEnd, penaltiesRevealed, isPaused, togglePause };
}
