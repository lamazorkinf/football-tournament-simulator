import type { Region } from '../types';

/**
 * Nombre de cada confederación en español. Ojo al usarlo en `font-arcade`:
 * Press Start 2P dibuja las mayúsculas acentuadas a altura de minúscula, así
 * que "ÁFRICA" se lee partido — en esos casos va sin `uppercase`.
 */
export const REGION_LABELS: Record<Region, string> = {
  Europe: 'Europa',
  America: 'América',
  Africa: 'África',
  Asia: 'Asia',
};

export function regionLabel(region: Region): string {
  return REGION_LABELS[region];
}
