import type { GameMode } from '../types';

/**
 * Clave de tema (paleta) del modo activo. Cada modo puede pintar la app con otra
 * tonalidad para que se note de un vistazo en qué competición estás. El valor se
 * escribe en `document.documentElement.dataset.theme` y las paletas viven en
 * `src/index.css` como overrides de las variables `--color-*` bajo
 * `:root[data-theme='<clave>']`.
 *
 * Prioridad: `mode.config.theme` (si el modo define uno) → default por `kind`
 * (los modos de ligas usan la paleta nocturna 'villamariense'; el resto, la
 * verde 'selecciones' por defecto).
 */
export function themeForMode(mode: GameMode | null): string {
  const configured = mode?.config?.theme;
  if (typeof configured === 'string' && configured) return configured;
  return mode?.kind === 'league-system' ? 'villamariense' : 'selecciones';
}
