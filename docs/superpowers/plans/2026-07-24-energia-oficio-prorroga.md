# Energía, oficio y prórroga — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el cansancio acumulado dentro de un torneo afecte el rendimiento del siguiente partido, que los partidos exigentes amplifiquen el peso del skill, y que los empates de eliminación directa se vayan al alargue antes que a los penales.

**Architecture:** Un módulo puro nuevo (`src/core/energy.ts`) concentra todas las fórmulas. El motor (`src/core/engine.ts`) pasa de cuatro parámetros posicionales a un objeto de contexto y aplica skill efectivo + oficio + alargue. El estado de energía vive dentro del `Cycle` y viaja en el documento JSONB que ya se persiste, sin migración. La única migración es una columna en `match_history` para distinguir un 2-1 de un 2-1 en el alargue.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest, Supabase (Postgres).

## Global Constraints

- **Spec de referencia:** `docs/superpowers/specs/2026-07-24-energia-oficio-prorroga-design.md`. Los valores numéricos de abajo salen de ahí y están calibrados con 20.000 Mundiales simulados; no cambiarlos por intuición.
- **Energía:** máximo 100, piso duro 60. Penalización `(100 − energía) × 0,2` puntos de skill.
- **Oficio:** ganancia 0,15. Dificultad del partido `normSkill(min(skillLocal, skillVisitante)) × (0,6 + 0,4 × normImp(importancia))`, **multiplicativa**.
- **Costo de partido:** base 6, dificultad del rival hasta +4, ajustado +2, alargue +7, penales +2; todo multiplicado por `(1 − 0,25 × normSkill(skillPropio))`.
- **Recuperación:** 4 por jornada transcurrida; 8 en clasificatorias.
- **Alargue:** `λ × (30/90) × 0,85`. Sólo en eliminación directa.
- **El Elo usa siempre el skill real, nunca el efectivo.**
- **Idioma:** comentarios y textos de UI en español, con acentos correctos. Los identificadores de código en inglés, como el resto del repo.
- **Copy de UI:** el chip dice `ALARGUE`, nunca `PRÓRROGA` — la Press Start 2P rompe las mayúsculas acentuadas.
- **Retrocompatibilidad:** un torneo guardado sin energía en su JSONB se lee como "todos al 100%"; un partido sin marca de alargue se lee como `false`. Las partidas en curso no se rompen.
- **Verificar la suite sin `tail`:** `npm test | tail -N` devuelve el exit code de `tail` y esconde el resumen. Usar `set -o pipefail` o leer el resumen completo.

---

### Task 1: Módulo de energía y su configuración

Todas las fórmulas del spec, puras y testeadas, más los valores en `EngineConfig`. Nada las consume todavía.

**Files:**
- Create: `src/core/energy.ts`
- Create: `src/core/__tests__/energy.test.ts`
- Modify: `src/store/useConfigStore.ts` (interface `EngineConfig`, `DEFAULT_CONFIG`, acción nueva)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type TournamentScope = 'continental' | 'confed' | 'wc-qualifiers' | 'world-cup'`
  - `type MatchStage = 'qualifier' | 'world-cup-group' | 'world-cup-knockout' | 'continental' | 'confed-group' | 'confed-knockout'`
  - `interface TeamEnergy { value: number; lastMatchdayIndex: number }`
  - `interface EnergyState { scope: TournamentScope; byTeam: Record<string, TeamEnergy> }`
  - `interface FatigueConfig` (campos abajo), `DEFAULT_FATIGUE: FatigueConfig`, `ENERGY_MAX = 100`
  - `scopeForStage(stage: MatchStage): TournamentScope`
  - `matchdayIndexFor(stage: MatchStage, round: KnockoutMatch['round'] | undefined, matchday: number | undefined): number`
  - `fatiguePenalty(energy: number, cfg: FatigueConfig): number`
  - `effectiveSkill(skill: number, energy: number, cfg: FatigueConfig): number`
  - `clutchMultiplier(homeSkill: number, awaySkill: number, importance: number, cfg: FatigueConfig): number`
  - `matchEnergyCost(input: EnergyCostInput, cfg: FatigueConfig): number`
  - `resolveEnergy(state: EnergyState | undefined, scope: TournamentScope, matchdayIndex: number, teamId: string, cfg: FatigueConfig): number`
  - `commitEnergy(state: EnergyState | undefined, scope: TournamentScope, matchdayIndex: number, updates: Array<{ teamId: string; energy: number }>, cfg: FatigueConfig): EnergyState`
  - En `useConfigStore`: `EngineConfig.fatigue: FatigueConfig` y `updateFatigue(patch: Partial<FatigueConfig>): void`

- [ ] **Step 1: Escribir los tests del módulo**

Crear `src/core/__tests__/energy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FATIGUE,
  ENERGY_MAX,
  clutchMultiplier,
  commitEnergy,
  effectiveSkill,
  fatiguePenalty,
  matchEnergyCost,
  matchdayIndexFor,
  resolveEnergy,
  scopeForStage,
} from '../energy';

const cfg = DEFAULT_FATIGUE;

describe('fatiguePenalty', () => {
  it('no penaliza a energía llena y penaliza 8 en el piso', () => {
    expect(fatiguePenalty(100, cfg)).toBe(0);
    expect(fatiguePenalty(60, cfg)).toBeCloseTo(8, 5);
  });

  it('es lineal: a mitad de camino, la mitad de la penalización', () => {
    expect(fatiguePenalty(80, cfg)).toBeCloseTo(4, 5);
  });

  it('con la fatiga apagada nunca penaliza', () => {
    expect(fatiguePenalty(60, { ...cfg, enabled: false })).toBe(0);
  });
});

describe('effectiveSkill', () => {
  it('un 96,2 exhausto rinde como 88,2', () => {
    expect(effectiveSkill(96.2, 60, cfg)).toBeCloseTo(88.2, 5);
  });
});

describe('clutchMultiplier', () => {
  // Es multiplicativo a propósito: una final contra un rival flojo NO es un
  // partido difícil. Con la fórmula aditiva anterior, un equipo exhausto le
  // ganaba a un rival muy inferior más seguido que en el motor sin fatiga.
  it('rival top en instancia máxima → multiplicador cerca del tope', () => {
    // min(96,2; 90,2) = 90,2 → normSkill ≈ 0,8600; importancia 1,6 → normImp 1
    // 0,8600 × 1 = 0,8600 → 1 + 0,8600 × 0,15 ≈ 1,129
    expect(clutchMultiplier(96.2, 90.2, 1.6, cfg)).toBeCloseTo(1.129, 3);
  });

  it('rival flojo en instancia máxima → multiplicador chico', () => {
    // min(94,8; 60) = 60 → normSkill ≈ 0,4286 → 1 + 0,4286 × 0,15 ≈ 1,064
    expect(clutchMultiplier(94.8, 60, 1.6, cfg)).toBeCloseTo(1.064, 3);
  });

  it('mismo cruce pesa más en una final que en fase de grupos', () => {
    const grupos = clutchMultiplier(85.4, 77.7, 1.25, cfg);
    const final = clutchMultiplier(85.4, 77.7, 1.6, cfg);
    expect(final).toBeGreaterThan(grupos);
  });

  it('importancia por encima del tope satura en vez de desbordar', () => {
    // El usuario puede subir los pesos desde Ajustes: el clamp es load-bearing.
    expect(clutchMultiplier(90, 90, 99, cfg)).toBeCloseTo(clutchMultiplier(90, 90, 1.6, cfg), 5);
  });

  it('con la fatiga apagada no amplifica nada', () => {
    expect(clutchMultiplier(96.2, 90.2, 1.6, { ...cfg, enabled: false })).toBe(1);
  });
});

describe('matchEnergyCost', () => {
  const base = { skill: 80, oppSkill: 80, importance: 1.6, tight: false, extraTime: false, penalties: false };

  it('el alargue cuesta 7 más que el mismo partido sin alargue, antes del plantel', () => {
    const sin = matchEnergyCost(base, cfg);
    const con = matchEnergyCost({ ...base, extraTime: true }, cfg);
    const factorPlantel = 1 - cfg.depthMax * ((80 - 30) / 70);
    expect(con - sin).toBeCloseTo(cfg.costExtraTime * factorPlantel, 5);
  });

  it('un rival más fuerte cuesta más energía', () => {
    const flojo = matchEnergyCost({ ...base, oppSkill: 40 }, cfg);
    const fuerte = matchEnergyCost({ ...base, oppSkill: 95 }, cfg);
    expect(fuerte).toBeGreaterThan(flojo);
  });

  it('el equipo con más skill paga menos por el mismo partido (plantel)', () => {
    // skill 30 es el piso de la escala: normSkill 0, así que no tiene descuento
    // y sirve de referencia contra el 100, que tiene el descuento máximo.
    const chico = matchEnergyCost({ ...base, skill: 30 }, cfg);
    const grande = matchEnergyCost({ ...base, skill: 100 }, cfg);
    expect(grande).toBeCloseTo(chico * (1 - cfg.depthMax), 5);
  });
});

describe('scopeForStage', () => {
  it('grupos y knockout del Mundial son el MISMO torneo', () => {
    expect(scopeForStage('world-cup-group')).toBe('world-cup');
    expect(scopeForStage('world-cup-knockout')).toBe('world-cup');
  });

  it('grupos y knockout de Confederaciones son el mismo torneo', () => {
    expect(scopeForStage('confed-group')).toBe('confed');
    expect(scopeForStage('confed-knockout')).toBe('confed');
  });

  it('clasificatorias y continental son torneos propios', () => {
    expect(scopeForStage('qualifier')).toBe('wc-qualifiers');
    expect(scopeForStage('continental')).toBe('continental');
  });
});

describe('matchdayIndexFor', () => {
  it('en fases de grupos usa la jornada del partido', () => {
    expect(matchdayIndexFor('world-cup-group', undefined, 2)).toBe(2);
    expect(matchdayIndexFor('qualifier', undefined, 7)).toBe(7);
  });

  it('el knockout del Mundial continúa después de las 3 jornadas de grupos', () => {
    // knockout.ts NO asigna matchday: el índice sale de la ronda.
    expect(matchdayIndexFor('world-cup-knockout', 'round-of-32', undefined)).toBe(4);
    expect(matchdayIndexFor('world-cup-knockout', 'round-of-16', undefined)).toBe(5);
    expect(matchdayIndexFor('world-cup-knockout', 'final', undefined)).toBe(8);
  });

  it('tercer puesto y final se juegan en la misma jornada', () => {
    expect(matchdayIndexFor('world-cup-knockout', 'third-place', undefined)).toBe(
      matchdayIndexFor('world-cup-knockout', 'final', undefined),
    );
  });

  it('la continental arranca en R64 sin fase de grupos previa', () => {
    expect(matchdayIndexFor('continental', 'round-of-64', 1)).toBe(1);
    expect(matchdayIndexFor('continental', 'round-of-32', undefined)).toBe(2);
    expect(matchdayIndexFor('continental', 'final', undefined)).toBe(6);
  });

  it('Confederaciones arranca su knockout en semis, tras 3 jornadas de grupos', () => {
    expect(matchdayIndexFor('confed-group', undefined, 3)).toBe(3);
    expect(matchdayIndexFor('confed-knockout', 'semi', undefined)).toBe(4);
    expect(matchdayIndexFor('confed-knockout', 'final', undefined)).toBe(5);
  });

  it('sin jornada ni ronda cae en 1 en vez de romper', () => {
    expect(matchdayIndexFor('qualifier', undefined, undefined)).toBe(1);
  });
});

describe('resolveEnergy', () => {
  it('un equipo sin estado previo arranca lleno', () => {
    expect(resolveEnergy(undefined, 'world-cup', 1, 'bel', cfg)).toBe(ENERGY_MAX);
  });

  it('recupera por cada jornada transcurrida desde su último partido', () => {
    const state = commitEnergy(undefined, 'world-cup', 4, [{ teamId: 'bel', energy: 70 }], cfg);
    expect(resolveEnergy(state, 'world-cup', 5, 'bel', cfg)).toBeCloseTo(74, 5);
    // Dos jornadas sin jugar (fecha libre o bye) recuperan el doble.
    expect(resolveEnergy(state, 'world-cup', 6, 'bel', cfg)).toBeCloseTo(78, 5);
  });

  it('las clasificatorias recuperan más rápido que un torneo corto', () => {
    const state = commitEnergy(undefined, 'wc-qualifiers', 1, [{ teamId: 'bel', energy: 70 }], cfg);
    expect(resolveEnergy(state, 'wc-qualifiers', 2, 'bel', cfg)).toBeCloseTo(78, 5);
  });

  it('nunca supera el máximo por más que descanse', () => {
    const state = commitEnergy(undefined, 'world-cup', 1, [{ teamId: 'bel', energy: 90 }], cfg);
    expect(resolveEnergy(state, 'world-cup', 20, 'bel', cfg)).toBe(ENERGY_MAX);
  });

  it('cambiar de torneo resetea a lleno', () => {
    const state = commitEnergy(undefined, 'continental', 6, [{ teamId: 'bel', energy: 62 }], cfg);
    expect(resolveEnergy(state, 'world-cup', 1, 'bel', cfg)).toBe(ENERGY_MAX);
  });

  it('el Mundial NO se resetea al pasar de grupos a knockout', () => {
    const state = commitEnergy(undefined, 'world-cup', 3, [{ teamId: 'bel', energy: 88 }], cfg);
    // scope 'world-cup' cubre las dos fases: sigue el desgaste, sólo recupera.
    expect(resolveEnergy(state, 'world-cup', 4, 'bel', cfg)).toBeCloseTo(92, 5);
  });
});

describe('commitEnergy', () => {
  it('respeta el piso', () => {
    const state = commitEnergy(undefined, 'world-cup', 4, [{ teamId: 'bel', energy: 12 }], cfg);
    expect(state.byTeam.bel.value).toBe(cfg.energyMin);
  });

  it('descarta el estado del torneo anterior al cambiar de torneo', () => {
    const previo = commitEnergy(undefined, 'continental', 6, [{ teamId: 'arg', energy: 65 }], cfg);
    const nuevo = commitEnergy(previo, 'world-cup', 1, [{ teamId: 'bel', energy: 95 }], cfg);
    expect(nuevo.scope).toBe('world-cup');
    expect(nuevo.byTeam.arg).toBeUndefined();
  });

  it('no muta el estado recibido', () => {
    const previo = commitEnergy(undefined, 'world-cup', 1, [{ teamId: 'bel', energy: 90 }], cfg);
    const copia = structuredClone(previo);
    commitEnergy(previo, 'world-cup', 2, [{ teamId: 'bel', energy: 80 }], cfg);
    expect(previo).toEqual(copia);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/core/__tests__/energy.test.ts`
Expected: FAIL — `Failed to resolve import "../energy"`.

- [ ] **Step 3: Escribir el módulo**

Crear `src/core/energy.ts`:

```ts
import type { KnockoutMatch } from '../types';

/** Torneo al que pertenece un partido. El desgaste se acumula dentro de uno solo. */
export type TournamentScope = 'continental' | 'confed' | 'wc-qualifiers' | 'world-cup';

/** Etapa de un partido, tal como la usa `getStageImportance`. */
export type MatchStage =
  | 'qualifier'
  | 'world-cup-group'
  | 'world-cup-knockout'
  | 'continental'
  | 'confed-group'
  | 'confed-knockout';

export interface TeamEnergy {
  value: number;
  /** Índice de jornada del último partido jugado, para la recuperación perezosa. */
  lastMatchdayIndex: number;
}

export interface EnergyState {
  scope: TournamentScope;
  byTeam: Record<string, TeamEnergy>;
}

export interface FatigueConfig {
  enabled: boolean;
  energyMin: number;
  penaltyPerPoint: number;
  clutchGain: number;
  costBase: number;
  costDifficulty: number;
  costTight: number;
  costExtraTime: number;
  costPenalties: number;
  depthMax: number;
  recovery: number;
  recoveryQualifiers: number;
  /** Fracción del caudal de goles del partido que se juega en el alargue. */
  extraTimeShare: number;
}

export const ENERGY_MAX = 100;

/**
 * Calibrado por simulación sobre los skills reales de la DB (20.000 Mundiales).
 * Ver docs/superpowers/specs/2026-07-24-energia-oficio-prorroga-design.md:
 * con estos valores el top-8 pasa de llevarse el 47,8% de los títulos al 53,9%
 * y los penales bajan del 23,7% al 11,8% de los partidos de eliminación directa.
 */
export const DEFAULT_FATIGUE: FatigueConfig = {
  enabled: true,
  energyMin: 60,
  penaltyPerPoint: 0.2,
  clutchGain: 0.15,
  costBase: 6,
  costDifficulty: 4,
  costTight: 2,
  costExtraTime: 7,
  costPenalties: 2,
  depthMax: 0.25,
  recovery: 4,
  recoveryQualifiers: 8,
  extraTimeShare: (30 / 90) * 0.85,
};

/** Orden de las rondas de eliminación directa. Tercer puesto y final comparten jornada. */
const ROUND_ORDER: Record<KnockoutMatch['round'], number> = {
  'round-of-64': 1,
  'round-of-32': 2,
  'round-of-16': 3,
  quarter: 4,
  semi: 5,
  'third-place': 6,
  final: 6,
};

/**
 * Cada torneo empieza su eliminación directa en una ronda distinta —la
 * continental en R64, el Mundial en R32, Confederaciones en semis— y algunos
 * traen fase de grupos antes. Estas dos tablas alinean todo a un índice que
 * arranca en 1 para el primer partido del torneo.
 */
const KNOCKOUT_START: Record<'continental' | 'world-cup-knockout' | 'confed-knockout', number> = {
  continental: ROUND_ORDER['round-of-64'],
  'world-cup-knockout': ROUND_ORDER['round-of-32'],
  'confed-knockout': ROUND_ORDER.semi,
};

/** Jornadas de fase de grupos que preceden a la eliminación directa (grupos de 4). */
const GROUP_MATCHDAYS_BEFORE: Record<'continental' | 'world-cup-knockout' | 'confed-knockout', number> = {
  continental: 0,
  'world-cup-knockout': 3,
  'confed-knockout': 3,
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Skill normalizado al rango 30-100 de la app. */
const normSkill = (s: number) => clamp01((s - 30) / 70);

/**
 * Importancia normalizada contra 1,6, el peso por defecto del knockout del
 * Mundial. Los pesos son editables desde Ajustes, así que el clamp es
 * load-bearing: subirlos no debe desbordar la dificultad.
 */
const normImp = (i: number) => clamp01(i / 1.6);

export function scopeForStage(stage: MatchStage): TournamentScope {
  switch (stage) {
    case 'continental':
      return 'continental';
    case 'confed-group':
    case 'confed-knockout':
      return 'confed';
    case 'qualifier':
      return 'wc-qualifiers';
    case 'world-cup-group':
    case 'world-cup-knockout':
      return 'world-cup';
  }
}

/**
 * Índice de jornada dentro del torneo, que es el reloj de la recuperación.
 *
 * Se deriva de la RONDA y no de `Match.matchday` porque los partidos de
 * eliminación directa del Mundial no llevan jornada: `knockout.ts` no la
 * asigna (sólo continental y confed lo hacen). La continental arranca
 * directamente en R64, así que no se le suma fase de grupos.
 */
export function matchdayIndexFor(
  stage: MatchStage,
  round: KnockoutMatch['round'] | undefined,
  matchday: number | undefined,
): number {
  switch (stage) {
    case 'qualifier':
    case 'world-cup-group':
    case 'confed-group':
      return matchday ?? 1;
    case 'continental':
    case 'world-cup-knockout':
    case 'confed-knockout': {
      if (!round) return matchday ?? 1;
      return (
        GROUP_MATCHDAYS_BEFORE[stage] + (ROUND_ORDER[round] - KNOCKOUT_START[stage]) + 1
      );
    }
  }
}

export function fatiguePenalty(energy: number, cfg: FatigueConfig): number {
  if (!cfg.enabled) return 0;
  return (ENERGY_MAX - energy) * cfg.penaltyPerPoint;
}

export function effectiveSkill(skill: number, energy: number, cfg: FatigueConfig): number {
  return skill - fatiguePenalty(energy, cfg);
}

/**
 * Cuánto se amplifica la diferencia de skill por el "oficio". Mide qué tan
 * exigente es el partido PARA EL FAVORITO: de ahí el `min` de los dos skills.
 *
 * Es MULTIPLICATIVO a propósito. Con la forma aditiva que se probó primero
 * (`0,6 × calidadMedia + 0,4 × importancia`), unos octavos de Mundial daban
 * dificultad alta aunque enfrente estuviera el peor rival del cuadro, y un
 * equipo exhausto le ganaba a un rival muy inferior MÁS seguido que sin fatiga.
 */
export function clutchMultiplier(
  homeSkill: number,
  awaySkill: number,
  importance: number,
  cfg: FatigueConfig,
): number {
  if (!cfg.enabled) return 1;
  const difficulty = normSkill(Math.min(homeSkill, awaySkill)) * (0.6 + 0.4 * normImp(importance));
  return 1 + difficulty * cfg.clutchGain;
}

export interface EnergyCostInput {
  skill: number;
  oppSkill: number;
  importance: number;
  /** Diferencia de 0 o 1 gol en el resultado FINAL, contando el alargue. */
  tight: boolean;
  extraTime: boolean;
  penalties: boolean;
}

export function matchEnergyCost(input: EnergyCostInput, cfg: FatigueConfig): number {
  if (!cfg.enabled) return 0;
  const opponentDifficulty = 0.6 * normSkill(input.oppSkill) + 0.4 * normImp(input.importance);

  let cost = cfg.costBase + cfg.costDifficulty * opponentDifficulty;
  if (input.tight) cost += cfg.costTight;
  if (input.extraTime) cost += cfg.costExtraTime;
  if (input.penalties) cost += cfg.costPenalties;

  // Profundidad de plantel: los equipos grandes rotan y se cansan menos. Sin
  // esto la fatiga castiga más al grande, que es el que juega más partidos duros.
  return cost * (1 - cfg.depthMax * normSkill(input.skill));
}

const recoveryFor = (scope: TournamentScope, cfg: FatigueConfig) =>
  scope === 'wc-qualifiers' ? cfg.recoveryQualifiers : cfg.recovery;

/**
 * Energía con la que un equipo entra a un partido, ya recuperada por las
 * jornadas que pasaron desde el último que jugó. Un torneo distinto al guardado
 * arranca de cero. No muta nada.
 */
export function resolveEnergy(
  state: EnergyState | undefined,
  scope: TournamentScope,
  matchdayIndex: number,
  teamId: string,
  cfg: FatigueConfig,
): number {
  if (!cfg.enabled) return ENERGY_MAX;
  if (!state || state.scope !== scope) return ENERGY_MAX;

  const entry = state.byTeam[teamId];
  if (!entry) return ENERGY_MAX;

  const rested = Math.max(0, matchdayIndex - entry.lastMatchdayIndex);
  return Math.min(ENERGY_MAX, entry.value + rested * recoveryFor(scope, cfg));
}

/**
 * Estado nuevo tras un partido. Si el torneo cambió, descarta el anterior
 * entero: cada torneo empieza al 100%.
 */
export function commitEnergy(
  state: EnergyState | undefined,
  scope: TournamentScope,
  matchdayIndex: number,
  updates: Array<{ teamId: string; energy: number }>,
  cfg: FatigueConfig,
): EnergyState {
  const base = state && state.scope === scope ? state.byTeam : {};
  const byTeam: Record<string, TeamEnergy> = { ...base };

  for (const { teamId, energy } of updates) {
    byTeam[teamId] = {
      // El piso sale del config, no de la constante: el usuario puede bajarlo
      // desde Ajustes y clampear contra el default lo ignoraría en silencio.
      value: Math.max(cfg.energyMin, Math.min(ENERGY_MAX, energy)),
      lastMatchdayIndex: matchdayIndex,
    };
  }

  return { scope, byTeam };
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/core/__tests__/energy.test.ts`
Expected: PASS, todos los casos.

Si falla el caso del piso en `commitEnergy` porque usa `DEFAULT_FATIGUE.energyMin` en vez del config recibido: es intencional, `commitEnergy` no recibe config. Si preferís pasarlo, cambiá la firma y el test a la vez.

- [ ] **Step 5: Sumar la configuración al store**

En `src/store/useConfigStore.ts`, importar el módulo y extender la interface:

```ts
import { DEFAULT_FATIGUE, type FatigueConfig } from '../core/energy';

export interface EngineConfig {
  kFactor: number;
  eloDivisor: number;
  homeAdvantage: number;
  skillMin: number;
  skillMax: number;
  importanceByStage: Record<ImportanceKey, number>;
  fatigue: FatigueConfig;
}
```

En `DEFAULT_CONFIG`, agregar `fatigue: DEFAULT_FATIGUE`.

En `interface ConfigStore`, agregar `updateFatigue: (patch: Partial<FatigueConfig>) => void;` y la implementación:

```ts
  updateFatigue: (patch: Partial<FatigueConfig>) =>
    set((state) => {
      const fatigue = { ...state.config.fatigue, ...patch };
      const config = { ...state.config, fatigue };
      queueSettingsSave({ engineConfig: config });
      return { config };
    }),
```

En `applySettings`, los ajustes que vienen de la DB pueden ser de una versión anterior y no traer `fatigue`. Rellenar el hueco al aplicarlos, para que `config.fatigue` nunca quede `undefined`:

```ts
      if (engineConfig) {
        next.config = { ...engineConfig, fatigue: engineConfig.fatigue ?? DEFAULT_FATIGUE };
      }
```

(Adaptar a la forma exacta que tenga hoy `applySettings`; lo que no puede pasar es que un `engineConfig` guardado antes de esta feature deje `fatigue` sin definir.)

- [ ] **Step 6: Verificar que compila y que la suite sigue verde**

```bash
npx tsc -b && npm test
```
Expected: 0 errores de tipos; la suite completa pasa. Leer el resumen final, no las últimas líneas sueltas.

- [ ] **Step 7: Commit**

```bash
git add src/core/energy.ts src/core/__tests__/energy.test.ts src/store/useConfigStore.ts
git commit -m "feat: módulo de energía y su configuración en el motor"
```

---

### Task 2: Skill efectivo y oficio en el motor

El motor pasa a objeto de contexto y aplica cansancio + oficio. Todavía sin alargue.

**Files:**
- Modify: `src/core/engine.ts` (`simulateMatch`, `simulateMatchWithPenalties`)
- Modify: `src/core/__tests__/engine.test.ts`
- Modify: `src/store/useTournamentStore.ts` (call sites, adaptación mínima para que compile)
- Test: `src/core/__tests__/engine.context.test.ts` (nuevo)

**Interfaces:**
- Consumes: de Task 1, `effectiveSkill`, `clutchMultiplier`, `FatigueConfig`.
- Produces:
  - `interface MatchTeamContext { skill: number; energy: number }`
  - `interface MatchContext { home: MatchTeamContext; away: MatchTeamContext; importance: number; neutral: boolean; rng?: () => number }`
  - `simulateMatch(ctx: MatchContext): MatchResult` — **reemplaza** la firma posicional anterior.
  - `simulateMatchWithPenalties(ctx: MatchContext): MatchResult & { penalties?: { homeScore: number; awayScore: number } }`

- [ ] **Step 1: Escribir los tests del contexto**

Crear `src/core/__tests__/engine.context.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { simulateMatch } from '../engine';
import { useConfigStore } from '../../store/useConfigStore';

/** Simula muchas veces y devuelve el promedio de goles de cada lado. */
function averageScores(ctx: Parameters<typeof simulateMatch>[0], runs = 20000) {
  let home = 0;
  let away = 0;
  for (let i = 0; i < runs; i++) {
    const r = simulateMatch(ctx);
    home += r.homeScore;
    away += r.awayScore;
  }
  return { home: home / runs, away: away / runs };
}

describe('simulateMatch con energía', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults();
  });

  it('un equipo cansado marca menos que el mismo equipo entero', () => {
    const fresco = averageScores({
      home: { skill: 90, energy: 100 },
      away: { skill: 90, energy: 100 },
      importance: 1.6,
      neutral: true,
    });
    const cansado = averageScores({
      home: { skill: 90, energy: 60 },
      away: { skill: 90, energy: 100 },
      importance: 1.6,
      neutral: true,
    });
    expect(cansado.home).toBeLessThan(fresco.home);
    expect(cansado.away).toBeGreaterThan(fresco.away);
  });

  it('dos equipos igual de cansados juegan un partido parejo', () => {
    const { home, away } = averageScores({
      home: { skill: 90, energy: 65 },
      away: { skill: 90, energy: 65 },
      importance: 1.6,
      neutral: true,
    });
    expect(Math.abs(home - away)).toBeLessThan(0.08);
  });

  it('el oficio agranda la ventaja del favorito en un partido exigente', () => {
    const ctx = {
      home: { skill: 96, energy: 100 },
      away: { skill: 88, energy: 100 },
      importance: 1.6,
      neutral: true,
    } as const;

    const conOficio = averageScores(ctx);
    useConfigStore.getState().updateFatigue({ clutchGain: 0 });
    const sinOficio = averageScores(ctx);

    expect(conOficio.home - conOficio.away).toBeGreaterThan(sinOficio.home - sinOficio.away);
  });

  it('la ventaja de local sólo se aplica si el partido no es neutral', () => {
    const local = averageScores({
      home: { skill: 80, energy: 100 },
      away: { skill: 80, energy: 100 },
      importance: 0.75,
      neutral: false,
    });
    expect(local.home).toBeGreaterThan(local.away);
  });

  it('el Elo usa el skill real, no el efectivo: ganar cansado premia igual', () => {
    // Knuth corta cuando el producto cae bajo exp(-λ) ≈ 0,22: un rng de 0,01 ya
    // corta en la primera vuelta, así que los dos lados terminan en 0 goles.
    const rng = () => 0.01;
    const cansado = simulateMatch({
      home: { skill: 90, energy: 60 },
      away: { skill: 70, energy: 100 },
      importance: 1.6,
      neutral: true,
      rng,
    });
    const entero = simulateMatch({
      home: { skill: 90, energy: 100 },
      away: { skill: 70, energy: 100 },
      importance: 1.6,
      neutral: true,
      rng,
    });
    expect(cansado.homeSkillChange).toBeCloseTo(entero.homeSkillChange, 5);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/core/__tests__/engine.context.test.ts`
Expected: FAIL — `simulateMatch` todavía recibe parámetros posicionales, así que el objeto se interpreta como `homeSkill` y los goles salen mal (o falla de tipos al compilar el test).

- [ ] **Step 3: Reescribir el motor**

En `src/core/engine.ts`, reemplazar `simulateMatch` por la versión con contexto (dejar `getStageImportance`, `calculateSkillChanges`, `updateTeamSkill` y `simulatePenalties` como están):

```ts
import { clutchMultiplier, effectiveSkill } from './energy';

export interface MatchTeamContext {
  skill: number;
  /** 60-100. Usar 100 cuando no hay estado de energía (torneo legacy). */
  energy: number;
}

export interface MatchContext {
  home: MatchTeamContext;
  away: MatchTeamContext;
  /** Peso de la etapa, de `getStageImportance`. */
  importance: number;
  /** Cancha neutral: sin ventaja de local (Mundial y toda eliminación directa). */
  neutral: boolean;
  /** Inyectable para tests; por defecto Math.random. */
  rng?: () => number;
}

/**
 * Simula un partido. El cansancio y el oficio entran por el skill efectivo; el
 * Elo se calcula SIEMPRE con el skill real, así que ganar cansado premia igual.
 */
export function simulateMatch(ctx: MatchContext): MatchResult {
  const config = getEngineConfig();
  const rng = ctx.rng ?? Math.random;

  const homeEffective =
    effectiveSkill(ctx.home.skill, ctx.home.energy, config.fatigue) +
    (ctx.neutral ? 0 : config.homeAdvantage);
  const awayEffective = effectiveSkill(ctx.away.skill, ctx.away.energy, config.fatigue);

  // El oficio amplifica la diferencia según lo exigente que sea el partido.
  const skillDiff =
    (homeEffective - awayEffective) *
    clutchMultiplier(ctx.home.skill, ctx.away.skill, ctx.importance, config.fatigue);

  const homeScore = generateGoals(1.5 + skillDiff / 50, rng);
  const awayScore = generateGoals(1.5 - skillDiff / 50, rng);

  const { homeChange, awayChange } = calculateSkillChanges(
    ctx.home.skill,
    ctx.away.skill,
    homeScore,
    awayScore,
    ctx.importance,
  );

  return { homeScore, awayScore, homeSkillChange: homeChange, awaySkillChange: awayChange };
}
```

Y `generateGoals` acepta el rng:

```ts
function generateGoals(expectedGoals: number, rng: () => number = Math.random): number {
  const lambda = Math.max(0.05, Math.min(4, expectedGoals));
  const limit = Math.exp(-lambda);
  let goals = -1;
  let product = 1;

  do {
    goals++;
    product *= rng();
  } while (product > limit);

  return Math.min(goals, 7);
}
```

`simulateMatchWithPenalties` pasa a recibir el mismo contexto (el alargue llega en Task 3):

```ts
export function simulateMatchWithPenalties(
  ctx: MatchContext,
): MatchResult & { penalties?: { homeScore: number; awayScore: number } } {
  const result = simulateMatch(ctx);
  if (result.homeScore === result.awayScore) {
    return { ...result, penalties: simulatePenalties(ctx.home.skill, ctx.away.skill, ctx.rng) };
  }
  return result;
}
```

- [ ] **Step 4: Adaptar los call sites del store para que compile**

En `src/store/useTournamentStore.ts` hay seis llamadas. En este paso sólo se traducen a la forma nueva **con energía 100 fija**; el estado real llega en Task 5. Ejemplo del primero (línea ~834):

```ts
        const result = simulateGroupMatch({
          home: { skill: homeTeam.skill, energy: 100 },
          away: { skill: awayTeam.skill, energy: 100 },
          importance,
          neutral: stage === 'world-cup',
        });
```

Ojo con la inversión: la variable vieja se llamaba `disableHomeAdvantage` y el campo nuevo es `neutral`, que significa lo mismo. Repetir el patrón en las llamadas de las líneas ~1051, ~2227, ~2557 y ~2656; en las de `simulateMatchWithPenalties` el partido siempre es `neutral: true`.

- [ ] **Step 5: Correr los tests**

```bash
npx tsc -b && npx vitest run src/core/__tests__/
```
Expected: PASS. Los tests viejos de `engine.test.ts` sólo tocan `getStageImportance` y `calculateSkillChanges`, que no cambiaron.

- [ ] **Step 6: Correr la suite completa**

Run: `npm test`
Expected: PASS. Si algún test de store/componentes construía llamadas al motor, adaptarlo a la firma nueva.

- [ ] **Step 7: Commit**

```bash
git add src/core/engine.ts src/core/__tests__/ src/store/useTournamentStore.ts
git commit -m "feat: skill efectivo y oficio en el motor de simulación"
```

---

### Task 3: Prórroga

**Files:**
- Modify: `src/core/engine.ts` (`simulateMatchWithPenalties`)
- Modify: `src/types/index.ts` (`MatchResult`, `SimulatedMatchOutcome`, `KnockoutMatch`)
- Test: `src/core/__tests__/engine.extraTime.test.ts` (nuevo)

**Interfaces:**
- Consumes: de Task 2, `MatchContext`, `simulateMatch`.
- Produces:
  - `MatchResult.extraTime?: { homeGoals: number; awayGoals: number }` — goles marcados **en el alargue**; el marcador principal ya los incluye.
  - `SimulatedMatchOutcome.extraTime?: { homeGoals: number; awayGoals: number }`
  - `KnockoutMatch.extraTime?: boolean`

- [ ] **Step 1: Escribir los tests**

Crear `src/core/__tests__/engine.extraTime.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { simulateMatchWithPenalties } from '../engine';
import { useConfigStore } from '../../store/useConfigStore';

const ctx = {
  home: { skill: 85, energy: 100 },
  away: { skill: 85, energy: 100 },
  importance: 1.6,
  neutral: true,
} as const;

describe('prórroga', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults();
  });

  it('un partido que no termina empatado no juega alargue ni penales', () => {
    // rng bajo → Knuth produce muchos goles y es prácticamente imposible el empate
    let intentos = 0;
    let decidido = null as ReturnType<typeof simulateMatchWithPenalties> | null;
    while (intentos++ < 200 && !decidido) {
      const r = simulateMatchWithPenalties(ctx);
      if (r.homeScore !== r.awayScore) decidido = r;
    }
    expect(decidido).not.toBeNull();
    expect(decidido!.extraTime).toBeUndefined();
    expect(decidido!.penalties).toBeUndefined();
  });

  it('el marcador final incluye los goles del alargue', () => {
    let conAlargue = null as ReturnType<typeof simulateMatchWithPenalties> | null;
    for (let i = 0; i < 5000 && !conAlargue; i++) {
      const r = simulateMatchWithPenalties(ctx);
      if (r.extraTime && (r.extraTime.homeGoals > 0 || r.extraTime.awayGoals > 0)) conAlargue = r;
    }
    expect(conAlargue).not.toBeNull();
    // Si alguien marcó en el alargue, el partido ya no puede quedar empatado
    // salvo que hayan marcado los dos: en cualquier caso el marcador los suma.
    expect(conAlargue!.homeScore).toBeGreaterThanOrEqual(conAlargue!.extraTime!.homeGoals);
    expect(conAlargue!.awayScore).toBeGreaterThanOrEqual(conAlargue!.extraTime!.awayGoals);
  });

  it('sólo hay penales si el alargue también termina empatado', () => {
    for (let i = 0; i < 3000; i++) {
      const r = simulateMatchWithPenalties(ctx);
      if (r.penalties) {
        expect(r.homeScore).toBe(r.awayScore);
        expect(r.extraTime).toBeDefined();
      }
    }
  });

  it('entre un quinto y un cuarto de los partidos parejos va al alargue', () => {
    const runs = 20000;
    let alargues = 0;
    let penales = 0;
    for (let i = 0; i < runs; i++) {
      const r = simulateMatchWithPenalties(ctx);
      if (r.extraTime) alargues++;
      if (r.penalties) penales++;
    }
    // Cifras de Mundial real, medidas en el banco de pruebas del spec.
    expect(alargues / runs).toBeGreaterThan(0.18);
    expect(alargues / runs).toBeLessThan(0.28);
    expect(penales / runs).toBeGreaterThan(0.08);
    expect(penales / runs).toBeLessThan(0.16);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/core/__tests__/engine.extraTime.test.ts`
Expected: FAIL — hoy todo empate va directo a penales, así que `extraTime` nunca está definido y el test de proporciones da 0% de alargues.

- [ ] **Step 3: Implementar el alargue**

En `src/types/index.ts`:

```ts
export interface MatchResult {
  homeScore: number;
  awayScore: number;
  homeSkillChange: number;
  awaySkillChange: number;
  /** Goles marcados EN el alargue. El marcador principal ya los incluye. */
  extraTime?: { homeGoals: number; awayGoals: number };
}

export interface SimulatedMatchOutcome {
  homeScore: number;
  awayScore: number;
  penalties?: { homeScore: number; awayScore: number };
  extraTime?: { homeGoals: number; awayGoals: number };
}
```

Y en `KnockoutMatch`, junto a `penalties`:

```ts
  /** El partido se definió en el alargue (o llegó a penales tras jugarlo). */
  extraTime?: boolean;
```

En `src/core/engine.ts`, `simulateMatchWithPenalties` juega el alargue antes de los penales. Para eso necesita los mismos goles esperados que usó el partido, así que se extrae el cálculo a una función y se reutiliza:

```ts
/**
 * Goles esperados de cada lado, ya con cansancio y oficio aplicados. Se expone
 * aparte porque el alargue reusa exactamente el mismo caudal, escalado.
 */
function expectedGoalsFor(ctx: MatchContext): { home: number; away: number } {
  const config = getEngineConfig();
  const homeEffective =
    effectiveSkill(ctx.home.skill, ctx.home.energy, config.fatigue) +
    (ctx.neutral ? 0 : config.homeAdvantage);
  const awayEffective = effectiveSkill(ctx.away.skill, ctx.away.energy, config.fatigue);
  const skillDiff =
    (homeEffective - awayEffective) *
    clutchMultiplier(ctx.home.skill, ctx.away.skill, ctx.importance, config.fatigue);
  return { home: 1.5 + skillDiff / 50, away: 1.5 - skillDiff / 50 };
}
```

`simulateMatch` pasa a usar `expectedGoalsFor` (reemplazando el cálculo inline del paso anterior), y:

```ts
export function simulateMatchWithPenalties(
  ctx: MatchContext,
): MatchResult & { penalties?: { homeScore: number; awayScore: number } } {
  const config = getEngineConfig();
  const rng = ctx.rng ?? Math.random;
  const result = simulateMatch(ctx);

  if (result.homeScore !== result.awayScore) return result;

  // 30 minutos con el mismo caudal del partido, escalado y algo más lento:
  // resuelve la mitad de los empates y deja la otra mitad para los penales.
  const lambdas = expectedGoalsFor(ctx);
  const share = config.fatigue.extraTimeShare;
  const homeGoals = generateGoals(lambdas.home * share, rng);
  const awayGoals = generateGoals(lambdas.away * share, rng);

  const withExtraTime: MatchResult = {
    ...result,
    homeScore: result.homeScore + homeGoals,
    awayScore: result.awayScore + awayGoals,
    extraTime: { homeGoals, awayGoals },
  };

  // El Elo se recalcula con el resultado de los 120', que es el oficial.
  const { homeChange, awayChange } = calculateSkillChanges(
    ctx.home.skill,
    ctx.away.skill,
    withExtraTime.homeScore,
    withExtraTime.awayScore,
    ctx.importance,
  );
  withExtraTime.homeSkillChange = homeChange;
  withExtraTime.awaySkillChange = awayChange;

  if (withExtraTime.homeScore === withExtraTime.awayScore) {
    return {
      ...withExtraTime,
      penalties: simulatePenalties(ctx.home.skill, ctx.away.skill, rng),
    };
  }
  return withExtraTime;
}
```

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run src/core/__tests__/engine.extraTime.test.ts`
Expected: PASS. Si el porcentaje de alargues cae fuera de 18-28%, revisar que `extraTimeShare` sea `(30/90) × 0,85` y no otra cosa.

- [ ] **Step 5: Suite completa y tipos**

```bash
npx tsc -b && npm test
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/engine.ts src/types/index.ts src/core/__tests__/engine.extraTime.test.ts
git commit -m "feat: prórroga en los partidos de eliminación directa"
```

---

### Task 4: Estado de energía dentro del ciclo

**Files:**
- Modify: `src/types/index.ts` (`Cycle`)
- Modify: `src/core/cycle.ts` (`CycleStatePayload`, `serializeCycleState`, `reconstructCycle`, `toCycle`, `ensureCycleFields`)
- Modify: `src/services/cycleStateService.ts` (bump de `schema_version`)
- Test: `src/core/__tests__/cycle.energy.test.ts` (nuevo)

**Interfaces:**
- Consumes: de Task 1, `EnergyState`.
- Produces: `Cycle.energy?: EnergyState` y su ida y vuelta por el JSONB.

- [ ] **Step 1: Escribir los tests**

Crear `src/core/__tests__/cycle.energy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { reconstructCycle, serializeCycleState, toCycle } from '../cycle';
import { DEFAULT_FATIGUE, commitEnergy } from '../energy';
import type { Tournament } from '../../types';

const cfg = DEFAULT_FATIGUE;

const baseTournament = (): Tournament => ({
  id: 't1',
  name: 'Mundial 2030',
  year: 2030,
  qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
  worldCup: null,
  isQualifiersComplete: false,
  hasAnyMatchPlayed: false,
});

describe('energía en el estado del ciclo', () => {
  it('un ciclo nuevo no arrastra energía', () => {
    expect(toCycle(baseTournament()).energy).toBeUndefined();
  });

  it('la energía sobrevive el ida y vuelta por el JSONB', () => {
    const cycle = {
      ...toCycle(baseTournament()),
      energy: commitEnergy(undefined, 'world-cup', 4, [{ teamId: 'bel', energy: 72 }], cfg),
    };
    const payload = serializeCycleState(cycle);
    const restored = reconstructCycle(baseTournament(), payload);

    expect(restored.energy?.scope).toBe('world-cup');
    expect(restored.energy?.byTeam.bel).toEqual({ value: 72, lastMatchdayIndex: 4 });
  });

  it('un documento guardado antes de esta feature se lee sin energía', () => {
    const payload = serializeCycleState(toCycle(baseTournament()));
    // Simula un documento legacy: la clave directamente no existe.
    delete (payload as { energy?: unknown }).energy;

    const restored = reconstructCycle(baseTournament(), payload);
    expect(restored.energy).toBeUndefined();
  });

  it('un torneo legacy sin cycle_state tampoco rompe', () => {
    expect(reconstructCycle(baseTournament(), null).energy).toBeUndefined();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/core/__tests__/cycle.energy.test.ts`
Expected: FAIL — `energy` no existe en `Cycle` ni en el payload (error de tipos).

- [ ] **Step 3: Implementar**

En `src/types/index.ts`, extender `Cycle`:

```ts
import type { EnergyState } from '../core/energy';

export interface Cycle extends Tournament {
  continental: ContinentalStage;
  confederationsCup: ConfederationsCup;
  calendar: CalendarState;
  /**
   * Energía de los equipos en el torneo en curso. Ausente en torneos guardados
   * antes de la feature: se interpreta como "todos al 100%".
   */
  energy?: EnergyState;
}
```

En `src/core/cycle.ts`, agregar el campo al payload y a la serialización:

```ts
export interface CycleStatePayload {
  continental: ContinentalStage;
  confederationsCup: ConfederationsCup;
  calendar: CalendarState;
  worldCup?: WorldCup | null;
  /** Ausente en documentos previos a la feature de energía. */
  energy?: EnergyState;
}

export function serializeCycleState(cycle: Cycle): CycleStatePayload {
  return {
    continental: cycle.continental,
    confederationsCup: cycle.confederationsCup,
    calendar: cycle.calendar,
    worldCup: cycle.worldCup ?? null,
    energy: cycle.energy,
  };
}
```

En `reconstructCycle`, dentro de la rama con `state`, agregar `energy: state.energy`. `toCycle` y `ensureCycleFields` no necesitan cambios: `energy` es opcional y ausente significa lleno.

En `src/services/cycleStateService.ts`, subir `schema_version` a `3` y actualizar el comentario explicando que la v3 suma la energía.

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run src/core/__tests__/cycle.energy.test.ts`
Expected: PASS.

- [ ] **Step 5: Tipos y suite**

```bash
npx tsc -b && npm test
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/core/cycle.ts src/services/cycleStateService.ts src/core/__tests__/cycle.energy.test.ts
git commit -m "feat: la energía viaja en el snapshot del ciclo"
```

---

### Task 5: Integración en el store

Las seis llamadas al motor pasan a usar energía real, y el resultado se guarda en el ciclo. Es la tarea que enciende la feature.

**Files:**
- Modify: `src/store/useTournamentStore.ts`
- Test: `src/store/__tests__/useTournamentStore.energy.test.ts` (nuevo)

**Interfaces:**
- Consumes: de Task 1 (`resolveEnergy`, `commitEnergy`, `scopeForStage`, `matchdayIndexFor`, `matchEnergyCost`), Task 2 (`MatchContext`), Task 3 (`extraTime`), Task 4 (`Cycle.energy`).
- Produces: helper interno `buildEnergyContext` y `applyEnergyAfterMatch`, usados por las seis simulaciones.

- [ ] **Step 1: Escribir el test**

Crear `src/store/__tests__/useTournamentStore.energy.test.ts`. El objetivo es el helper, no el store entero: exportarlo para poder testearlo.

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { applyEnergyAfterMatch, buildEnergyContext } from '../useTournamentStore';
import { DEFAULT_FATIGUE, commitEnergy } from '../../core/energy';
import { useConfigStore } from '../../store/useConfigStore';
import type { Cycle } from '../../types';

const cfg = DEFAULT_FATIGUE;

const cycleWith = (energy?: Cycle['energy']) => ({ energy }) as Cycle;

describe('buildEnergyContext', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults();
  });

  it('sin estado previo, los dos equipos entran llenos', () => {
    const ctx = buildEnergyContext(cycleWith(), 'world-cup-group', undefined, 1, 'bel', 'arg');
    expect(ctx.homeEnergy).toBe(100);
    expect(ctx.awayEnergy).toBe(100);
    expect(ctx.matchdayIndex).toBe(1);
    expect(ctx.scope).toBe('world-cup');
  });

  it('arrastra el desgaste de la fase de grupos al knockout del Mundial', () => {
    const energy = commitEnergy(undefined, 'world-cup', 3, [{ teamId: 'bel', energy: 80 }], cfg);
    const ctx = buildEnergyContext(cycleWith(energy), 'world-cup-knockout', 'round-of-32', undefined, 'bel', 'arg');
    // R32 es la jornada 4 del Mundial: una jornada de recuperación desde la 3.
    expect(ctx.matchdayIndex).toBe(4);
    expect(ctx.homeEnergy).toBeCloseTo(84, 5);
    expect(ctx.awayEnergy).toBe(100);
  });

  it('empezar otro torneo devuelve a todos al 100%', () => {
    const energy = commitEnergy(undefined, 'continental', 6, [{ teamId: 'bel', energy: 61 }], cfg);
    const ctx = buildEnergyContext(cycleWith(energy), 'world-cup-group', undefined, 1, 'bel', 'arg');
    expect(ctx.homeEnergy).toBe(100);
  });
});

describe('applyEnergyAfterMatch', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults();
  });

  it('un partido con alargue y penales desgasta más que uno tranquilo', () => {
    const common = {
      scope: 'world-cup' as const,
      matchdayIndex: 4,
      importance: 1.6,
      home: { teamId: 'bel', skill: 96, energy: 100 },
      away: { teamId: 'arg', skill: 90, energy: 100 },
    };

    const tranquilo = applyEnergyAfterMatch(undefined, {
      ...common,
      tight: false,
      extraTime: false,
      penalties: false,
    });
    const durisimo = applyEnergyAfterMatch(undefined, {
      ...common,
      tight: true,
      extraTime: true,
      penalties: true,
    });

    expect(durisimo.byTeam.bel.value).toBeLessThan(tranquilo.byTeam.bel.value);
    expect(durisimo.byTeam.bel.lastMatchdayIndex).toBe(4);
  });

  it('el equipo de menos skill paga más caro el mismo partido', () => {
    const state = applyEnergyAfterMatch(undefined, {
      scope: 'world-cup',
      matchdayIndex: 4,
      importance: 1.6,
      home: { teamId: 'grande', skill: 96, energy: 100 },
      away: { teamId: 'chico', skill: 60, energy: 100 },
      tight: true,
      extraTime: false,
      penalties: false,
    });
    expect(state.byTeam.chico.value).toBeLessThan(state.byTeam.grande.value);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/store/__tests__/useTournamentStore.energy.test.ts`
Expected: FAIL — los helpers no existen.

- [ ] **Step 3: Escribir los helpers en el store**

En `src/store/useTournamentStore.ts`, cerca de los imports y antes del `create(...)`:

```ts
import {
  commitEnergy,
  matchEnergyCost,
  matchdayIndexFor,
  resolveEnergy,
  scopeForStage,
  ENERGY_MAX,
  type EnergyState,
  type MatchStage,
  type TournamentScope,
} from '../core/energy';

export interface EnergyContext {
  scope: TournamentScope;
  matchdayIndex: number;
  homeEnergy: number;
  awayEnergy: number;
}

/**
 * Energía con la que los dos equipos entran a un partido. Única fuente de este
 * cálculo: las seis simulaciones del store la usan, para que no se
 * desincronicen entre sí.
 */
export function buildEnergyContext(
  cycle: Pick<Cycle, 'energy'>,
  stage: MatchStage,
  round: KnockoutMatch['round'] | undefined,
  matchday: number | undefined,
  homeTeamId: string,
  awayTeamId: string,
): EnergyContext {
  const cfg = getEngineConfig().fatigue;
  const scope = scopeForStage(stage);
  const matchdayIndex = matchdayIndexFor(stage, round, matchday);

  return {
    scope,
    matchdayIndex,
    homeEnergy: resolveEnergy(cycle.energy, scope, matchdayIndex, homeTeamId, cfg),
    awayEnergy: resolveEnergy(cycle.energy, scope, matchdayIndex, awayTeamId, cfg),
  };
}

export interface EnergyOutcome {
  scope: TournamentScope;
  matchdayIndex: number;
  importance: number;
  home: { teamId: string; skill: number; energy: number };
  away: { teamId: string; skill: number; energy: number };
  tight: boolean;
  extraTime: boolean;
  penalties: boolean;
}

/** Estado de energía tras un partido, con el costo ya cobrado a los dos. */
export function applyEnergyAfterMatch(
  state: EnergyState | undefined,
  outcome: EnergyOutcome,
): EnergyState {
  const cfg = getEngineConfig().fatigue;
  const shared = {
    importance: outcome.importance,
    tight: outcome.tight,
    extraTime: outcome.extraTime,
    penalties: outcome.penalties,
  };

  const homeCost = matchEnergyCost(
    { skill: outcome.home.skill, oppSkill: outcome.away.skill, ...shared },
    cfg,
  );
  const awayCost = matchEnergyCost(
    { skill: outcome.away.skill, oppSkill: outcome.home.skill, ...shared },
    cfg,
  );

  return commitEnergy(
    state,
    outcome.scope,
    outcome.matchdayIndex,
    [
      { teamId: outcome.home.teamId, energy: outcome.home.energy - homeCost },
      { teamId: outcome.away.teamId, energy: outcome.away.energy - awayCost },
    ],
    cfg,
  );
}
```

- [ ] **Step 4: Correr el test del helper**

Run: `npx vitest run src/store/__tests__/useTournamentStore.energy.test.ts`
Expected: PASS.

- [ ] **Step 5: Cablear las seis simulaciones**

En cada una de las seis (líneas aproximadas 834, 1051, 2227, 2557, 2656 y la del batch de rondas), el patrón es siempre el mismo. Ejemplo con el de grupos (línea ~834), reemplazando lo que Task 2 dejó con energía fija:

```ts
        const stageKey: MatchStage = stage === 'qualifier' ? 'qualifier' : 'world-cup-group';
        const importance = importanceFor(stageKey, undefined);
        const energyCtx = buildEnergyContext(
          state.currentTournament,
          stageKey,
          undefined,
          match.matchday,
          homeTeam.id,
          awayTeam.id,
        );

        const result = simulateGroupMatch({
          home: { skill: homeTeam.skill, energy: energyCtx.homeEnergy },
          away: { skill: awayTeam.skill, energy: energyCtx.awayEnergy },
          importance,
          neutral: stage === 'world-cup',
        });

        const nextEnergy = applyEnergyAfterMatch(state.currentTournament.energy, {
          scope: energyCtx.scope,
          matchdayIndex: energyCtx.matchdayIndex,
          importance,
          home: { teamId: homeTeam.id, skill: homeTeam.skill, energy: energyCtx.homeEnergy },
          away: { teamId: awayTeam.id, skill: awayTeam.skill, energy: energyCtx.awayEnergy },
          tight: Math.abs(result.homeScore - result.awayScore) <= 1,
          extraTime: !!result.extraTime,
          penalties: false,
        });
```

Y donde el store arma el `Cycle` actualizado para guardarlo, incluir `energy: nextEnergy`.

Para las simulaciones de eliminación directa, el `stageKey` es `'world-cup-knockout'`, `'continental'` o `'confed-knockout'` según corresponda, `round` es `match.round`, y en el outcome `penalties: !!result.penalties`.

Los `SimulatedMatchOutcome` que devuelven estas acciones deben propagar `extraTime: result.extraTime`, para que el modo en vivo pueda reproducirlo (Task 7).

Los partidos de eliminación directa deben guardar además `extraTime: !!result.extraTime` en el `KnockoutMatch`, junto a `penalties`.

- [ ] **Step 6: Verificar en la app**

```bash
npm run dev
```
Simular una fase de grupos completa y entrar al knockout. Comprobar en las DevTools (estado del store) que `currentTournament.energy.byTeam` se puebla y que los valores bajan ronda a ronda. Verificar que al recargar la página la energía sigue ahí (viene del JSONB).

- [ ] **Step 7: Suite completa**

```bash
npx tsc -b && npm test
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/store/useTournamentStore.ts src/store/__tests__/useTournamentStore.energy.test.ts
git commit -m "feat: el store simula con la energía real de cada equipo"
```

---

### Task 6: Persistir el alargue en el historial

**Files:**
- Create: `supabase/migrations/017_match_extra_time.sql`
- Modify: `src/types/database.ts`
- Modify: `src/services/matchHistoryService.ts`

**Interfaces:**
- Consumes: de Task 3, `MatchResult.extraTime`.
- Produces: `MatchHistoryEntry.wentToExtraTime?: boolean` y `CreateMatchHistoryParams.wentToExtraTime?: boolean`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/017_match_extra_time.sql`:

```sql
-- ============================================
-- Migration 017: marca de prórroga en el historial
-- ============================================
-- Sin esta columna, un 2-1 jugado en 90 minutos y un 2-1 definido en el alargue
-- son indistinguibles en el historial. Se guarda como columna y no dentro de
-- `metadata` para que sea consultable y para que el listado paginado la traiga
-- sin cambios: get_matches_page devuelve SETOF match_history con SELECT *.

ALTER TABLE match_history
ADD COLUMN IF NOT EXISTS went_to_extra_time BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN match_history.went_to_extra_time IS
  'El partido se jugó con prórroga. Los partidos previos a la feature quedan en FALSE, que es correcto: en ese motor no existía el alargue.';
```

- [ ] **Step 2: Aplicar la migración**

Aplicarla al proyecto de Supabase (MCP `apply_migration` o el SQL editor). Verificar:

```sql
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'match_history' and column_name = 'went_to_extra_time';
```
Expected: una fila, `boolean`, default `false`.

- [ ] **Step 3: Actualizar los tipos y el servicio**

En `src/types/database.ts`, agregar `went_to_extra_time: boolean` a la fila de `match_history` y `went_to_extra_time?: boolean` a su Insert.

En `src/services/matchHistoryService.ts`:
- Agregar `wentToExtraTime?: boolean` a `MatchHistoryEntry` y a `CreateMatchHistoryParams`.
- En `createMatch`, mapear `went_to_extra_time: params.wentToExtraTime ?? false` en el insert.
- Donde se mapea la fila leída al `MatchHistoryEntry`, mapear `wentToExtraTime: row.went_to_extra_time ?? false`.

- [ ] **Step 4: Pasar el dato desde el store**

En las llamadas a `matchHistoryService.createMatch` de las simulaciones de eliminación directa, agregar `wentToExtraTime: !!result.extraTime`.

- [ ] **Step 5: Verificar**

```bash
npx tsc -b && npm test
```
Expected: PASS.

Después, en la app, simular un knockout hasta que caiga un alargue y comprobar en Supabase:

```sql
select home_score, away_score, went_to_extra_time
from match_history
where went_to_extra_time
order by played_at desc limit 5;
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/017_match_extra_time.sql src/types/database.ts src/services/matchHistoryService.ts src/store/useTournamentStore.ts
git commit -m "feat: el historial distingue los partidos definidos en el alargue"
```

---

### Task 7: Alargue en la simulación minuto a minuto

**Files:**
- Modify: `src/core/liveMatch.ts` (`buildMatchTimeline`, `LiveTimeline`)
- Modify: `src/core/__tests__/liveMatch.test.ts`
- Modify: `src/hooks/useLiveMatchPlayback.ts`
- Modify: `src/components/tournament/LiveMatchModal.tsx:76`
- Modify: `src/components/tournament/MatchCenter.tsx:291`

**Interfaces:**
- Consumes: de Task 3, `SimulatedMatchOutcome.extraTime`.
- Produces:
  - `buildMatchTimeline(input: BuildTimelineInput): LiveTimeline` — **cambia a objeto**.
  - `interface BuildTimelineInput { homeScore: number; awayScore: number; seed: number; penalties?: LivePenaltiesResult; extraTime?: { homeGoals: number; awayGoals: number }; rng?: () => number }`
  - `LiveTimeline.hasExtraTime: boolean`

- [ ] **Step 1: Escribir los tests**

En `src/core/__tests__/liveMatch.test.ts`, adaptar las llamadas existentes a la firma de objeto y agregar:

```ts
describe('timeline con alargue', () => {
  it('los goles del alargue caen entre el 91 y el 120', () => {
    const timeline = buildMatchTimeline({
      homeScore: 2,
      awayScore: 1,
      seed: hashSeed('m1'),
      extraTime: { homeGoals: 1, awayGoals: 0 },
    });

    expect(timeline.hasExtraTime).toBe(true);
    const tardios = timeline.goals.filter((g) => g.minute > 90);
    expect(tardios).toHaveLength(1);
    expect(tardios[0].minute).toBeLessThanOrEqual(120);
    expect(tardios[0].side).toBe('home');
  });

  it('los goles de los 90 minutos siguen cayendo antes del 91', () => {
    const timeline = buildMatchTimeline({
      homeScore: 3,
      awayScore: 2,
      seed: hashSeed('m2'),
      extraTime: { homeGoals: 1, awayGoals: 1 },
    });
    const regulares = timeline.goals.filter((g) => g.minute <= 90);
    expect(regulares).toHaveLength(3); // 5 goles totales − 2 del alargue
  });

  it('sin alargue el partido termina a los 90', () => {
    const timeline = buildMatchTimeline({ homeScore: 1, awayScore: 0, seed: hashSeed('m3') });
    expect(timeline.hasExtraTime).toBe(false);
    expect(timeline.goals.every((g) => g.minute <= 90)).toBe(true);
  });

  it('el marcador acumulado sigue siendo coherente cruzando el minuto 90', () => {
    const timeline = buildMatchTimeline({
      homeScore: 2,
      awayScore: 2,
      seed: hashSeed('m4'),
      extraTime: { homeGoals: 1, awayGoals: 1 },
    });
    const ultimo = timeline.goals[timeline.goals.length - 1];
    expect(ultimo.homeScore).toBe(2);
    expect(ultimo.awayScore).toBe(2);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/core/__tests__/liveMatch.test.ts`
Expected: FAIL — la firma todavía es posicional y `hasExtraTime` no existe.

- [ ] **Step 3: Implementar**

En `src/core/liveMatch.ts`:

```ts
export interface LiveTimeline {
  goals: LiveGoalEvent[];
  finalHomeScore: number;
  finalAwayScore: number;
  penalties?: LivePenaltiesResult;
  /** El reloj llega a 120 en vez de a 90. */
  hasExtraTime: boolean;
}

export interface BuildTimelineInput {
  homeScore: number;
  awayScore: number;
  seed: number;
  penalties?: LivePenaltiesResult;
  /** Goles marcados EN el alargue; ya incluidos en homeScore/awayScore. */
  extraTime?: { homeGoals: number; awayGoals: number };
  rng?: () => number;
}

/**
 * Reparte los goles en minutos plausibles: los de los 90 minutos en [1,90] y
 * los del alargue en [91,120]. Determinista dado (marcador, seed).
 */
export function buildMatchTimeline(input: BuildTimelineInput): LiveTimeline {
  const { homeScore, awayScore, seed, penalties, extraTime } = input;
  const rng = input.rng ?? mulberry32(seed);

  const etHome = extraTime?.homeGoals ?? 0;
  const etAway = extraTime?.awayGoals ?? 0;

  const pending: { minute: number; side: LiveSide }[] = [];
  const push = (count: number, side: LiveSide, from: number, span: number) => {
    for (let i = 0; i < count; i++) pending.push({ minute: from + Math.floor(rng() * span), side });
  };

  push(homeScore - etHome, 'home', 1, 90);
  push(awayScore - etAway, 'away', 1, 90);
  push(etHome, 'home', 91, 30);
  push(etAway, 'away', 91, 30);

  pending.sort((a, b) => a.minute - b.minute);

  let h = 0;
  let a = 0;
  const goals: LiveGoalEvent[] = pending.map((p) => {
    if (p.side === 'home') h++;
    else a++;
    return { minute: p.minute, side: p.side, homeScore: h, awayScore: a };
  });

  return {
    goals,
    finalHomeScore: homeScore,
    finalAwayScore: awayScore,
    penalties,
    hasExtraTime: !!extraTime,
  };
}
```

En `src/hooks/useLiveMatchPlayback.ts`, el reloj deja de ser una constante global:

```ts
const REGULATION_MINUTES = 90;
const EXTRA_TIME_MINUTES = 120;
```

y dentro del hook:

```ts
  const finalMinute = timeline?.hasExtraTime ? EXTRA_TIME_MINUTES : REGULATION_MINUTES;
```

reemplazando los usos de `MATCH_MINUTES` por `finalMinute` (en el `setInterval` del reloj y en `skipToEnd`). Agregar `finalMinute` a las dependencias del efecto del reloj.

En `LiveMatchModal.tsx:76` y `MatchCenter.tsx:291`, adaptar a la firma de objeto pasando `extraTime: outcome.extraTime`.

- [ ] **Step 4: Correr los tests**

```bash
npx vitest run src/core/__tests__/liveMatch.test.ts src/hooks/__tests__/
```
Expected: PASS.

- [ ] **Step 5: Verificar en la app**

```bash
npm run dev
```
Simular en vivo partidos de eliminación directa hasta que salga un alargue. El reloj debe pasar del 90 al 120 y los penales aparecer recién después. Un partido sin alargue debe seguir terminando a los 90.

- [ ] **Step 6: Suite completa**

```bash
npx tsc -b && npm test
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/liveMatch.ts src/hooks/useLiveMatchPlayback.ts src/components/tournament/LiveMatchModal.tsx src/components/tournament/MatchCenter.tsx src/core/__tests__/liveMatch.test.ts
git commit -m "feat: el alargue se juega en pantalla en el modo en vivo"
```

---

### Task 8: Energía y alargue en la interfaz

**Files:**
- Create: `src/components/ui/EnergyMeter.tsx`
- Create: `src/components/ui/__tests__/EnergyMeter.test.tsx`
- Modify: `src/components/tournament/MatchPreview.tsx`
- Modify: `src/components/tournament/MatchDetailModal.tsx`

**Interfaces:**
- Consumes: de Task 1 `ENERGY_MAX` y `DEFAULT_FATIGUE.energyMin`; de Task 5 `buildEnergyContext`.
- Produces: `<EnergyMeter energy={number} label={string} />`

- [ ] **Step 1: Escribir el test del componente**

Crear `src/components/ui/__tests__/EnergyMeter.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EnergyMeter } from '../EnergyMeter';

describe('EnergyMeter', () => {
  it('expone la energía como medidor accesible', () => {
    render(<EnergyMeter energy={72} label="Bélgica" />);
    const meter = screen.getByRole('meter', { name: /Bélgica/ });
    expect(meter).toHaveAttribute('aria-valuenow', '72');
  });

  it('muestra el porcentaje en texto para quien no distingue el color', () => {
    render(<EnergyMeter energy={72} label="Bélgica" />);
    expect(screen.getByText('72%')).toBeInTheDocument();
  });

  it('redondea sin mostrar decimales', () => {
    render(<EnergyMeter energy={72.4} label="Bélgica" />);
    expect(screen.getByText('72%')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/components/ui/__tests__/EnergyMeter.test.tsx`
Expected: FAIL — el componente no existe.

- [ ] **Step 3: Implementar el componente**

Crear `src/components/ui/EnergyMeter.tsx`:

```tsx
import { PixelBar } from './PixelBar';
import { DEFAULT_FATIGUE, ENERGY_MAX } from '../../core/energy';

interface EnergyMeterProps {
  /** 60-100. */
  energy: number;
  /** Nombre del equipo, para el lector de pantalla. */
  label: string;
}

/**
 * La barra arranca en el piso de energía y no en cero: entre 60 y 100 hay 40
 * puntos útiles, y mapearlos sobre 0-100 dejaría la barra siempre más de medio
 * llena y sin diferencias visibles.
 */
export function EnergyMeter({ energy, label }: EnergyMeterProps) {
  const floor = DEFAULT_FATIGUE.energyMin;
  const span = ENERGY_MAX - floor;
  const normalized = Math.max(0, Math.min(span, energy - floor));

  const color = energy >= 85 ? 'led' : energy >= 72 ? 'gold' : 'loss';

  // `PixelBar` trae su propio role="meter", pero con los valores normalizados
  // (0-40), que no son los que el usuario ve ni los que sirven a un lector de
  // pantalla. Se la marca aria-hidden y el medidor accesible es el contenedor,
  // que declara la energía real.
  return (
    <div
      className="flex items-center gap-2"
      role="meter"
      aria-label={`Energía de ${label}`}
      aria-valuenow={Math.round(energy)}
      aria-valuemin={floor}
      aria-valuemax={ENERGY_MAX}
    >
      <div aria-hidden="true" className="flex-1">
        <PixelBar value={normalized} max={span} color={color} />
      </div>
      <span className="text-xs text-grass-soft tabular-nums">{Math.round(energy)}%</span>
    </div>
  );
}
```

- [ ] **Step 4: Correr el test**

Run: `npx vitest run src/components/ui/__tests__/EnergyMeter.test.tsx`
Expected: PASS.

- [ ] **Step 5: Mostrarlo en la previa del partido**

En `src/components/tournament/MatchPreview.tsx`, junto al nombre de cada equipo, renderizar `<EnergyMeter energy={...} label={team.name} />`. La energía sale de `buildEnergyContext` con el ciclo actual, la etapa y la ronda del partido que la previa ya conoce. Si la fatiga está apagada en la config (`config.fatigue.enabled === false`), no renderizar nada.

- [ ] **Step 6: Mostrar el alargue en el detalle del partido**

En `src/components/tournament/MatchDetailModal.tsx`, cuando el partido tenga `extraTime`, mostrar junto al marcador un chip con el texto `ALARGUE`.

**No usar `PRÓRROGA`:** la Press Start 2P rompe las mayúsculas acentuadas.

Reutilizar el estilo de chip que ya usa el modal para los penales, para no inventar lenguaje visual nuevo:

```tsx
{match.extraTime && (
  <span className="border border-gold px-1 text-[10px] text-gold">ALARGUE</span>
)}
```

- [ ] **Step 7: Indicador compacto en la jornada en vivo**

En `src/components/tournament/LiveMatchdayOverlay.tsx`, en cada tarjeta de partido, mostrar la energía de los dos equipos **sin la barra**: ahí el espacio compite con el marcador, que es lo importante. Alcanza con el porcentaje junto al nombre:

```tsx
<span className="text-[10px] text-grass-soft tabular-nums">{Math.round(energy)}%</span>
```

Con la fatiga apagada en la config, no renderizar nada.

- [ ] **Step 8: Verificar en la app**

```bash
npm run dev
```
Abrir la previa de un partido de octavos con equipos ya desgastados: deben verse las dos barras con porcentajes distintos. Abrir el detalle de un partido con alargue: debe verse el chip. Simular una jornada en vivo: los porcentajes deben aparecer sin desarmar la tarjeta ni tapar el marcador.

- [ ] **Step 9: Suite y tipos**

```bash
npx tsc -b && npm test && npm run lint
```
Expected: PASS. El lint del repo tiene errores de base preexistentes; comparar contra el estado previo a la tarea y no introducir nuevos.

- [ ] **Step 10: Commit**

```bash
git add src/components/ui/EnergyMeter.tsx src/components/ui/__tests__/EnergyMeter.test.tsx src/components/tournament/MatchPreview.tsx src/components/tournament/MatchDetailModal.tsx src/components/tournament/LiveMatchdayOverlay.tsx
git commit -m "feat: la energía y el alargue se ven en la previa, el detalle y la jornada"
```

---

### Task 9: Controles en Ajustes del motor

**Files:**
- Modify: `src/components/settings/EngineSettings.tsx`

**Interfaces:**
- Consumes: de Task 1, `updateFatigue` y `config.fatigue`.

- [ ] **Step 1: Agregar la sección**

En `src/components/settings/EngineSettings.tsx`, siguiendo el patrón de las secciones existentes (label + rango + valor a la derecha), agregar un bloque "Cansancio y oficio" con:

- Interruptor `enabled` — "Activar cansancio".
- Rango `clutchGain` de 0 a 0,4 con paso 0,05 — "Oficio en partidos exigentes". Etiqueta cualitativa como la de `kFactor`: hasta 0,10 "Sutil", hasta 0,20 "Equilibrado", hasta 0,30 "Marcado", más "Dominante".
- Rango `energyMin` de 40 a 90 con paso 5 — "Energía mínima". Texto de ayuda: "Cuanto más bajo, más pesa el cansancio".
- Rango `recovery` de 0 a 12 con paso 1 — "Recuperación por jornada".

Cada control llama a `updateFatigue({ ... })`. El patrón, siguiendo el de `kFactor`:

```tsx
<div className="flex items-center justify-between">
  <label className="text-sm text-grass-soft" htmlFor="clutch-gain">
    Oficio en partidos exigentes
  </label>
  <span className={clutchInfo.color}>{clutchInfo.label}</span>
</div>
<input
  id="clutch-gain"
  type="range"
  min={0}
  max={0.4}
  step={0.05}
  value={config.fatigue.clutchGain}
  onChange={(e) => updateFatigue({ clutchGain: Number(e.target.value) })}
/>
```

con la etiqueta cualitativa calculada igual que `getKFactorLabel`:

```tsx
const getClutchLabel = (value: number): { label: string; color: string } => {
  if (value <= 0.1) return { label: 'Sutil', color: 'text-led' };
  if (value <= 0.2) return { label: 'Equilibrado', color: 'text-led' };
  if (value <= 0.3) return { label: 'Marcado', color: 'text-gold' };
  return { label: 'Dominante', color: 'text-loss' };
};
```

Bajo el título de la sección, una línea de contexto:

> Calibrado con 20.000 Mundiales simulados. Con el oficio en 0,15 los ocho mejores del ranking ganan el 54% de los títulos; en 0,35, el 59%.

- [ ] **Step 2: Verificar en la app**

```bash
npm run dev
```
Ir a Ajustes, mover el oficio a 0,35, simular un torneo y comprobar que los favoritos ganan más seguido. Volver a 0,15. Recargar la página y confirmar que el valor persiste (va por `queueSettingsSave` a `app_settings`).

- [ ] **Step 3: Suite**

```bash
npx tsc -b && npm test
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/EngineSettings.tsx
git commit -m "feat: controles de cansancio y oficio en los ajustes del motor"
```

---

### Task 10: Regresión estadística y banco de pruebas sobre el motor real

**Files:**
- Create: `src/core/__tests__/engine.regression.test.ts`
- Modify: `scripts/simulate-engine.mjs`
- Modify: `package.json` (script `simulate`)

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Escribir el test de regresión**

Crear `src/core/__tests__/engine.regression.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { simulateMatchWithPenalties } from '../engine';
import { useConfigStore } from '../../store/useConfigStore';

/**
 * Red de seguridad de la calibración. Si alguien mueve una constante del motor
 * sin querer, esto lo caza antes de que se note jugando 40 torneos.
 * Los rangos salen del banco de pruebas del spec y son anchos a propósito.
 */
describe('calibración del motor', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults();
  });

  it('los partidos de eliminación directa entre pares van al alargue y a penales en la proporción esperada', () => {
    const runs = 30000;
    let alargues = 0;
    let penales = 0;

    for (let i = 0; i < runs; i++) {
      const r = simulateMatchWithPenalties({
        home: { skill: 85, energy: 100 },
        away: { skill: 85, energy: 100 },
        importance: 1.6,
        neutral: true,
      });
      if (r.extraTime) alargues++;
      if (r.penalties) penales++;
    }

    expect(alargues / runs).toBeGreaterThan(0.18);
    expect(alargues / runs).toBeLessThan(0.28);
    expect(penales / runs).toBeGreaterThan(0.08);
    expect(penales / runs).toBeLessThan(0.16);
  });

  it('un equipo exhausto pierde ventaja pero no deja de ser favorito ante un rival muy inferior', () => {
    const runs = 20000;
    let victorias = 0;

    for (let i = 0; i < runs; i++) {
      const r = simulateMatchWithPenalties({
        home: { skill: 94.8, energy: 60 },
        away: { skill: 60, energy: 100 },
        importance: 1.6,
        neutral: true,
      });
      const gana = r.homeScore > r.awayScore || (!!r.penalties && r.penalties.homeScore > r.penalties.awayScore);
      if (gana) victorias++;
    }

    // Medido en 79,2%: el cansancio le cuesta, pero el oficio no se lo compensa
    // (con la fórmula aditiva descartada, este caso daba MÁS que sin fatiga).
    expect(victorias / runs).toBeGreaterThan(0.72);
    expect(victorias / runs).toBeLessThan(0.86);
  });
});
```

- [ ] **Step 2: Correr el test**

Run: `npx vitest run src/core/__tests__/engine.regression.test.ts`
Expected: PASS. Si tarda demasiado, bajar `runs` a 15000 y ensanchar los rangos proporcionalmente.

- [ ] **Step 3: Apuntar el banco de pruebas al motor real**

En `scripts/simulate-engine.mjs`, reemplazar las funciones que replican el motor (`playMatch`, `poisson`, `penaltyShootout`, `fatiguePenalty`, `clutchDifficulty`, `energyCost`) por imports de `src/core/engine.ts` y `src/core/energy.ts`. Como el script es `.mjs` y el motor es TypeScript, correrlo con `tsx`:

```bash
npx tsx scripts/simulate-engine.mts
```

Renombrar el archivo a `.mts` y borrar el comentario de cabecera que advierte que replica el motor, reemplazándolo por una nota de que ahora lo importa.

Las palancas del barrido (`OPT`) pasan a moverse con `useConfigStore.getState().updateFatigue({...})`.

- [ ] **Step 4: Verificar que reproduce los números del spec**

```bash
npx tsx scripts/simulate-engine.mts final
```
Expected: el top-8 con oficio 0,15 cae en 53-55% y los penales en 11-13%. Si se va lejos de ahí, hay una diferencia real entre el motor implementado y el modelo calibrado: investigarla antes de dar la feature por terminada.

- [ ] **Step 5: Agregar el script a package.json**

```json
    "simulate": "tsx scripts/simulate-engine.mts",
```

Agregar `tsx` a `devDependencies` si no está.

- [ ] **Step 6: Suite completa final**

```bash
npx tsc -b && npm test && npm run build
```
Expected: todo PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/__tests__/engine.regression.test.ts scripts/ package.json package-lock.json
git commit -m "test: red de seguridad de la calibración del motor"
```

---

## Verificación final

Antes de dar la feature por terminada, en la app:

1. Crear un ciclo nuevo y jugar la continental entera. La energía del campeón al terminar debe rondar los 72.
2. Pasar a Confederaciones: todos vuelven al 100%.
3. Jugar el Mundial completo. La energía debe bajar ronda a ronda y **no reiniciarse** al pasar de grupos a octavos. El finalista debe llegar cerca de 68.
4. Ver en vivo un partido de eliminación directa hasta que caiga un alargue: el reloj llega a 120 y los penales aparecen después.
5. Recargar la página a mitad del Mundial: la energía sigue donde estaba.
6. Abrir un torneo viejo, anterior a esta feature: debe abrirse sin errores, con todos al 100%.
