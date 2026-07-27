import { describe, it, expect, vi } from 'vitest';
import type { GameMode } from '../../types';
import {
  BUILTIN_DESCRIPTORS,
  SELECCIONES_DESCRIPTOR,
  VILLAMARIENSE_DESCRIPTOR,
  competitionById,
  descriptorForMode,
} from '../registry';
import { parseModeConfig, validateDescriptor } from '../schema';
import type { ModeDescriptor } from '../types';

function makeMode(patch: Partial<GameMode> = {}): GameMode {
  return {
    id: 'test',
    name: 'Test',
    kind: 'league-system',
    config: {},
    currentYear: 2026,
    ...patch,
  };
}

describe('descriptores built-in', () => {
  it('los dos modos que ya existen validan sin errores', () => {
    expect(validateDescriptor(SELECCIONES_DESCRIPTOR)).toEqual([]);
    expect(validateDescriptor(VILLAMARIENSE_DESCRIPTOR)).toEqual([]);
  });

  it('Villamariense valida con sus tamaños reales de división', () => {
    const ctx = { divisionSizes: { A: 16, B: 16 } };
    expect(validateDescriptor(VILLAMARIENSE_DESCRIPTOR, ctx)).toEqual([]);
  });

  it('el descriptor de Villamariense describe la temporada actual', () => {
    const d = VILLAMARIENSE_DESCRIPTOR;
    expect(d.divisions).toEqual(['A', 'B']);
    expect(d.promotion).toEqual({ count: 3 });
    expect(d.engine).toBe('season');

    const ligaA = competitionById(d, 'league-A');
    expect(ligaA).toMatchObject({ format: 'liga', legs: 2 });

    const copa = competitionById(d, 'cup');
    expect(copa).toMatchObject({
      format: 'eliminacion',
      legs: 2,
      neutral: false,
      thirdPlace: false,
      entrants: { from: 'cross-divisions', divisions: ['A', 'B'], usePreviousYear: true },
    });
  });

  it('el descriptor de selecciones describe las cuatro fases del ciclo', () => {
    const d = SELECCIONES_DESCRIPTOR;
    expect(d.engine).toBe('national-cycle');
    expect(d.competitions.map((c) => c.id)).toEqual([
      'continental',
      'confederations',
      'qualifiers',
      'world-cup',
    ]);

    // Las clasificatorias son grupos SIN cuadro: clasifican hacia el Mundial.
    const qualifiers = competitionById(d, 'qualifiers');
    expect(qualifiers).toMatchObject({
      format: 'grupos-eliminacion',
      knockout: null,
      groups: { size: 5, fixtureTemplate: 'fifa-5' },
    });

    const wc = competitionById(d, 'world-cup');
    expect(wc).toMatchObject({
      entrants: { from: 'competition', competitionId: 'qualifiers', take: 'qualified' },
      knockout: { plan: 'fifa-32' },
    });
  });

  /**
   * El criterio de aceptación de toda la unificación: si un descriptor built-in
   * sobrevive el viaje de ida y vuelta por JSON —que es exactamente lo que hace
   * `modes.config`—, entonces dar de alta un modo nuevo es escribir esa config y
   * sembrar equipos. Si esto se rompe, hay algo que sólo se puede expresar en
   * TypeScript, y la unificación no terminó.
   */
  it.each([
    ['selecciones', SELECCIONES_DESCRIPTOR],
    ['villamariense', VILLAMARIENSE_DESCRIPTOR],
  ])('%s sobrevive ida y vuelta por modes.config', (_name, descriptor) => {
    const asJson = JSON.parse(JSON.stringify(descriptor));
    const parsed = parseModeConfig(asJson);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.descriptor).toEqual(descriptor);
  });
});

describe('validateDescriptor — invariantes cruzadas', () => {
  const base: ModeDescriptor = {
    divisions: ['A', 'B'],
    promotion: null,
    competitions: [],
    theme: 'x',
    extraTabs: [],
    dataTabs: [],
    archiveTabs: [],
    engine: 'season',
  };

  it('rechaza una división que no existe', () => {
    const errors = validateDescriptor({
      ...base,
      competitions: [
        {
          id: 'l', name: 'L', order: 1, stage: 'league',
          entrants: { from: 'division', division: 'C' },
          format: 'liga', legs: 2,
        },
      ],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"C" no existe');
  });

  it('rechaza ascensos que no entran en la división', () => {
    const errors = validateDescriptor(
      { ...base, promotion: { count: 3 } },
      { divisionSizes: { A: 16, B: 5 } },
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"B"');
  });

  it('rechaza ascensos sin al menos dos divisiones', () => {
    const errors = validateDescriptor({ ...base, divisions: ['A'], promotion: { count: 1 } });
    expect(errors).toEqual(['promotion: hacen falta al menos 2 divisiones para ascender o descender']);
  });

  it('rechaza un cruce entre divisiones de distinto tamaño', () => {
    const errors = validateDescriptor(
      {
        ...base,
        competitions: [
          {
            id: 'cup', name: 'Copa', order: 1, stage: 'cup',
            entrants: { from: 'cross-divisions', divisions: ['A', 'B'] },
            format: 'eliminacion', legs: 2, neutral: false, thirdPlace: false,
            seed: 'cross-division', plan: 'standard', byeJoin: 'adjacent',
          },
        ],
      },
      { divisionSizes: { A: 16, B: 12 } },
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('mismo tamaño');
  });

  it('rechaza un cuadro que no se puede armar con los clasificados', () => {
    const errors = validateDescriptor({
      ...base,
      competitions: [
        {
          id: 'wc', name: 'WC', order: 1, stage: 'world-cup-group',
          entrants: { from: 'all-teams' },
          format: 'grupos-eliminacion',
          groups: { count: 5, size: 4, legs: 1 },
          draw: { pots: true },
          qualify: { perGroup: 2, bestRunnersUp: 0 },
          knockout: {
            legs: 1, neutral: true, thirdPlace: true,
            seed: 'group-standings', plan: 'standard', byeJoin: 'adjacent',
          },
        },
      ],
    });
    // 5 grupos x 2 = 10 clasificados: no es potencia de 2.
    expect(errors.some((e) => e.includes('10 clasificados'))).toBe(true);
  });

  it('el plan fifa-32 pide 16 grupos con 2 clasificados', () => {
    const errors = validateDescriptor({
      ...base,
      competitions: [
        {
          id: 'wc', name: 'WC', order: 1, stage: 'world-cup-group',
          entrants: { from: 'all-teams' },
          format: 'grupos-eliminacion',
          groups: { count: 8, size: 4, legs: 1 },
          draw: { pots: true },
          qualify: { perGroup: 4, bestRunnersUp: 0 },
          knockout: {
            legs: 1, neutral: true, thirdPlace: true,
            seed: 'group-standings', plan: 'fifa-32', byeJoin: 'adjacent',
          },
        },
      ],
    });
    expect(errors.some((e) => e.includes('fifa-32'))).toBe(true);
  });

  it('una competición no puede alimentarse de otra posterior', () => {
    const errors = validateDescriptor({
      ...base,
      competitions: [
        {
          id: 'a', name: 'A', order: 2, stage: 'cup',
          entrants: { from: 'competition', competitionId: 'b', take: 'qualified' },
          format: 'eliminacion', legs: 1, neutral: true, thirdPlace: false,
          seed: 'by-skill', plan: 'standard', byeJoin: 'adjacent',
        },
        {
          id: 'b', name: 'B', order: 3, stage: 'league',
          entrants: { from: 'all-teams' }, format: 'liga', legs: 1,
        },
      ],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('tiene que ir antes');
  });

  it('rechaza plantillas que no coinciden con el tamaño del grupo', () => {
    const errors = validateDescriptor({
      ...base,
      competitions: [
        {
          id: 'g', name: 'G', order: 1, stage: 'qualifier',
          entrants: { from: 'all-teams' },
          format: 'grupos-eliminacion',
          groups: { count: 4, size: 4, legs: 1, fixtureTemplate: 'fifa-5' },
          draw: { pots: true },
          qualify: { perGroup: 2, bestRunnersUp: 0 },
          knockout: null,
        },
      ],
    });
    expect(errors).toEqual(['competición "g": la plantilla fifa-5 es para grupos de 5, no de 4']);
  });
});

describe('parseModeConfig', () => {
  it('una config sin competiciones no es un error: es "usá el built-in"', () => {
    expect(parseModeConfig({})).toEqual({ ok: false, reason: 'empty' });
    expect(parseModeConfig({ theme: 'x' })).toEqual({ ok: false, reason: 'empty' });
    expect(parseModeConfig(null)).toEqual({ ok: false, reason: 'empty' });
  });

  it('informa cada campo mal escrito con su ruta', () => {
    const parsed = parseModeConfig({
      divisions: ['A'],
      competitions: [{ id: 'l', name: 'L', order: 1, stage: 'inventada', entrants: { from: 'all-teams' }, format: 'liga', legs: 2 }],
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok && parsed.reason === 'invalid') {
      expect(parsed.errors[0]).toContain('competitions[0].stage');
    }
  });

  it('rechaza legs que no sean 1 o 2', () => {
    const parsed = parseModeConfig({
      divisions: ['A'],
      competitions: [{ id: 'l', name: 'L', order: 1, stage: 'league', entrants: { from: 'division', division: 'A' }, format: 'liga', legs: 3 }],
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok && parsed.reason === 'invalid') {
      expect(parsed.errors.some((e) => e.includes('legs'))).toBe(true);
    }
  });

  it('acepta una liga mínima de una sola rueda', () => {
    const parsed = parseModeConfig({
      divisions: ['Única'],
      engine: 'season',
      theme: 'selecciones',
      competitions: [
        {
          id: 'liga', name: 'Liga', order: 1, stage: 'league',
          entrants: { from: 'division', division: 'Única' },
          format: 'liga', legs: 1,
        },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.descriptor.competitions).toHaveLength(1);
      expect(parsed.descriptor.divisions).toEqual(['Única']);
    }
  });

  it('ordena las competiciones por `order`', () => {
    const parsed = parseModeConfig({
      engine: 'season',
      competitions: [
        { id: 'b', name: 'B', order: 5, stage: 'league', entrants: { from: 'all-teams' }, format: 'liga', legs: 1 },
        { id: 'a', name: 'A', order: 2, stage: 'league', entrants: { from: 'all-teams' }, format: 'liga', legs: 1 },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.descriptor.competitions.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('descriptorForMode', () => {
  it('sin config cae al built-in de su kind', () => {
    expect(descriptorForMode(makeMode({ kind: 'league-system' }))).toEqual(VILLAMARIENSE_DESCRIPTOR);
    expect(descriptorForMode(makeMode({ kind: 'national-cycle' }))).toEqual(SELECCIONES_DESCRIPTOR);
    expect(BUILTIN_DESCRIPTORS['league-system']).toBe(VILLAMARIENSE_DESCRIPTOR);
  });

  it('sin modo devuelve el de selecciones', () => {
    expect(descriptorForMode(null)).toEqual(SELECCIONES_DESCRIPTOR);
  });

  it('config.theme pisa el tema del built-in', () => {
    const d = descriptorForMode(makeMode({ config: { theme: 'retro' } }));
    expect(d.theme).toBe('retro');
    expect(d.competitions).toEqual(VILLAMARIENSE_DESCRIPTOR.competitions);
  });

  it('una config inválida avisa y cae al built-in', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const d = descriptorForMode(makeMode({ config: { competitions: 'no es una lista' } }));

    expect(d).toEqual(VILLAMARIENSE_DESCRIPTOR);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('una config válida gana sobre el built-in', () => {
    const config = {
      divisions: ['Primera'],
      engine: 'season',
      theme: 'villamariense',
      extraTabs: ['season'],
      competitions: [
        {
          id: 'liga', name: 'Liga', order: 1, stage: 'league',
          entrants: { from: 'division', division: 'Primera' },
          format: 'liga', legs: 2,
        },
      ],
    };
    const d = descriptorForMode(makeMode({ config }));
    expect(d.divisions).toEqual(['Primera']);
    expect(d.competitions.map((c) => c.id)).toEqual(['liga']);
  });
});
