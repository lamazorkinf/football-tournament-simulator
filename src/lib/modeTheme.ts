import type { GameMode } from '../types';
import { descriptorForMode } from '../modes/registry';

/**
 * Clave de tema (paleta) del modo activo. Cada modo puede pintar la app con otra
 * tonalidad para que se note de un vistazo en qué competición estás. El valor se
 * escribe en `document.documentElement.dataset.theme` y las paletas viven en
 * `src/index.css` como overrides de las variables `--color-*` bajo
 * `:root[data-theme='<clave>']`.
 *
 * El tema es un campo del descriptor del modo, que ya resuelve la prioridad:
 * `mode.config.theme` si está, si no el del descriptor built-in que le
 * corresponde a su `kind`.
 */
export function themeForMode(mode: GameMode | null): string {
  return descriptorForMode(mode).theme;
}
