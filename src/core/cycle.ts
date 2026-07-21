import type {
  CalendarState,
  ConfederationsCup,
  ContinentalBracket,
  ContinentalStage,
  Cycle,
  Region,
  Tournament,
} from '../types';

/** Las 4 confederaciones, en orden fijo. Export para uso interno de las tareas 2-3. */
export const CYCLE_REGIONS: Region[] = ['Europe', 'America', 'Africa', 'Asia'];

/** Calendario inicial: fase continental, jornada 0 = todavía sin sortear. */
export function createInitialCalendar(): CalendarState {
  return { phase: 'continental', matchday: 0 };
}

function emptyBracket(region: Region): ContinentalBracket {
  return {
    region,
    roundOf64: [],
    roundOf32: [],
    roundOf16: [],
    quarterFinals: [],
    semiFinals: [],
    final: null,
    byeTeamIds: [],
  };
}

/** Etapa continental vacía: 4 brackets sin sortear. */
export function createEmptyContinentalStage(): ContinentalStage {
  return {
    brackets: {
      Europe: emptyBracket('Europe'),
      America: emptyBracket('America'),
      Africa: emptyBracket('Africa'),
      Asia: emptyBracket('Asia'),
    },
    isComplete: false,
  };
}

/** Copa Confederaciones vacía: sin grupos ni knockout. */
export function createEmptyConfederationsCup(): ConfederationsCup {
  return {
    groups: [],
    knockout: { semiFinals: [], thirdPlace: null, final: null },
    championId: undefined,
    isComplete: false,
  };
}

/** Envuelve un `Tournament` en un `Cycle` con las fases previas vacías. */
export function toCycle(base: Tournament): Cycle {
  return {
    ...base,
    continental: createEmptyContinentalStage(),
    confederationsCup: createEmptyConfederationsCup(),
    calendar: createInitialCalendar(),
  };
}

/**
 * Backfill defensivo: garantiza que un objeto (posiblemente legacy, sin campos
 * de ciclo) tenga `continental`/`confederationsCup`/`calendar`. No pisa los que
 * ya están presentes. Se usa al rehidratar/cargar torneos.
 */
export function ensureCycleFields(t: Tournament | Cycle): Cycle {
  const c = t as Partial<Cycle>;
  return {
    ...(t as Cycle),
    continental: c.continental ?? createEmptyContinentalStage(),
    confederationsCup: c.confederationsCup ?? createEmptyConfederationsCup(),
    calendar: c.calendar ?? createInitialCalendar(),
  };
}

// (Tareas 2-3 agregan más exports a este mismo archivo.)
