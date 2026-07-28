import type { ModeKind } from '../types';
import type {
  BracketSeed,
  Competition,
  CompetitionFormat,
  EliminacionSpec,
  EntrantsSource,
  IconKey,
  ModeDescriptor,
  ModeEngine,
} from './types';

/**
 * Validación de `modes.config` a mano. El repo no tiene zod y meterlo por esto
 * sería traer una dependencia para un solo archivo.
 *
 * Hay dos capas y hacen cosas distintas:
 *  - `parseModeConfig` valida la FORMA (que los campos existan y sean del tipo
 *    que dicen ser), sin la cual no se puede ni leer el descriptor.
 *  - `validateDescriptor` valida las INVARIANTES CRUZADAS: que las divisiones
 *    que se nombran existan, que los ascensos sean posibles, que un cuadro sea
 *    armable con los clasificados que se prometen. Son las que hoy revientan en
 *    runtime, cada una en su rincón del código.
 */

export type ParseResult =
  | { ok: true; descriptor: ModeDescriptor }
  /** No hay descriptor en la config: hay que caer al built-in, sin ruido. */
  | { ok: false; reason: 'empty' }
  | { ok: false; reason: 'invalid'; errors: string[] };

// ---------------------------------------------------------------------------
// Primitivas
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;

function isRecord(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

class Errors {
  readonly list: string[] = [];
  at(path: string, message: string): void {
    this.list.push(`${path}: ${message}`);
  }
}

function str(e: Errors, path: string, v: unknown): string | null {
  if (typeof v !== 'string' || v === '') {
    e.at(path, 'se esperaba un texto no vacío');
    return null;
  }
  return v;
}

function int(e: Errors, path: string, v: unknown, min = 0): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min) {
    e.at(path, `se esperaba un entero >= ${min}`);
    return null;
  }
  return v;
}

function bool(e: Errors, path: string, v: unknown): boolean | null {
  if (typeof v !== 'boolean') {
    e.at(path, 'se esperaba true o false');
    return null;
  }
  return v;
}

function oneOf<T extends string>(
  e: Errors,
  path: string,
  v: unknown,
  allowed: readonly T[],
): T | null {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    e.at(path, `se esperaba uno de: ${allowed.join(', ')}`);
    return null;
  }
  return v as T;
}

function legs(e: Errors, path: string, v: unknown): 1 | 2 | null {
  if (v !== 1 && v !== 2) {
    e.at(path, 'se esperaba 1 (una rueda / partido único) o 2 (ida y vuelta)');
    return null;
  }
  return v;
}

const ICON_KEYS: readonly IconKey[] = [
  'trophy', 'shield', 'globe', 'route', 'calendar', 'flow', 'crest',
  'medal', 'chart', 'compare', 'star', 'history', 'archive', 'settings', 'home',
];

const STAGES = [
  'qualifier', 'world-cup-group', 'world-cup-knockout', 'continental',
  'confed-group', 'confed-knockout', 'league', 'cup',
] as const;

const FORMATS: readonly CompetitionFormat[] = ['liga', 'grupos-eliminacion', 'eliminacion'];
const SEEDS: readonly BracketSeed[] = ['by-skill', 'random', 'cross-division', 'group-standings'];
const ENGINES: readonly ModeEngine[] = ['season', 'national-cycle'];

// ---------------------------------------------------------------------------
// Forma
// ---------------------------------------------------------------------------

function parseEntrants(e: Errors, path: string, v: unknown): EntrantsSource | null {
  if (!isRecord(v)) {
    e.at(path, 'se esperaba un objeto');
    return null;
  }
  const from = oneOf(e, `${path}.from`, v.from, [
    'division', 'all-teams', 'cross-divisions', 'competition',
  ] as const);
  if (!from) return null;

  switch (from) {
    case 'all-teams':
      return { from };
    case 'division': {
      const division = str(e, `${path}.division`, v.division);
      return division ? { from, division } : null;
    }
    case 'cross-divisions': {
      const divs = v.divisions;
      if (!Array.isArray(divs) || divs.length !== 2 || !divs.every((d) => typeof d === 'string')) {
        e.at(`${path}.divisions`, 'se esperaban exactamente dos nombres de división');
        return null;
      }
      return {
        from,
        divisions: [divs[0] as string, divs[1] as string],
        ...(v.usePreviousYear === true ? { usePreviousYear: true } : {}),
      };
    }
    case 'competition': {
      const competitionId = str(e, `${path}.competitionId`, v.competitionId);
      const take = oneOf(e, `${path}.take`, v.take, ['qualified', 'champion-runner-up'] as const);
      return competitionId && take ? { from, competitionId, take } : null;
    }
  }
}

function parseEliminacion(e: Errors, path: string, v: Rec): EliminacionSpec | null {
  const l = legs(e, `${path}.legs`, v.legs);
  const neutral = bool(e, `${path}.neutral`, v.neutral);
  const thirdPlace = bool(e, `${path}.thirdPlace`, v.thirdPlace);
  const seed = oneOf(e, `${path}.seed`, v.seed, SEEDS);
  const plan = oneOf(e, `${path}.plan`, v.plan, ['standard', 'fifa-32'] as const);
  const byeJoin = oneOf(e, `${path}.byeJoin`, v.byeJoin, ['adjacent', 'reseed'] as const);
  if (l === null || neutral === null || thirdPlace === null || !seed || !plan || !byeJoin) {
    return null;
  }
  return { legs: l, neutral, thirdPlace, seed, plan, byeJoin };
}

function parseCompetition(e: Errors, path: string, v: unknown): Competition | null {
  if (!isRecord(v)) {
    e.at(path, 'se esperaba un objeto');
    return null;
  }

  const id = str(e, `${path}.id`, v.id);
  const name = str(e, `${path}.name`, v.name);
  const order = int(e, `${path}.order`, v.order, 0);
  const stage = oneOf(e, `${path}.stage`, v.stage, STAGES);
  const entrants = parseEntrants(e, `${path}.entrants`, v.entrants);
  const format = oneOf(e, `${path}.format`, v.format, FORMATS);

  if (v.icon !== undefined && !oneOf(e, `${path}.icon`, v.icon, ICON_KEYS)) return null;
  if (v.shortLabel !== undefined && !str(e, `${path}.shortLabel`, v.shortLabel)) return null;

  if (!id || !name || order === null || !stage || !entrants || !format) return null;

  const base = {
    id,
    name,
    order,
    stage,
    entrants,
    ...(typeof v.shortLabel === 'string' ? { shortLabel: v.shortLabel } : {}),
    ...(typeof v.icon === 'string' ? { icon: v.icon as IconKey } : {}),
    ...(v.primary === true ? { primary: true } : {}),
  };

  if (format === 'liga') {
    const l = legs(e, `${path}.legs`, v.legs);
    if (l === null) return null;
    const top = v.highlightTop === undefined ? null : int(e, `${path}.highlightTop`, v.highlightTop);
    const bottom =
      v.highlightBottom === undefined ? null : int(e, `${path}.highlightBottom`, v.highlightBottom);
    return {
      ...base,
      format,
      legs: l,
      ...(top !== null ? { highlightTop: top } : {}),
      ...(bottom !== null ? { highlightBottom: bottom } : {}),
    };
  }

  if (format === 'eliminacion') {
    const spec = parseEliminacion(e, path, v);
    return spec ? { ...base, format, ...spec } : null;
  }

  // grupos-eliminacion
  if (!isRecord(v.groups)) {
    e.at(`${path}.groups`, 'se esperaba un objeto');
    return null;
  }
  const count = int(e, `${path}.groups.count`, v.groups.count, 1);
  const size = int(e, `${path}.groups.size`, v.groups.size, 2);
  const groupLegs = legs(e, `${path}.groups.legs`, v.groups.legs);
  const template =
    v.groups.fixtureTemplate === undefined
      ? undefined
      : oneOf(e, `${path}.groups.fixtureTemplate`, v.groups.fixtureTemplate, [
          'fifa-4', 'fifa-5',
        ] as const);
  if (v.groups.fixtureTemplate !== undefined && !template) return null;

  if (!isRecord(v.draw)) {
    e.at(`${path}.draw`, 'se esperaba un objeto');
    return null;
  }
  const pots = bool(e, `${path}.draw.pots`, v.draw.pots);

  if (!isRecord(v.qualify)) {
    e.at(`${path}.qualify`, 'se esperaba un objeto');
    return null;
  }
  const perGroup = int(e, `${path}.qualify.perGroup`, v.qualify.perGroup, 1);
  const bestRunnersUp = int(e, `${path}.qualify.bestRunnersUp`, v.qualify.bestRunnersUp, 0);

  let knockout: EliminacionSpec | null = null;
  if (v.knockout !== null && v.knockout !== undefined) {
    if (!isRecord(v.knockout)) {
      e.at(`${path}.knockout`, 'se esperaba un objeto o null');
      return null;
    }
    knockout = parseEliminacion(e, `${path}.knockout`, v.knockout);
    if (!knockout) return null;
  }

  if (
    count === null || size === null || groupLegs === null || pots === null ||
    perGroup === null || bestRunnersUp === null
  ) {
    return null;
  }

  return {
    ...base,
    format,
    groups: { count, size, legs: groupLegs, ...(template ? { fixtureTemplate: template } : {}) },
    draw: {
      pots,
      ...(v.draw.snake === true ? { snake: true } : {}),
      ...(v.draw.avoidSameRegion === true ? { avoidSameRegion: true } : {}),
    },
    qualify: { perGroup, bestRunnersUp },
    knockout,
  };
}

const VIEWS = new Set([
  'wizard', 'qualifiers', 'worldcup', 'stats', 'settings', 'history', 'matches',
  'comparison', 'tournaments', 'champions', 'continental', 'confederations',
  'favorites', 'league',
]);

function parseViews(e: Errors, path: string, v: unknown): ModeDescriptor['dataTabs'] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    e.at(path, 'se esperaba una lista de vistas');
    return [];
  }
  const out: ModeDescriptor['dataTabs'] = [];
  for (const [i, item] of v.entries()) {
    if (typeof item !== 'string' || !VIEWS.has(item)) {
      e.at(`${path}[${i}]`, 'vista desconocida');
      continue;
    }
    out.push(item as ModeDescriptor['dataTabs'][number]);
  }
  return out;
}

/**
 * Lee un descriptor de `modes.config`. Una config sin `competitions` no es un
 * error: es un modo que todavía se describe con su built-in.
 */
export function parseModeConfig(raw: unknown, kind?: ModeKind): ParseResult {
  if (!isRecord(raw) || raw.competitions === undefined) return { ok: false, reason: 'empty' };

  const e = new Errors();

  if (!Array.isArray(raw.competitions)) {
    e.at('competitions', 'se esperaba una lista');
    return { ok: false, reason: 'invalid', errors: e.list };
  }

  const competitions: Competition[] = [];
  raw.competitions.forEach((item, i) => {
    const parsed = parseCompetition(e, `competitions[${i}]`, item);
    if (parsed) competitions.push(parsed);
  });

  const divisions: string[] = [];
  if (raw.divisions !== undefined) {
    if (!Array.isArray(raw.divisions)) {
      e.at('divisions', 'se esperaba una lista de nombres');
    } else {
      raw.divisions.forEach((d, i) => {
        const name = str(e, `divisions[${i}]`, d);
        if (name) divisions.push(name);
      });
    }
  }

  let promotion: ModeDescriptor['promotion'] = null;
  if (raw.promotion !== null && raw.promotion !== undefined) {
    if (!isRecord(raw.promotion)) {
      e.at('promotion', 'se esperaba un objeto o null');
    } else {
      const count = int(e, 'promotion.count', raw.promotion.count, 1);
      if (count !== null) promotion = { count };
    }
  }

  const engine =
    raw.engine === undefined
      ? kind === 'league-system'
        ? 'season'
        : 'national-cycle'
      : oneOf(e, 'engine', raw.engine, ENGINES);

  const extraTabs: ModeDescriptor['extraTabs'] = [];
  if (raw.extraTabs !== undefined) {
    if (!Array.isArray(raw.extraTabs)) {
      e.at('extraTabs', 'se esperaba una lista');
    } else {
      raw.extraTabs.forEach((t, i) => {
        const tab = oneOf(e, `extraTabs[${i}]`, t, ['season', 'crests'] as const);
        if (tab) extraTabs.push(tab);
      });
    }
  }

  const dataTabs = parseViews(e, 'dataTabs', raw.dataTabs);
  const archiveTabs = parseViews(e, 'archiveTabs', raw.archiveTabs);
  const theme = raw.theme === undefined ? '' : (str(e, 'theme', raw.theme) ?? '');

  if (e.list.length > 0 || !engine) {
    return { ok: false, reason: 'invalid', errors: e.list };
  }

  const descriptor: ModeDescriptor = {
    divisions,
    promotion,
    competitions: [...competitions].sort((a, b) => a.order - b.order),
    theme: theme || (kind === 'league-system' ? 'villamariense' : 'selecciones'),
    extraTabs,
    dataTabs,
    archiveTabs,
    engine,
  };

  const crossErrors = validateDescriptor(descriptor);
  if (crossErrors.length > 0) return { ok: false, reason: 'invalid', errors: crossErrors };

  return { ok: true, descriptor };
}

// ---------------------------------------------------------------------------
// Invariantes cruzadas
// ---------------------------------------------------------------------------

export interface ValidateContext {
  /** Cuántos equipos tiene cada división. Sin esto no se chequean los tamaños. */
  divisionSizes?: Record<string, number>;
}

function isPowerOfTwo(n: number): boolean {
  return n >= 2 && (n & (n - 1)) === 0;
}

/**
 * Las reglas que hoy no están escritas en ningún lado y explotan en runtime:
 * una división que se nombra y no existe, un ascenso que se come media
 * categoría, dos divisiones de distinto tamaño en una copa cruzada, un cuadro
 * que no se puede armar con los clasificados que promete la fase de grupos.
 */
export function validateDescriptor(d: ModeDescriptor, ctx: ValidateContext = {}): string[] {
  const errors: string[] = [];
  const divisions = new Set(d.divisions);
  const sizes = ctx.divisionSizes;

  const seen = new Set<string>();
  for (const c of d.competitions) {
    if (seen.has(c.id)) errors.push(`competición "${c.id}": el id está repetido`);
    seen.add(c.id);
  }

  if (d.promotion) {
    if (d.divisions.length < 2) {
      errors.push('promotion: hacen falta al menos 2 divisiones para ascender o descender');
    }
    if (sizes) {
      for (const div of d.divisions) {
        const size = sizes[div];
        // El chequeo de core/formats/season.ts: no se puede mover más de media
        // división de una vez sin dejar la categoría sin equipos propios.
        if (size !== undefined && d.promotion.count * 2 > size) {
          errors.push(
            `promotion: ${d.promotion.count} movimientos no entran en la división "${div}" (${size} equipos)`,
          );
        }
      }
    }
  }

  for (const c of d.competitions) {
    const at = `competición "${c.id}"`;
    const entrants = c.entrants;

    switch (entrants.from) {
      case 'division':
        if (!divisions.has(entrants.division)) {
          errors.push(`${at}: la división "${entrants.division}" no existe en el modo`);
        }
        break;
      case 'cross-divisions': {
        const [a, b] = entrants.divisions;
        for (const div of [a, b]) {
          if (!divisions.has(div)) errors.push(`${at}: la división "${div}" no existe en el modo`);
        }
        if (sizes && sizes[a] !== undefined && sizes[b] !== undefined && sizes[a] !== sizes[b]) {
          errors.push(
            `${at}: un cruce entre divisiones necesita el mismo tamaño (${a}: ${sizes[a]}, ${b}: ${sizes[b]})`,
          );
        }
        break;
      }
      case 'competition': {
        const source = d.competitions.find((x) => x.id === entrants.competitionId);
        if (!source) {
          errors.push(`${at}: no existe la competición "${entrants.competitionId}"`);
        } else if (source.order >= c.order) {
          errors.push(`${at}: "${source.id}" tiene que ir antes (order menor)`);
        }
        break;
      }
      case 'all-teams':
        break;
    }

    if (c.format === 'grupos-eliminacion') {
      const { count, size, fixtureTemplate } = c.groups;
      if (fixtureTemplate === 'fifa-4' && size !== 4) {
        errors.push(`${at}: la plantilla fifa-4 es para grupos de 4, no de ${size}`);
      }
      if (fixtureTemplate === 'fifa-5' && size !== 5) {
        errors.push(`${at}: la plantilla fifa-5 es para grupos de 5, no de ${size}`);
      }
      if (c.qualify.perGroup > size) {
        errors.push(`${at}: no pueden clasificar ${c.qualify.perGroup} de un grupo de ${size}`);
      }
      if (c.knockout) {
        const slots = count * c.qualify.perGroup + c.qualify.bestRunnersUp;
        if (!isPowerOfTwo(slots)) {
          errors.push(
            `${at}: ${slots} clasificados no arman un cuadro (hace falta una potencia de 2)`,
          );
        }
        if (c.knockout.plan === 'fifa-32' && (count !== 16 || c.qualify.perGroup !== 2)) {
          errors.push(`${at}: el plan fifa-32 pide 16 grupos con 2 clasificados cada uno`);
        }
      }
    }

    if (c.format === 'eliminacion' && c.plan === 'fifa-32') {
      errors.push(`${at}: el plan fifa-32 sólo existe después de una fase de grupos`);
    }
  }

  return errors;
}
