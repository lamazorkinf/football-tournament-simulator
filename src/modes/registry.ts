import type { GameMode, ModeKind } from '../types';
import type { Competition, CompetitionFormat, ModeDescriptor } from './types';
import { parseModeConfig } from './schema';

/**
 * Los descriptores de los dos modos que ya existen, escritos con el vocabulario
 * de modes/types.ts.
 *
 * Los dos tienen `config = {}` en la base, así que resuelven al built-in y el
 * día 1 no cambia nada. Son, además, la prueba de que el vocabulario alcanza:
 * si el ciclo mundialista y la Liga Villamariense entran, un modo nuevo entra.
 */

// ---------------------------------------------------------------------------
// Selecciones: el ciclo mundialista de 4 años
// ---------------------------------------------------------------------------

/**
 * En un modo `national-cycle` las competiciones describen las fases para la
 * NAVEGACIÓN y para documentar su forma; los fixtures los sigue generando la
 * máquina de 4 años (core/cycle.ts), que tiene un calendario por fases que el
 * motor de temporada no modela.
 */
const SELECCIONES_COMPETITIONS: Competition[] = [
  {
    id: 'continental',
    name: 'Continental',
    shortLabel: 'Conti',
    icon: 'globe',
    order: 1,
    stage: 'continental',
    entrants: { from: 'all-teams' },
    format: 'eliminacion',
    legs: 1,
    neutral: true,
    thirdPlace: true,
    seed: 'by-skill',
    plan: 'standard',
    // Los byes entran a R32 recolocados por orden de siembra.
    byeJoin: 'reseed',
  },
  {
    id: 'confederations',
    name: 'Confederaciones',
    shortLabel: 'Confed',
    icon: 'shield',
    order: 2,
    stage: 'confed-group',
    // Campeón y subcampeón de cada continental.
    entrants: { from: 'competition', competitionId: 'continental', take: 'champion-runner-up' },
    format: 'grupos-eliminacion',
    groups: { count: 2, size: 4, legs: 1, fixtureTemplate: 'fifa-4' },
    draw: { pots: false },
    qualify: { perGroup: 2, bestRunnersUp: 0 },
    knockout: {
      legs: 1,
      neutral: true,
      thirdPlace: true,
      seed: 'group-standings',
      plan: 'standard',
      byeJoin: 'adjacent',
    },
  },
  {
    id: 'qualifiers',
    name: 'Clasificatorias',
    shortLabel: 'Clasif',
    icon: 'route',
    order: 3,
    stage: 'qualifier',
    entrants: { from: 'all-teams' },
    format: 'grupos-eliminacion',
    // Grupos de 5 con la plantilla que reparte un partido por fecha en 20 fechas.
    groups: { count: 11, size: 5, legs: 2, fixtureTemplate: 'fifa-5' },
    draw: { pots: true },
    qualify: { perGroup: 1, bestRunnersUp: 0 },
    // Sin cuadro propio: los clasificados alimentan el Mundial.
    knockout: null,
  },
  {
    id: 'world-cup',
    name: 'Mundial',
    shortLabel: 'Mundial',
    icon: 'trophy',
    order: 4,
    stage: 'world-cup-group',
    entrants: { from: 'competition', competitionId: 'qualifiers', take: 'qualified' },
    format: 'grupos-eliminacion',
    groups: { count: 16, size: 4, legs: 1, fixtureTemplate: 'fifa-4' },
    draw: { pots: true, snake: true, avoidSameRegion: true },
    qualify: { perGroup: 2, bestRunnersUp: 0 },
    knockout: {
      legs: 1,
      neutral: true,
      thirdPlace: true,
      seed: 'group-standings',
      plan: 'fifa-32',
      byeJoin: 'adjacent',
    },
  },
];

export const SELECCIONES_DESCRIPTOR: ModeDescriptor = {
  divisions: [],
  promotion: null,
  competitions: SELECCIONES_COMPETITIONS,
  theme: 'selecciones',
  extraTabs: [],
  dataTabs: ['stats', 'comparison', 'favorites'],
  archiveTabs: ['champions', 'history', 'tournaments'],
  engine: 'national-cycle',
};

// ---------------------------------------------------------------------------
// Liga Villamariense: dos divisiones y una copa, por temporada
// ---------------------------------------------------------------------------

const VILLAMARIENSE_COMPETITIONS: Competition[] = [
  {
    id: 'league-A',
    name: 'Liga A',
    shortLabel: 'Liga A',
    icon: 'shield',
    order: 1,
    stage: 'league',
    entrants: { from: 'division', division: 'A' },
    format: 'liga',
    legs: 2,
    highlightBottom: 3, // descienden 3
  },
  {
    id: 'league-B',
    name: 'Liga B',
    shortLabel: 'Liga B',
    icon: 'shield',
    order: 2,
    stage: 'league',
    entrants: { from: 'division', division: 'B' },
    format: 'liga',
    legs: 2,
    highlightTop: 3, // ascienden 3
  },
  {
    id: 'cup',
    name: 'Copa',
    shortLabel: 'Copa',
    icon: 'trophy',
    order: 3,
    stage: 'cup',
    // Cada cruce enfrenta un equipo de A contra uno de B, con la composición del
    // año anterior: así los ascensos y descensos no alteran el sorteo.
    entrants: { from: 'cross-divisions', divisions: ['A', 'B'], usePreviousYear: true },
    format: 'eliminacion',
    legs: 2,
    neutral: false,
    thirdPlace: false,
    seed: 'cross-division',
    plan: 'standard',
    byeJoin: 'adjacent',
  },
];

export const VILLAMARIENSE_DESCRIPTOR: ModeDescriptor = {
  divisions: ['A', 'B'],
  promotion: { count: 3 },
  competitions: VILLAMARIENSE_COMPETITIONS,
  theme: 'villamariense',
  extraTabs: ['season', 'crests'],
  // Datos que funcionan sin un ciclo de selecciones cargado.
  dataTabs: ['comparison', 'favorites'],
  archiveTabs: ['history'],
  engine: 'season',
};

// ---------------------------------------------------------------------------
// Resolución
// ---------------------------------------------------------------------------

/** Descriptor de fallback por `kind`, para modos sin `config` (o con una inválida). */
export const BUILTIN_DESCRIPTORS: Record<ModeKind, ModeDescriptor> = {
  'national-cycle': SELECCIONES_DESCRIPTOR,
  'league-system': VILLAMARIENSE_DESCRIPTOR,
};

/**
 * El descriptor de un modo: su `config` parseada, o el built-in de su `kind` si
 * está vacía o no valida.
 *
 * `config.theme` se respeta siempre, incluso sobre un built-in: es el único
 * campo de `config` que el juego ya usaba y hay modos que lo tienen seteado.
 */
export function descriptorForMode(mode: GameMode | null): ModeDescriptor {
  if (!mode) return SELECCIONES_DESCRIPTOR;

  const builtin = BUILTIN_DESCRIPTORS[mode.kind] ?? SELECCIONES_DESCRIPTOR;
  const parsed = parseModeConfig(mode.config, mode.kind);

  if (!parsed.ok && parsed.reason === 'invalid') {
    console.warn(
      `Modo "${mode.id}": config inválida, se usa el descriptor por defecto de ${mode.kind}.`,
      parsed.errors,
    );
  }
  const base = parsed.ok ? parsed.descriptor : builtin;

  const theme = mode.config?.theme;
  return typeof theme === 'string' && theme ? { ...base, theme } : base;
}

/** La competición de un descriptor por id. */
export function competitionById(
  descriptor: ModeDescriptor,
  id: string,
): Competition | undefined {
  return descriptor.competitions.find((c) => c.id === id);
}

/**
 * A qué competición del descriptor corresponde una fila vieja de
 * `mode_tournaments`, de las que se guardaron antes de que existiera la columna
 * `competition_id`.
 *
 * La regla es la que hace única a la fila: su formato canónico y, si la fila
 * tiene división, que la competición se nutra de esa misma división. Sirve para
 * cualquier modo de temporada, no sólo para el villamariense.
 */
export function competitionForLegacyRow(
  descriptor: ModeDescriptor,
  format: CompetitionFormat,
  division: string | null,
): Competition | undefined {
  return descriptor.competitions.find((c) => {
    if (c.format !== format) return false;
    if (division === null) return c.entrants.from !== 'division';
    return c.entrants.from === 'division' && c.entrants.division === division;
  });
}
