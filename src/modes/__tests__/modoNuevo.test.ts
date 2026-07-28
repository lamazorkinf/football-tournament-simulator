import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseModeConfig } from '../schema';
import { deriveModeNav } from '../nav';
import { useSeasonModeStore } from '../../store/useSeasonModeStore';
import { useTournamentStore } from '../../store/useTournamentStore';
import { isGroupStageComplete } from '../../core/formats/groupStage';
import { isBracketComplete } from '../../core/formats/bracket';
import type { GruposEliminacionTournament } from '../../core/formats/modeTournament';
import type { Team } from '../../types';

/**
 * EL CRITERIO DE CIERRE DE LA UNIFICACIÓN.
 *
 * Dar de alta un modo tiene que ser configuración + siembra de equipos, no
 * código. Este test toma un JSON —exactamente lo que iría en la columna
 * `modes.config`, sin una sola referencia a un tipo de TypeScript— y con eso
 * solo: lo valida, lo navega y le juega una temporada entera hasta coronar
 * campeón, con un formato que ningún modo existente usa (grupos + eliminación
 * en un modo de temporada).
 *
 * Si algún día esto necesita tocar un archivo .ts para funcionar, la
 * unificación se rompió.
 */

/** Lo que un usuario pegaría en `modes.config`. JSON puro. */
const MUNDIAL_DE_CLUBES = JSON.parse(`{
  "engine": "season",
  "theme": "villamariense",
  "divisions": [],
  "promotion": null,
  "extraTabs": [],
  "dataTabs": ["comparison", "favorites"],
  "archiveTabs": ["champions", "history"],
  "competitions": [
    {
      "id": "mundialito",
      "name": "Mundial de Clubes",
      "shortLabel": "MUNDI",
      "icon": "trophy",
      "order": 1,
      "stage": "cup",
      "entrants": { "from": "all-teams" },
      "format": "grupos-eliminacion",
      "groups": { "count": 4, "size": 4, "legs": 1 },
      "draw": { "pots": false },
      "qualify": { "perGroup": 2, "bestRunnersUp": 0 },
      "knockout": {
        "legs": 1,
        "neutral": true,
        "thirdPlace": true,
        "seed": "group-standings",
        "plan": "standard",
        "byeJoin": "adjacent"
      }
    }
  ]
}`);

function makeTeams(): Team[] {
  return Array.from({ length: 16 }, (_, i) => ({
    id: `C${i + 1}`,
    name: `Club ${i + 1}`,
    flag: '',
    skill: 80 - i,
    modeId: 'clubes',
  }));
}

/** RNG determinista para que la temporada sea reproducible. */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// Sin Supabase: el modo corre entero en memoria, que es lo que hace falta
// probar (la persistencia ya tiene sus propios tests).
vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured: () => false,
  supabase: {},
  escapeOrValue: (v: string) => v,
}));

describe('un modo nuevo, sólo con modes.config', () => {
  beforeEach(() => {
    useTournamentStore.setState({ teams: makeTeams() });
    useSeasonModeStore.getState().reset();
  });

  it('la config valida y produce un descriptor', () => {
    const parsed = parseModeConfig(MUNDIAL_DE_CLUBES, 'league-system');
    expect(parsed.ok).toBe(true);
  });

  it('se juega una temporada entera y corona campeón', async () => {
    const parsed = parseModeConfig(MUNDIAL_DE_CLUBES, 'league-system');
    if (!parsed.ok) throw new Error('la config no validó');
    const descriptor = parsed.descriptor;

    useSeasonModeStore.setState({
      modeId: 'clubes',
      descriptor,
      year: 2030,
      currentYear: 2030,
      availableYears: [2030],
      divisions: {},
      previousDivisions: null,
      tournaments: [],
      status: 'ready',
      busy: false,
    });

    const rng = seededRng(2030);
    await useSeasonModeStore.getState().startSeason();

    const run = () =>
      useSeasonModeStore
        .getState()
        .tournaments.find((t): t is GruposEliminacionTournament => t.format === 'grupos-eliminacion')!;

    // 4 grupos de 4, una rueda: 3 fechas de 8 partidos.
    expect(run().state.groups.groups).toHaveLength(4);
    expect(run().state.groups.groups.flatMap((g) => g.matches)).toHaveLength(24);
    expect(run().state.bracket).toBeNull();

    for (let md = 1; md <= 3; md++) {
      await useSeasonModeStore.getState().simulateMatchday(run().id, md, rng);
    }

    // Terminados los grupos, el cuadro se sortea solo: 8 clasificados.
    expect(isGroupStageComplete(run().state.groups)).toBe(true);
    const bracket = run().state.bracket!;
    expect(bracket).not.toBeNull();
    expect(bracket.rounds[0].round).toBe('quarter');
    expect(bracket.rounds[0].ties).toHaveLength(4);
    // Partido único, en cancha neutral, como pide la config.
    expect(bracket.legs).toBe(1);
    expect(bracket.neutral).toBe(true);
    expect(bracket.rounds[0].ties.every((t) => t.matches.length === 1)).toBe(true);

    // Jugar todo lo que quede pendiente, ronda tras ronda, hasta que no haya más.
    for (let guard = 0; guard < 20; guard++) {
      const current = run().state.bracket!;
      const pending = [
        ...current.rounds.flatMap((r) => r.ties),
        ...(current.thirdPlaceTie ? [current.thirdPlaceTie] : []),
      ].filter((t) => !t.winnerId && t.homeTeamId && t.awayTeamId);
      if (pending.length === 0) break;
      for (const tie of pending) {
        await useSeasonModeStore.getState().simulateTie(run().id, tie.id, rng);
      }
    }

    const final = run().state.bracket!;
    expect(final.rounds.map((r) => r.round)).toEqual(['quarter', 'semi', 'final']);
    expect(final.championId).toBeDefined();
    expect(final.runnerUpId).toBeDefined();
    // La config pidió tercer puesto: se jugó.
    expect(final.thirdPlaceId).toBeDefined();
    expect(isBracketComplete(final)).toBe(true);
    expect(run().status).toBe('completed');

    // El campeón y el subcampeón salieron de los grupos, no del aire.
    const qualified = new Set(
      run().state.groups.groups.flatMap((g) => g.standings.slice(0, 2).map((s) => s.teamId)),
    );
    expect(qualified.has(final.championId!)).toBe(true);
    expect(qualified.has(final.runnerUpId!)).toBe(true);

    // Y el skill de los equipos se movió: corrió el mismo motor Elo de siempre.
    const skills = useTournamentStore.getState().teams.map((t) => t.skill);
    expect(skills.some((s, i) => s !== 80 - i)).toBe(true);
  });

  it('se navega sin tocar un componente', async () => {
    const parsed = parseModeConfig(MUNDIAL_DE_CLUBES, 'league-system');
    if (!parsed.ok) throw new Error('la config no validó');

    const nav = deriveModeNav({
      descriptor: parsed.descriptor,
      currentView: 'league',
      runningCompetitionIds: ['mundialito'],
    });
    expect(nav.sections[0].items.map((i) => [i.label, i.icon, i.target.tab])).toEqual([
      ['Mundial de Clubes', 'trophy', 'mundialito'],
    ]);
    expect(nav.tab).toBe('mundialito');
    expect(nav.allowed).toEqual(['league', 'comparison', 'favorites', 'champions', 'history', 'settings']);
    expect(nav.primary.map((i) => i.shortLabel)).toEqual(['INICIO', 'VERSUS', 'FAVS', 'REYES']);
  });
});
