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
    primary: true,
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
    // La barra mobile no admite 'Mundial': son 7 caracteres y el presupuesto es 6.
    shortLabel: 'Copa',
    icon: 'trophy',
    primary: true,
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
  // `stats` todavía no: su panel "actual" se calcula del documento del ciclo
  // (qualifiers/worldCup) y no tiene equivalente de temporada. El resto de las
  // vistas son mode-agnósticas y se declaran igual que en selecciones.
  dataTabs: ['comparison', 'favorites'],
  archiveTabs: ['champions', 'history'],
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

/** ¿Esta competición se nutre de esa división? `null` = la que no usa divisiones. */
function feedsFromDivision(competition: Competition, division: string | null): boolean {
  if (division === null) return competition.entrants.from !== 'division';
  return competition.entrants.from === 'division' && competition.entrants.division === division;
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
  return descriptor.competitions.find(
    (c) => c.format === format && feedsFromDivision(c, division),
  );
}

/**
 * La competición de un modo de temporada que corresponde a una división.
 *
 * `champions_history` no devuelve el `competition_id` de la fila: para las filas
 * de temporada mete la división del torneo en la columna `region` (ver
 * `021_mode_scoped_history.sql`). Con eso solo alcanza para nombrar el torneo,
 * porque la división es lo que distingue a una liga de otra, y la copa es la que
 * no tiene.
 *
 * Límite conocido: un modo con dos competiciones sin división no se desambigua
 * por acá. El día que exista, la RPC tiene que emitir `competition_id`.
 */
export function competitionForDivision(
  descriptor: ModeDescriptor,
  division: string | null,
): Competition | undefined {
  return descriptor.competitions.find((c) => feedsFromDivision(c, division));
}
