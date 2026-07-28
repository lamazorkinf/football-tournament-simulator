import { useMemo } from 'react';
import { useModeStore } from '../store/useModeStore';
import { descriptorForMode } from '../modes/registry';
import type { ModeDescriptor } from '../modes/types';

/**
 * El descriptor del modo activo.
 *
 * `useModeNav` responde "qué se navega"; esto responde "qué corre este modo", que
 * es lo que necesita una vista de archivo para ponerle nombre a un torneo viejo.
 * Sigue siendo mirar el modo por su configuración y no por su tipo: ningún
 * componente ramifica por `kind`.
 */
export function useModeDescriptor(): ModeDescriptor {
  const activeMode = useModeStore((s) => s.activeMode());
  return useMemo(() => descriptorForMode(activeMode), [activeMode]);
}
