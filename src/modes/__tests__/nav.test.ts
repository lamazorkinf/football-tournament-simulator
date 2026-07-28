import { describe, it, expect } from 'vitest';
import { deriveModeNav } from '../nav';
import { SELECCIONES_DESCRIPTOR, VILLAMARIENSE_DESCRIPTOR } from '../registry';
import { lockedViewsForCycle } from '../seleccionesAdapter';
import type { ModeDescriptor } from '../types';
import type { View } from '../../types/view';

/**
 * La navegación de un modo sale del descriptor. Estos tests fijan que los dos
 * modos que ya existen sigan navegándose EXACTAMENTE igual que cuando cada
 * componente tenía su lista escrita a mano, y que un modo nuevo no necesite
 * tocar ningún componente.
 */

const RUNNING = ['league-A', 'league-B', 'cup'];

function nationalNav(currentView: View = 'wizard') {
  return deriveModeNav({ descriptor: SELECCIONES_DESCRIPTOR, currentView });
}

function seasonNav(currentView: View = 'league', requestedTab = 'season') {
  return deriveModeNav({
    descriptor: VILLAMARIENSE_DESCRIPTOR,
    currentView,
    requestedTab,
    runningCompetitionIds: RUNNING,
  });
}

describe('deriveModeNav — ciclo mundialista', () => {
  it('mantiene las tres secciones y su contenido', () => {
    const nav = nationalNav();
    expect(nav.sections.map((s) => s.title)).toEqual(['Ciclo actual', 'Datos', 'Archivo', '']);
    expect(nav.sections[0].items.map((i) => i.target.view)).toEqual([
      'wizard', 'matches', 'continental', 'confederations', 'qualifiers', 'worldcup',
    ]);
    expect(nav.sections[1].items.map((i) => i.target.view)).toEqual([
      'stats', 'comparison', 'favorites',
    ]);
    expect(nav.sections[2].items.map((i) => i.target.view)).toEqual([
      'champions', 'history', 'tournaments',
    ]);
    expect(nav.sections[3].items.map((i) => i.target.view)).toEqual(['settings']);
  });

  it('la barra mobile sigue siendo INICIO / FECHA / CLASIF / COPA', () => {
    expect(nationalNav().primary.map((i) => i.shortLabel)).toEqual([
      'INICIO', 'FECHA', 'Clasif', 'Copa',
    ]);
  });

  it('el menú de pausa es todo lo que no entró en la barra', () => {
    const nav = nationalNav();
    expect(nav.overflow.map((i) => i.target.view)).toEqual([
      'continental', 'confederations', 'stats', 'comparison', 'favorites',
      'champions', 'history', 'tournaments', 'settings',
    ]);
  });

  it('la vista "league" no existe en este modo y cae en la raíz', () => {
    expect(nationalNav('league').view).toBe('wizard');
    expect(nationalNav('worldcup').view).toBe('worldcup');
    expect(nationalNav().allowed).not.toContain('league');
  });

  it('marca las fases bloqueadas por el progreso del ciclo', () => {
    const cycle = {
      continental: { brackets: {} },
      confederationsCup: { groups: [], isComplete: false },
      worldCup: null,
    } as never;
    const locked = lockedViewsForCycle(cycle);
    expect(locked).toEqual(['continental', 'confederations', 'qualifiers', 'worldcup']);

    const nav = deriveModeNav({
      descriptor: SELECCIONES_DESCRIPTOR,
      currentView: 'wizard',
      lockedViews: locked,
    });
    expect(nav.items.filter((i) => i.locked).map((i) => i.key)).toEqual([
      'continental', 'confederations', 'qualifiers', 'world-cup',
    ]);
    // Un ciclo terminado no bloquea nada.
    expect(lockedViewsForCycle(null)).toEqual([]);
  });
});

describe('deriveModeNav — modo de temporada', () => {
  it('las competiciones corriendo son la sub-navegación, en orden del descriptor', () => {
    const nav = seasonNav();
    expect(nav.sections[0].title).toBe('Temporada');
    expect(nav.sections[0].items.map((i) => i.key)).toEqual([
      'league-A', 'league-B', 'cup', 'season', 'crests',
    ]);
    expect(nav.sections[0].items.map((i) => i.label)).toEqual([
      'Liga A', 'Liga B', 'Copa', 'Temporada', 'Escudos',
    ]);
    // Todas apuntan a la vista raíz y se distinguen por su pestaña.
    expect(nav.sections[0].items.every((i) => i.target.view === 'league')).toBe(true);
  });

  it('sin temporada arrancada sólo hay Inicio y Escudos', () => {
    const nav = deriveModeNav({
      descriptor: VILLAMARIENSE_DESCRIPTOR,
      currentView: 'league',
      runningCompetitionIds: [],
    });
    expect(nav.sections[0].items.map((i) => i.key)).toEqual(['main', 'crests']);
    expect(nav.tab).toBe('main');
  });

  it('la pestaña pedida se respeta si existe, si no cae en la primera', () => {
    expect(seasonNav('league', 'cup').tab).toBe('cup');
    expect(seasonNav('league', 'no-existe').tab).toBe('league-A');
  });

  // La barra tiene 4 slots y `pickPrimary` los llena con raíz + Datos + Archivo.
  // Al declarar Campeones en el mismo orden que selecciones (antes que Historial),
  // REYES entra a la barra y DIARIO pasa al menú de pausa. Invertir el orden en
  // `archiveTabs` es lo único que hace falta para volver atrás.
  it('la barra mobile es INICIO / VERSUS / FAVS / REYES', () => {
    const nav = seasonNav();
    expect(nav.primary.map((i) => i.shortLabel)).toEqual(['INICIO', 'VERSUS', 'FAVS', 'REYES']);
    expect(nav.primary.map((i) => i.target.view)).toEqual([
      'league', 'comparison', 'favorites', 'champions',
    ]);
    expect(nav.overflow.map((i) => i.target.view)).toContain('history');
  });

  it('Campeones vive en Archivo, igual que en selecciones', () => {
    const archive = seasonNav().sections.find((s) => s.title === 'Archivo');
    expect(archive?.items.map((i) => i.target.view)).toEqual(['champions', 'history']);
  });

  it('sólo alcanza las vistas que declara el modo', () => {
    const nav = seasonNav();
    expect([...nav.allowed].sort()).toEqual(
      ['champions', 'comparison', 'favorites', 'history', 'league', 'settings'].sort(),
    );
    // Una vista del ciclo no aplica: se encarrila a la raíz del modo.
    expect(seasonNav('worldcup').view).toBe('league');
    expect(seasonNav('history').view).toBe('history');
    expect(seasonNav('champions').view).toBe('champions');
  });
});

describe('deriveModeNav — un modo nuevo se navega sin tocar componentes', () => {
  const MUNDIAL_DE_CLUBES: ModeDescriptor = {
    divisions: ['Primera'],
    promotion: null,
    competitions: [
      {
        id: 'liga',
        name: 'Torneo Apertura',
        shortLabel: 'APERT',
        icon: 'shield',
        order: 1,
        stage: 'league',
        entrants: { from: 'division', division: 'Primera' },
        format: 'liga',
        legs: 1,
      },
      {
        id: 'copa',
        name: 'Copa de Clubes',
        shortLabel: 'CLUBES',
        icon: 'trophy',
        order: 2,
        stage: 'cup',
        entrants: { from: 'division', division: 'Primera' },
        format: 'eliminacion',
        legs: 1,
        neutral: true,
        thirdPlace: true,
        seed: 'by-skill',
        plan: 'standard',
        byeJoin: 'adjacent',
      },
    ],
    theme: 'villamariense',
    extraTabs: [],
    dataTabs: ['favorites'],
    archiveTabs: ['champions'],
    engine: 'season',
  };

  it('sus competiciones e iconos aparecen tal cual las declara', () => {
    const nav = deriveModeNav({
      descriptor: MUNDIAL_DE_CLUBES,
      currentView: 'league',
      runningCompetitionIds: ['liga', 'copa'],
    });
    expect(nav.sections[0].items.map((i) => [i.label, i.icon])).toEqual([
      ['Torneo Apertura', 'shield'],
      ['Copa de Clubes', 'trophy'],
    ]);
    expect(nav.allowed).toEqual(['league', 'favorites', 'champions', 'settings']);
    // La barra se llena con la raíz y las vistas de datos que el modo declaró.
    expect(nav.primary.map((i) => i.target.view)).toEqual(['league', 'favorites', 'champions']);
  });
});
