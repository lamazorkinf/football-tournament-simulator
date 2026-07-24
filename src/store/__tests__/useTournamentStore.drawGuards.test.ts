import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Cycle, Group, Match, Region, Team, TeamStanding, WorldCupGroup } from '../../types';

const {
  isSupabaseConfigured,
  saveTournament,
  saveCycleState,
  createQualifierGroups,
  deleteQualifierData,
  createWorldCupGroups,
  deleteWorldCupData,
  createKnockoutMatch,
  deleteKnockoutData,
  deleteWorldCupMatchHistory,
} = vi.hoisted(() => ({
  isSupabaseConfigured: vi.fn(() => true),
  saveTournament: vi.fn(async () => {}),
  saveCycleState: vi.fn(async () => {}),
  createQualifierGroups: vi.fn(async () => {}),
  deleteQualifierData: vi.fn(async () => {}),
  createWorldCupGroups: vi.fn(async () => {}),
  deleteWorldCupData: vi.fn(async () => {}),
  createKnockoutMatch: vi.fn(async () => {}),
  deleteKnockoutData: vi.fn(async () => {}),
  deleteWorldCupMatchHistory: vi.fn(async () => {}),
}));

vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured,
  supabase: {},
  escapeOrValue: (v: string) => v,
}));

vi.mock('../../services/adaptiveTournamentService', () => ({
  adaptiveTournamentService: {
    getLatestTournament: vi.fn(),
    getTournamentsList: vi.fn(),
    loadTournament: vi.fn(),
    saveTournament,
    deleteTournament: vi.fn(),
  },
}));

vi.mock('../../services/cycleStateService', () => ({
  cycleStateService: { loadCycleState: vi.fn(), saveCycleState },
}));

vi.mock('../../services/cycleMatchHistory', () => ({
  buildMatchParams: vi.fn(),
  backfillCycleMatchHistory: vi.fn(async () => 0),
}));

vi.mock('../../services/normalizedQualifiersService', () => ({
  normalizedQualifiersService: { createQualifierGroups, deleteQualifierData },
}));

vi.mock('../../services/normalizedWorldCupService', () => ({
  normalizedWorldCupService: {
    createWorldCupGroups,
    deleteWorldCupData,
    createKnockoutMatch,
    deleteKnockoutData,
    deleteWorldCupMatchHistory,
  },
}));

vi.mock('../../services/teamsService', () => ({
  teamsService: {
    getAllTeams: vi.fn(async () => []),
    batchUpdateTeams: vi.fn(),
    updateTeam: vi.fn(async () => {}),
  },
}));

const { useTournamentStore } = await import('../useTournamentStore');
const { toCycle } = await import('../../core/cycle');
const { baseTournament, makeDrawnContinentalCycle, makeDrawnConfedCycle } = await import(
  '../../test/fixtures/cycle'
);

const REGIONS: Region[] = ['Europe', 'America', 'Africa', 'Asia'];

function makeTeams(): Team[] {
  return REGIONS.flatMap((region) =>
    Array.from({ length: 5 }, (_, i) => ({
      id: `${region}-t${i}`,
      name: `${region} ${i}`,
      flag: '🏳️',
      region,
      skill: 90 - i,
    }))
  );
}

/** Un grupo por región; `matches` en 0 = grupo creado pero sin sortear. */
function makeQualifiers(matchesPerGroup: number): Record<Region, Group[]> {
  const build = (region: Region): Group[] => {
    const teamIds = Array.from({ length: 5 }, (_, i) => `${region}-t${i}`);
    const matches: Match[] = Array.from({ length: matchesPerGroup }, (_, i) => ({
      id: `${region}-m${i}`,
      homeTeamId: teamIds[0],
      awayTeamId: teamIds[1],
      homeScore: null,
      awayScore: null,
      isPlayed: false,
      stage: 'qualifier',
      matchday: i + 1,
    }));
    return [
      {
        id: `${region}-g1`,
        name: 'Group A',
        region,
        teamIds: matchesPerGroup > 0 ? teamIds : [],
        matches,
        standings: [],
        isDrawComplete: matchesPerGroup > 0,
      },
    ];
  };
  return { Europe: build('Europe'), America: build('America'), Africa: build('Africa'), Asia: build('Asia') };
}

function setUpTournament(matchesPerGroup: number): Cycle {
  const cycle: Cycle = {
    ...toCycle(baseTournament()),
    id: 't-guards',
    qualifiers: makeQualifiers(matchesPerGroup),
    calendar: { phase: 'wc-qualifiers', matchday: 1 },
  };
  useTournamentStore.setState({
    teams: makeTeams(),
    tournaments: [cycle],
    currentTournamentId: cycle.id,
    currentTournament: cycle,
    isBatchProcessing: false,
  });
  return cycle;
}

const store = () => useTournamentStore.getState();

function makeStanding(teamId: string, points: number): TeamStanding {
  return { teamId, played: 2, won: 1, drawn: 0, lost: 1, goalsFor: 2, goalsAgainst: 1, goalDifference: 1, points };
}

/**
 * 42 grupos de clasificatorias ya resueltos (sin partidos pendientes:
 * `matches: []` cumple `every(isPlayed)` al vacío) y con standings que ya
 * definen 1º y 2º. Es lo mínimo que necesita `advanceToWorldCup` para llegar
 * hasta el sorteo real: 42 primeros + 22 mejores segundos = 64 clasificados.
 * Sin esto, el test del guard "ya sorteado" sería un falso positivo: pasaría
 * igual porque el chequeo de "partidos sin jugar" frena antes de llegar al
 * sorteo, sin que el guard nuevo haga nada.
 */
function makeFullyQualifiedCycle(): { cycle: Cycle; teams: Team[] } {
  const regions: Region[] = ['Europe', 'America', 'Africa', 'Asia'];
  const groupsPerRegion: Record<Region, number> = { Europe: 11, America: 11, Africa: 10, Asia: 10 }; // 42
  const teams: Team[] = [];
  const qualifiers: Record<Region, Group[]> = { Europe: [], America: [], Africa: [], Asia: [] };

  for (const region of regions) {
    for (let g = 0; g < groupsPerRegion[region]; g++) {
      const winnerId = `${region}-q${g}-w`;
      const runnerId = `${region}-q${g}-r`;
      teams.push(
        { id: winnerId, name: `${region} Q${g} W`, flag: '🏳️', region, skill: 80 },
        { id: runnerId, name: `${region} Q${g} R`, flag: '🏳️', region, skill: 70 }
      );
      qualifiers[region].push({
        id: `${region}-q${g}`,
        name: `Group ${g}`,
        region,
        teamIds: [winnerId, runnerId],
        matches: [],
        standings: [makeStanding(winnerId, 9), makeStanding(runnerId, 3)],
        isDrawComplete: true,
      });
    }
  }

  const cycle: Cycle = {
    ...toCycle(baseTournament()),
    id: 't-guards-wc',
    qualifiers,
    calendar: { phase: 'wc-groups', matchday: 1 },
  };
  return { cycle, teams };
}

/**
 * 16 grupos del Mundial ya resueltos (mismo truco de `matches: []`) con 2
 * equipos cada uno, listos para que `generateRoundOf32` produzca los 16
 * partidos reales de dieciseisavos. Sin 16 grupos completos, `advanceToKnockout`
 * corta antes por otro motivo (`groups.length !== 16` dentro de
 * `generateRoundOf32`) y el test del guard quedaría decorativo.
 */
function makeGroupsReadyForKnockout(): { groups: WorldCupGroup[]; teams: Team[] } {
  const teams: Team[] = [];
  const groups: WorldCupGroup[] = [];
  for (let i = 0; i < 16; i++) {
    const name = `Group ${String.fromCharCode(65 + i)}`;
    const winnerId = `ko-g${i}-w`;
    const runnerId = `ko-g${i}-r`;
    teams.push(
      { id: winnerId, name: `${name} W`, flag: '🏳️', region: 'Europe', skill: 80 },
      { id: runnerId, name: `${name} R`, flag: '🏳️', region: 'Europe', skill: 70 }
    );
    groups.push({
      id: `wc-${name}`,
      name,
      teamIds: [winnerId, runnerId],
      matches: [],
      standings: [makeStanding(winnerId, 9), makeStanding(runnerId, 3)],
    });
  }
  return { groups, teams };
}

describe('generateDrawAndFixtures — guard de sorteo ya hecho', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseConfigured.mockReturnValue(true);
  });

  it('no re-sortea si las clasificatorias ya tienen partidos', async () => {
    const before = setUpTournament(20);

    await store().generateDrawAndFixtures();

    expect(store().currentTournament).toBe(before);
    expect(createQualifierGroups).not.toHaveBeenCalled();
    expect(deleteQualifierData).not.toHaveBeenCalled();
  });

  it('sortea normalmente si todavía no hay partidos', async () => {
    setUpTournament(0);

    await store().generateDrawAndFixtures();

    const europe = store().currentTournament!.qualifiers.Europe;
    expect(europe[0].matches.length).toBe(20);
    expect(createQualifierGroups).toHaveBeenCalledTimes(4);
  });

  it('con force borra el sorteo anterior ANTES de escribir el nuevo', async () => {
    setUpTournament(20);

    await store().generateDrawAndFixtures({ force: true });

    expect(deleteQualifierData).toHaveBeenCalledWith('t-guards');
    expect(createQualifierGroups).toHaveBeenCalledTimes(4);
    // Sin este orden, los partidos viejos (con otros nanoid) sobreviven al
    // upsert y el torneo queda con el doble de partidos.
    expect(deleteQualifierData.mock.invocationCallOrder[0]).toBeLessThan(
      createQualifierGroups.mock.invocationCallOrder[0]
    );
  });

  it('force NO alcanza si ya se jugó algún partido', async () => {
    const cycle = setUpTournament(20);
    useTournamentStore.setState({
      currentTournament: { ...cycle, hasAnyMatchPlayed: true },
      tournaments: [{ ...cycle, hasAnyMatchPlayed: true }],
    });

    await store().generateDrawAndFixtures({ force: true });

    expect(deleteQualifierData).not.toHaveBeenCalled();
    expect(createQualifierGroups).not.toHaveBeenCalled();
  });

  it('el primer sorteo también borra: limpia el residuo de un intento anterior', async () => {
    setUpTournament(0);

    await store().generateDrawAndFixtures();

    expect(deleteQualifierData).toHaveBeenCalledWith('t-guards');
  });
});

describe('generateDrawAndFixtures — valor de retorno', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseConfigured.mockReturnValue(true);
    // Defensivo: el store es un singleton compartido entre tests, así que si
    // algún test de este archivo deja `isDrawing` en `true` (p. ej. por un
    // guard que no se ejercitó hasta el final), el candado se cuela en el
    // siguiente test y lo hace fallar por un motivo que no tiene nada que ver
    // con lo que ese test intenta probar.
    useTournamentStore.setState({ isDrawing: false });
  });

  afterEach(() => {
    // Mismo motivo que el beforeEach: dejar el candado limpio para que no se
    // cuele en el describe siguiente ('candado isDrawing'), que no lo resetea
    // porque nunca lo toca a propósito.
    useTournamentStore.setState({ isDrawing: false });
  });

  it('devuelve true cuando el sorteo se genera de verdad', async () => {
    setUpTournament(0);

    const result = await store().generateDrawAndFixtures();

    expect(result).toBe(true);
  });

  it('devuelve false si no hay torneo actual', async () => {
    useTournamentStore.setState({ currentTournament: null });

    const result = await store().generateDrawAndFixtures();

    expect(result).toBe(false);
  });

  it('devuelve false si ya se jugó algún partido', async () => {
    const cycle = setUpTournament(20);
    useTournamentStore.setState({
      currentTournament: { ...cycle, hasAnyMatchPlayed: true },
    });

    const result = await store().generateDrawAndFixtures();

    expect(result).toBe(false);
  });

  it('devuelve false si ya está sorteado y no se pasa force', async () => {
    setUpTournament(20);

    const result = await store().generateDrawAndFixtures();

    expect(result).toBe(false);
  });

  it('devuelve false si ya hay un sorteo en curso', async () => {
    setUpTournament(0);
    useTournamentStore.setState({ isDrawing: true });

    const result = await store().generateDrawAndFixtures();

    expect(result).toBe(false);
  });

  it('devuelve false si explota antes de terminar', async () => {
    const cycle = setUpTournament(0);
    const qualifiersSinAsia: Partial<Cycle['qualifiers']> = { ...cycle.qualifiers };
    delete qualifiersSinAsia.Asia;
    const corrupted: Cycle = {
      ...cycle,
      qualifiers: qualifiersSinAsia as Cycle['qualifiers'],
    };
    useTournamentStore.setState({ currentTournament: corrupted, tournaments: [corrupted] });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await store().generateDrawAndFixtures();

    expect(result).toBe(false);
    consoleError.mockRestore();
  });

  it('devuelve true aunque la persistencia falle: el sorteo ya quedó válido en memoria', async () => {
    setUpTournament(0);
    createQualifierGroups.mockRejectedValue(new Error('network down'));

    const result = await store().generateDrawAndFixtures();

    expect(result).toBe(true);
    // El sorteo sí se generó y quedó en el estado local, aunque no se haya
    // podido guardar.
    expect(store().currentTournament!.qualifiers.Europe[0].matches.length).toBe(20);
  });
});

describe('candado isDrawing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseConfigured.mockReturnValue(true);
  });

  it('dos sorteos disparados a la vez producen uno solo', async () => {
    setUpTournament(20); // ya sorteado: el escenario real es "Rehacer sorteo".
    // Sin `force`, la primera llamada actualiza el estado local (con el
    // sorteo) de forma síncrona, antes de llegar a ningún await, así que
    // para cuando arranca la segunda llamada el guard `isQualifiersDrawn`
    // ya la rechaza por su cuenta y el test queda decorativo: nunca llega
    // a ejercitar el candado. Con `force: true` ese guard se saltea a
    // propósito -como al tocar el botón "Rehacer sorteo"-, así que el
    // candado `isDrawing` pasa a ser la única defensa posible contra el
    // doble clic, que es justo lo que este test tiene que probar.
    // El guardado se demora para que las dos llamadas se solapen de verdad,
    // que es lo que pasa con un doble clic sobre un botón que tarda segundos.
    createQualifierGroups.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 20))
    );

    await Promise.all([
      store().generateDrawAndFixtures({ force: true }),
      store().generateDrawAndFixtures({ force: true }),
    ]);

    expect(createQualifierGroups).toHaveBeenCalledTimes(4); // 4 regiones, no 8
    // Si el candado no frenara a la segunda llamada, también volvería a
    // borrar: dos borrados serían tan destructivos como dos escrituras.
    expect(deleteQualifierData).toHaveBeenCalledTimes(1);
  });

  it('libera el candado cuando el sorteo termina', async () => {
    setUpTournament(0);

    // isDrawing arranca en `false`, así que mirar sólo el valor final no
    // alcanza: ese test queda en verde aunque el candado nunca se tome.
    // createQualifierGroups corre en medio de la acción (una vez por región,
    // durante la persistencia), así que sirve de sonda para registrar si el
    // candado estaba tomado en ese momento.
    const isDrawingDuringDraw: boolean[] = [];
    createQualifierGroups.mockImplementation(async () => {
      isDrawingDuringDraw.push(store().isDrawing);
    });

    await store().generateDrawAndFixtures();

    expect(isDrawingDuringDraw.length).toBeGreaterThan(0);
    expect(isDrawingDuringDraw.every((isDrawing) => isDrawing === true)).toBe(true);
    expect(store().isDrawing).toBe(false);
  });

  it('libera el candado aunque el sorteo explote antes de la persistencia', async () => {
    const cycle = setUpTournament(0);

    // El error tiene que nacer AFUERA del try de persistencia: ese lo atrapa
    // su propio catch interno, que a propósito no relanza, así que nunca
    // llega al catch externo que protege el finally. Para forzarlo ahí se
    // corrompen las clasificatorias sacándoles una región completa: el bucle
    // que arma los fixtures explota al leer los grupos de esa región, mucho
    // antes de llegar al bloque de persistencia.
    const qualifiersSinAsia: Partial<Cycle['qualifiers']> = { ...cycle.qualifiers };
    delete qualifiersSinAsia.Asia;
    const corrupted: Cycle = {
      ...cycle,
      qualifiers: qualifiersSinAsia as Cycle['qualifiers'],
    };
    useTournamentStore.setState({
      currentTournament: corrupted,
      tournaments: [corrupted],
    });

    // Acá el error se dispara antes de la persistencia, así que la sonda del
    // test anterior (el mock de createQualifierGroups) nunca llegaría a
    // correr. En su lugar se usa el único console.error que imprime el catch
    // externo: para cuando se ejecuta, el finally todavía no liberó el
    // candado.
    const isDrawingOnError: boolean[] = [];
    const consoleError = vi.spyOn(console, 'error').mockImplementation((...args) => {
      if (String(args[0]).includes('Error in generateDrawAndFixtures')) {
        isDrawingOnError.push(store().isDrawing);
      }
    });

    await store().generateDrawAndFixtures();

    // Confirma que de verdad se tomó el atajo: nunca llegó a persistir nada.
    expect(createQualifierGroups).not.toHaveBeenCalled();
    expect(isDrawingOnError).toEqual([true]);
    expect(store().isDrawing).toBe(false);

    consoleError.mockRestore();
  });
});

describe('guards del resto de los sorteos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseConfigured.mockReturnValue(true);
  });

  it('advanceToWorldCup no re-sortea un Mundial ya existente', async () => {
    // Clasificatorias COMPLETAS de verdad (42 primeros + 22 mejores segundos
    // = 64), no `setUpTournament(20)`: con partidos sin jugar, la función
    // corta antes por otro motivo y el test del guard nunca lo ejercitaría.
    const { cycle, teams } = makeFullyQualifiedCycle();
    const withWorldCup: Cycle = {
      ...cycle,
      worldCup: {
        groups: [{ id: 'wc-g1', name: 'Grupo A', teamIds: ['a', 'b', 'c', 'd'], matches: [], standings: [] }],
        knockout: {
          roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [],
          thirdPlace: null, final: null,
        },
        qualifiedTeamIds: [],
      },
    };
    useTournamentStore.setState({
      currentTournament: withWorldCup, tournaments: [withWorldCup], currentTournamentId: withWorldCup.id, teams,
    });

    await store().advanceToWorldCup();

    expect(createWorldCupGroups).not.toHaveBeenCalled();
  });

  it('advanceToWorldCup borra el Mundial anterior ANTES de escribir el nuevo', async () => {
    // Mismo molde que "con force borra el sorteo anterior ANTES de escribir
    // el nuevo" (clasificatorias), pero para el camino que SÍ sortea: acá no
    // hay `worldCup` previo en memoria, así que el guard de arriba no frena y
    // la acción llega hasta el borrado+escritura reales. Sin este test, las
    // dos líneas de `deleteWorldCupData` que agregó esta rama quedaban sin
    // ningún test que las ejecutara de verdad.
    const { cycle, teams } = makeFullyQualifiedCycle();
    useTournamentStore.setState({
      currentTournament: cycle, tournaments: [cycle], currentTournamentId: cycle.id, teams,
    });

    await store().advanceToWorldCup();

    expect(deleteWorldCupData).toHaveBeenCalledWith(cycle.id);
    expect(createWorldCupGroups).toHaveBeenCalledTimes(1);
    // Sin este orden, un Mundial huérfano de un intento anterior convive en
    // la base con los 16 grupos nuevos en vez de ser reemplazado.
    expect(deleteWorldCupData.mock.invocationCallOrder[0]).toBeLessThan(
      createWorldCupGroups.mock.invocationCallOrder[0]
    );
  });

  it('advanceToKnockout no re-genera unos dieciseisavos existentes', async () => {
    // 16 grupos completos de verdad: con `groups: []`, `generateRoundOf32`
    // corta por su propio chequeo de cantidad y el test del guard quedaría
    // decorativo (nunca produciría partidos para pasarle a createKnockoutMatch).
    const { groups, teams } = makeGroupsReadyForKnockout();
    const cycle = setUpTournament(0);
    const withKnockout: Cycle = {
      ...cycle,
      worldCup: {
        groups,
        knockout: {
          roundOf32: [
            { id: 'ko-1', homeTeamId: 'a', awayTeamId: 'b', homeScore: null, awayScore: null, isPlayed: false, round: 'round-of-32' },
          ],
          roundOf16: [], quarterFinals: [], semiFinals: [], thirdPlace: null, final: null,
        },
        qualifiedTeamIds: [],
      },
    };
    useTournamentStore.setState({
      currentTournament: withKnockout, tournaments: [withKnockout], currentTournamentId: withKnockout.id, teams,
    });

    await store().advanceToKnockout();

    expect(createKnockoutMatch).not.toHaveBeenCalled();
  });

  it('advanceToKnockout borra la fase eliminatoria anterior ANTES de escribir la nueva', async () => {
    // Igual que el espejo de advanceToWorldCup: acá `roundOf32` arranca vacío
    // (nada que rechace el guard), así que la acción llega hasta el borrado y
    // la escritura reales de `deleteKnockoutData`/`createKnockoutMatch`.
    const { groups, teams } = makeGroupsReadyForKnockout();
    const cycle = setUpTournament(0);
    const withGroups: Cycle = {
      ...cycle,
      worldCup: {
        groups,
        knockout: { roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [], thirdPlace: null, final: null },
        qualifiedTeamIds: [],
      },
    };
    useTournamentStore.setState({
      currentTournament: withGroups, tournaments: [withGroups], currentTournamentId: withGroups.id, teams,
    });

    await store().advanceToKnockout();

    expect(deleteKnockoutData).toHaveBeenCalledWith(withGroups.id);
    // 16 grupos -> 16 cruces de dieciseisavos (A1-B2, C1-D2, ...).
    expect(createKnockoutMatch).toHaveBeenCalledTimes(16);
    // Sin este orden, los dieciseisavos de un intento anterior sobreviven
    // junto a los nuevos en vez de ser reemplazados.
    expect(deleteKnockoutData.mock.invocationCallOrder[0]).toBeLessThan(
      createKnockoutMatch.mock.invocationCallOrder[0]
    );
  });

  it('advanceToWorldCupWithManualDraw tampoco re-sortea un Mundial existente', () => {
    const cycle = setUpTournament(20);
    const withWorldCup: Cycle = {
      ...cycle,
      worldCup: {
        groups: [{ id: 'wc-g1', name: 'Grupo A', teamIds: ['a', 'b', 'c', 'd'], matches: [], standings: [] }],
        knockout: {
          roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [],
          thirdPlace: null, final: null,
        },
        qualifiedTeamIds: [],
      },
    };
    useTournamentStore.setState({ currentTournament: withWorldCup, tournaments: [withWorldCup] });

    // 16 grupos de 4 = los 64 que pide la acción, para que el guard sea lo
    // único que la frene.
    const manualGroups = Array.from({ length: 16 }, (_, g) => ({
      id: `manual-${g}`,
      name: `Grupo ${g}`,
      teamIds: Array.from({ length: 4 }, (_, t) => `m-${g}-${t}`),
      matches: [],
      standings: [],
    }));

    store().advanceToWorldCupWithManualDraw(manualGroups);

    expect(createWorldCupGroups).not.toHaveBeenCalled();
    expect(store().currentTournament).toBe(withWorldCup);
  });

  it('drawContinental no re-sortea un bracket ya sorteado', () => {
    const { cycle, teams } = makeDrawnContinentalCycle();
    useTournamentStore.setState({
      currentTournament: cycle, tournaments: [cycle], currentTournamentId: cycle.id, teams,
    });

    store().drawContinental();

    expect(store().currentTournament).toBe(cycle);
  });

  it('drawConfederations no re-sortea grupos ya sorteados', () => {
    const { cycle, teams } = makeDrawnConfedCycle();
    const done: Cycle = { ...cycle, continental: { ...cycle.continental, isComplete: true } };
    useTournamentStore.setState({
      currentTournament: done, tournaments: [done], currentTournamentId: done.id, teams,
    });

    store().drawConfederations();

    expect(store().currentTournament).toBe(done);
  });
});
