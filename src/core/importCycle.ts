import { nanoid } from 'nanoid';
import type { Cycle, Group, Region } from '../types';

const REGIONS: Region[] = ['Europe', 'America', 'Africa', 'Asia'];

/**
 * Reasigna ids nuevos a un ciclo importado desde un archivo.
 *
 * Un export hecho desde esta misma base trae los ids originales. Al guardarlo,
 * `qualifier_groups` y `matches_new` se escriben con upsert por id: sin este
 * remapeo, el import robaría los grupos y partidos del torneo original
 * (moviéndoles el `tournament_id`) en vez de crear un torneo aparte.
 *
 * Sólo se renumera lo que vive en tablas normalizadas con PK propia: el torneo,
 * los grupos de clasificatorias y sus partidos. El resto del ciclo (continental,
 * confederaciones y Mundial) se persiste como documento JSONB con el
 * `tournament_id` como clave, así que sus ids internos no pueden colisionar.
 */
export function remapImportedCycleIds(cycle: Cycle): Cycle {
  const qualifiers = {} as Record<Region, Group[]>;

  for (const region of REGIONS) {
    qualifiers[region] = (cycle.qualifiers?.[region] ?? []).map((group) => ({
      ...group,
      id: nanoid(),
      matches: (group.matches ?? []).map((match) => ({ ...match, id: nanoid() })),
    }));
  }

  return { ...cycle, id: nanoid(), qualifiers };
}
