# Ciclo — Plan 2: Pesos de Elo por etapa

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada torneo/etapa pese distinto sobre el skill: un **multiplicador de importancia** por etapa (y ronda) que escala el Factor K del Elo, configurable en vivo desde EngineSettings.

**Architecture:** `EngineConfig` suma `importanceByStage: Record<ImportanceKey, number>` (7 perillas). `engine.ts` gana `getStageImportance(stage, round, config)` que mapea `(stage, round) → peso`, y `calculateSkillChanges` acepta un `importance` que multiplica el `kFactor`. La UI de EngineSettings agrega sliders. **Solo afecta el cambio de skill, no el modelo de goles.**

**Tech Stack:** TypeScript, Zustand (persist), Vitest, React (EngineSettings UI).

## Global Constraints

- **TDD con Vitest** (donde hay lógica): test que falla antes de implementar. Comando base: `npx vitest run <archivo>`.
- **Sin dependencias nuevas.**
- `engine.ts` sigue su patrón actual: lee la config vía `getEngineConfig()` (ya importa del config store — NO es un módulo puro estricto; mantené ese patrón, no lo "purifiques").
- **La importancia SOLO multiplica el `kFactor` (cambio de skill). NO toca el modelo de goles** (`generateGoals`/goles esperados quedan igual).
- **Valores por defecto EXACTOS** (intensidad moderada, spread ~2.1×):
  `qualifier: 0.75`, `continentalEarly: 0.90`, `continentalLate: 1.20`, `confedGroup: 1.10`, `confedKnockout: 1.40`, `wcGroup: 1.25`, `wcKnockout: 1.60`.
- **Mapeo etapa→ronda**: continental `round-of-64/32/16` → `continentalEarly`; `quarter/semi/final` → `continentalLate`.
- **Config store**: bump de versión `2 → 3` con `migrate` que preserva la config existente y agrega `importanceByStage` (defaults) si falta.
- **Penales cuentan como empate para el Elo** (ya es el comportamiento actual: `calculateSkillChanges` usa el marcador de los 90'; no se cambia).
- **Handoff a Plan 5 (documentar, NO implementar acá):** este plan agrega el mecanismo, la config y la UI, pero **no cablea el store**. Los pesos quedan inertes hasta que Plan 5 llame a `getStageImportance(match.stage, match.round, getEngineConfig())` en cada punto donde el store invoca `simulateMatch`/`simulateMatchWithPenalties` y pase el `importance`. Este plan deja esas funciones listas con `importance = 1` por defecto (comportamiento actual intacto).
- Este es el **Plan 2 de 6** (cubre spec §8). No toca `src/core/calendar.ts` (Plan 1) ni el store (Plan 5).

## File Structure

- **Modificar** `src/store/useConfigStore.ts` — `ImportanceKey`, `importanceByStage` en `EngineConfig`, defaults, acción `updateImportance`, `migrate` v3.
- **Modificar** `src/core/engine.ts` — exportar `calculateSkillChanges` con `importance`; agregar `getStageImportance`; pasar `importance` por `simulateMatch` y `simulateMatchWithPenalties`.
- **Modificar** `src/components/settings/EngineSettings.tsx` — Card con 7 sliders de importancia.
- **Modificar** `src/store/__tests__/useConfigStore.test.ts` — tests de defaults + `updateImportance`.
- **Crear** `src/core/__tests__/engine.test.ts` — tests de `getStageImportance` + escalado de `calculateSkillChanges`.

---

### Task 1: `importanceByStage` en EngineConfig + `updateImportance` + migrate v3

**Files:**
- Modify: `src/store/useConfigStore.ts`
- Test: `src/store/__tests__/useConfigStore.test.ts`

**Interfaces:**
- Produces: `ImportanceKey` (7 claves), `EngineConfig.importanceByStage: Record<ImportanceKey, number>`, acción `updateImportance(key: ImportanceKey, value: number): void` (clamp a `[0, 5]`), `DEFAULT_IMPORTANCE`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `src/store/__tests__/useConfigStore.test.ts`:

```ts
describe('importanceByStage', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults();
  });

  it('tiene los 7 pesos por defecto correctos', () => {
    expect(config().importanceByStage).toEqual({
      qualifier: 0.75,
      continentalEarly: 0.9,
      continentalLate: 1.2,
      confedGroup: 1.1,
      confedKnockout: 1.4,
      wcGroup: 1.25,
      wcKnockout: 1.6,
    });
  });

  it('updateImportance cambia un solo peso sin tocar los demás', () => {
    useConfigStore.getState().updateImportance('wcKnockout', 2);
    expect(config().importanceByStage.wcKnockout).toBe(2);
    expect(config().importanceByStage.qualifier).toBe(0.75);
  });

  it('updateImportance clampea al rango [0, 5]', () => {
    useConfigStore.getState().updateImportance('qualifier', -1);
    expect(config().importanceByStage.qualifier).toBe(0);
    useConfigStore.getState().updateImportance('qualifier', 99);
    expect(config().importanceByStage.qualifier).toBe(5);
  });

  it('updateImportance ignora valores no numéricos', () => {
    useConfigStore.getState().updateImportance('wcGroup', Number.NaN);
    expect(config().importanceByStage.wcGroup).toBe(1.25);
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/store/__tests__/useConfigStore.test.ts`
Expected: FAIL — `importanceByStage` no existe / `updateImportance` no es función.

- [ ] **Step 3: Implementar en `useConfigStore.ts`**

Agregar el tipo antes de `EngineConfig`:

```ts
export type ImportanceKey =
  | 'qualifier'
  | 'continentalEarly'
  | 'continentalLate'
  | 'confedGroup'
  | 'confedKnockout'
  | 'wcGroup'
  | 'wcKnockout';
```

Agregar el campo a `EngineConfig`:

```ts
export interface EngineConfig {
  kFactor: number;
  eloDivisor: number;
  homeAdvantage: number;
  skillMin: number;
  skillMax: number;
  importanceByStage: Record<ImportanceKey, number>;
}
```

Agregar `updateImportance` a la interfaz `ConfigStore`:

```ts
  updateImportance: (key: ImportanceKey, value: number) => void;
```

Agregar los defaults (antes de `DEFAULT_CONFIG`) y meterlos en `DEFAULT_CONFIG`:

```ts
const DEFAULT_IMPORTANCE: Record<ImportanceKey, number> = {
  qualifier: 0.75,
  continentalEarly: 0.9,
  continentalLate: 1.2,
  confedGroup: 1.1,
  confedKnockout: 1.4,
  wcGroup: 1.25,
  wcKnockout: 1.6,
};

const DEFAULT_CONFIG: EngineConfig = {
  kFactor: 1.5,
  eloDivisor: 75,
  homeAdvantage: 3,
  skillMin: 30,
  skillMax: 100,
  importanceByStage: DEFAULT_IMPORTANCE,
};
```

Agregar la acción (junto a las otras `update*`):

```ts
      updateImportance: (key: ImportanceKey, value: number) =>
        set((state) => {
          const safe = Number.isFinite(value)
            ? Math.max(0, Math.min(5, value))
            : state.config.importanceByStage[key];
          return {
            config: {
              ...state.config,
              importanceByStage: { ...state.config.importanceByStage, [key]: safe },
            },
          };
        }),
```

Actualizar el bloque `persist` a versión 3 con el migrate v3 (reemplaza el `version: 2` y su `migrate`):

```ts
    {
      name: 'football-engine-config',
      version: 3,
      migrate: (persistedState, version) => {
        const state = persistedState as ConfigStore;
        if (version < 2) {
          // v2: nuevo motor Elo calibrado — resetear config a los nuevos defaults
          return { ...state, config: DEFAULT_CONFIG };
        }
        if (version < 3) {
          // v3: pesos de Elo por etapa — agregar sin perder el resto de la config
          return {
            ...state,
            config: {
              ...state.config,
              importanceByStage: state.config.importanceByStage ?? DEFAULT_IMPORTANCE,
            },
          };
        }
        return state;
      },
    }
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run src/store/__tests__/useConfigStore.test.ts`
Expected: PASS (los 4 nuevos + los existentes de `updateSkillLimits`).

- [ ] **Step 5: Typecheck y commit**

Run: `npx tsc --noEmit`
Expected: sin errores.

```bash
git add src/store/useConfigStore.ts src/store/__tests__/useConfigStore.test.ts
git commit -m "feat(config): importanceByStage (pesos Elo por etapa) + updateImportance + migrate v3"
```

---

### Task 2: `getStageImportance` + `calculateSkillChanges(importance)` en engine.ts

**Files:**
- Modify: `src/core/engine.ts`
- Test: `src/core/__tests__/engine.test.ts` (crear)

**Interfaces:**
- Consumes: `EngineConfig.importanceByStage` (Task 1), `KnockoutMatch['round']`.
- Produces: `getStageImportance(stage: string | undefined, round: KnockoutMatch['round'] | undefined, config: EngineConfig): number`; `calculateSkillChanges(homeSkill, awaySkill, homeScore, awayScore, importance?): { homeChange, awayChange }` (ahora **exportada**, `importance` default 1 multiplica el kFactor); `simulateMatch(..., importance?)` y `simulateMatchWithPenalties(..., importance?)` aceptan y propagan `importance` (default 1).

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/core/__tests__/engine.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { calculateSkillChanges, getStageImportance } from '../engine';
import { useConfigStore } from '../../store/useConfigStore';

const cfg = () => useConfigStore.getState().config;

describe('getStageImportance', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults();
  });

  it('mapea cada etapa a su peso por defecto', () => {
    expect(getStageImportance('qualifier', undefined, cfg())).toBe(0.75);
    expect(getStageImportance('confed-group', undefined, cfg())).toBe(1.1);
    expect(getStageImportance('confed-knockout', 'semi', cfg())).toBe(1.4);
    expect(getStageImportance('world-cup-group', undefined, cfg())).toBe(1.25);
    expect(getStageImportance('world-cup-knockout', 'final', cfg())).toBe(1.6);
  });

  it('continental: rondas tempranas vs tardías', () => {
    expect(getStageImportance('continental', 'round-of-64', cfg())).toBe(0.9);
    expect(getStageImportance('continental', 'round-of-16', cfg())).toBe(0.9);
    expect(getStageImportance('continental', 'quarter', cfg())).toBe(1.2);
    expect(getStageImportance('continental', 'final', cfg())).toBe(1.2);
  });

  it('etapa desconocida o sin definir → 1 (neutro)', () => {
    expect(getStageImportance(undefined, undefined, cfg())).toBe(1);
    expect(getStageImportance('lo-que-sea', undefined, cfg())).toBe(1);
  });
});

describe('calculateSkillChanges con importancia', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults();
  });

  it('importancia 0 → cambio de skill 0', () => {
    const { homeChange, awayChange } = calculateSkillChanges(80, 70, 3, 0, 0);
    expect(homeChange).toBe(0);
    expect(awayChange).toBe(0);
  });

  it('importancia 2 ≈ el doble del cambio con importancia 1', () => {
    const base = calculateSkillChanges(80, 70, 3, 0, 1);
    const doubled = calculateSkillChanges(80, 70, 3, 0, 2);
    expect(doubled.homeChange).toBeCloseTo(base.homeChange * 2, 2);
    // El cambio de local sigue siendo el opuesto del de visitante
    expect(doubled.awayChange).toBe(-doubled.homeChange);
  });

  it('default de importancia = 1 (mismo resultado que pasar 1 explícito)', () => {
    const implicit = calculateSkillChanges(80, 70, 3, 0);
    const explicit = calculateSkillChanges(80, 70, 3, 0, 1);
    expect(implicit).toEqual(explicit);
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/core/__tests__/engine.test.ts`
Expected: FAIL — `getStageImportance` no exportado / `calculateSkillChanges` no exportado.

- [ ] **Step 3: Implementar en `engine.ts`**

Cambiar la línea de imports de tipos (línea 1) para incluir los tipos usados:

```ts
import type { EngineConfig, KnockoutMatch, MatchResult } from '../types';
```

Agregar, cerca del tope del archivo (después de los imports), el helper:

```ts
// Rondas continentales "tardías" (mayor peso Elo). El resto (R64/R32/R16) es "temprana".
const CONTINENTAL_LATE_ROUNDS: ReadonlyArray<KnockoutMatch['round']> = ['quarter', 'semi', 'final'];

/**
 * Peso de importancia (multiplicador del K-Factor) según la etapa y la ronda
 * del partido. Etapa desconocida → 1 (neutro). Solo afecta el cambio de skill.
 */
export function getStageImportance(
  stage: string | undefined,
  round: KnockoutMatch['round'] | undefined,
  config: EngineConfig,
): number {
  const w = config.importanceByStage;
  switch (stage) {
    case 'qualifier':
      return w.qualifier;
    case 'continental':
      return round && CONTINENTAL_LATE_ROUNDS.includes(round) ? w.continentalLate : w.continentalEarly;
    case 'confed-group':
      return w.confedGroup;
    case 'confed-knockout':
      return w.confedKnockout;
    case 'world-cup-group':
      return w.wcGroup;
    case 'world-cup-knockout':
      return w.wcKnockout;
    default:
      return 1;
  }
}
```

Cambiar la firma de `simulateMatch` para aceptar `importance` y propagarlo:

```ts
export function simulateMatch(
  homeSkill: number,
  awaySkill: number,
  disableHomeAdvantage = false,
  importance = 1,
): MatchResult {
```

y dentro, la llamada a `calculateSkillChanges` pasa `importance`:

```ts
  const { homeChange, awayChange } = calculateSkillChanges(
    homeSkill,
    awaySkill,
    homeScore,
    awayScore,
    importance,
  );
```

Cambiar `calculateSkillChanges` a **exportada** con `importance`:

```ts
export function calculateSkillChanges(
  homeSkill: number,
  awaySkill: number,
  homeScore: number,
  awayScore: number,
  importance = 1,
): { homeChange: number; awayChange: number } {
  const config = getEngineConfig();

  // K-factor escalado por la importancia de la etapa
  const kFactor = config.kFactor * importance;

  const expectedHome = 1 / (1 + Math.pow(10, (awaySkill - homeSkill) / config.eloDivisor));

  let actualHome: number;
  if (homeScore > awayScore) actualHome = 1;
  else if (homeScore === awayScore) actualHome = 0.5;
  else actualHome = 0;

  const homeChange = Math.round(kFactor * (actualHome - expectedHome) * 100) / 100;
  const awayChange = -homeChange;

  return { homeChange, awayChange };
}
```

Cambiar `simulateMatchWithPenalties` para aceptar y propagar `importance`:

```ts
export function simulateMatchWithPenalties(
  homeSkill: number,
  awaySkill: number,
  disableHomeAdvantage = true, // Knockouts are always neutral
  importance = 1,
): MatchResult & { penalties?: { homeScore: number; awayScore: number } } {
  const result = simulateMatch(homeSkill, awaySkill, disableHomeAdvantage, importance);
```

(El resto del cuerpo de cada función queda igual.)

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run src/core/__tests__/engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Suite completa + typecheck + commit**

Run: `npx vitest run && npx tsc --noEmit`
Expected: todo verde, sin errores de tipos (ojo: `calculateSkillChanges` pasó de privada a exportada — confirmar que no rompe nada).

```bash
git add src/core/engine.ts src/core/__tests__/engine.test.ts
git commit -m "feat(engine): getStageImportance + calculateSkillChanges con peso por etapa"
```

---

### Task 3: Sliders de importancia en EngineSettings

**Files:**
- Modify: `src/components/settings/EngineSettings.tsx`

**Interfaces:**
- Consumes: `config.importanceByStage`, `updateImportance` (Task 1), tipo `ImportanceKey`.
- Produces: una Card nueva con 7 sliders (sin lógica nueva testeable; verificación = typecheck + build).

- [ ] **Step 1: Agregar el tipo/icono a los imports**

En `src/components/settings/EngineSettings.tsx`:
- Agregar `Trophy` a la import de `lucide-react`: `import { Settings, RotateCcw, Info, Zap, Home, Target, Trophy } from 'lucide-react';`
- Agregar la import del tipo: `import { useConfigStore, type ImportanceKey } from '../../store/useConfigStore';`
- Destructurar `updateImportance` del store: en la línea `const { config, updateKFactor, updateEloDivisor, updateHomeAdvantage, updateSkillLimits, resetToDefaults } = useConfigStore();`, agregar `updateImportance`.

- [ ] **Step 2: Definir las filas de importancia**

Antes de `export function EngineSettings()`, agregar:

```tsx
const IMPORTANCE_ROWS: Array<{ key: ImportanceKey; label: string }> = [
  { key: 'qualifier', label: 'Clasificatorias Mundial' },
  { key: 'continentalEarly', label: 'Continental · R64–R16' },
  { key: 'continentalLate', label: 'Continental · QF–Final' },
  { key: 'confedGroup', label: 'Copa Confed · grupos' },
  { key: 'confedKnockout', label: 'Copa Confed · semis/final' },
  { key: 'wcGroup', label: 'Mundial · grupos' },
  { key: 'wcKnockout', label: 'Mundial · knockout' },
];
```

- [ ] **Step 3: Agregar la Card de importancia**

Insertar esta Card dentro del `<div className="space-y-6">`, justo **antes** de la `{/* Reset Button */}` Card:

```tsx
      {/* Peso por torneo (importancia Elo) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-gold" />
            Peso por torneo (importancia Elo)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-grass-soft">
              Multiplica el Factor K según la etapa del partido: cuánto mueve el skill cada torneo.
              Las clasificatorias pesan menos (muchos partidos) y el knockout del Mundial, más.
              Los cruces por penales cuentan como empate para el Elo.
            </p>
            {IMPORTANCE_ROWS.map(({ key, label }) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm text-grass-soft">{label}</label>
                  <span className="text-led font-terminal tabular-nums font-bold text-sm">
                    {config.importanceByStage[key].toFixed(2)}×
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="3"
                  step="0.05"
                  value={config.importanceByStage[key]}
                  onChange={(e) => updateImportance(key, Number(e.target.value))}
                  className="w-full h-2 bg-grass-dark border-2 border-line appearance-none cursor-pointer accent-led"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
```

- [ ] **Step 4: Verificar typecheck + lint + build**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx eslint src/components/settings/EngineSettings.tsx`
Expected: sin errores nuevos.

Run: `npm run build`
Expected: build exitoso.

(No hay test unitario: es UI sin lógica nueva. La verificación visual queda para cuando se corra la app.)

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/EngineSettings.tsx
git commit -m "feat(settings): sliders de importancia Elo por torneo"
```

---

## Self-Review

**Spec coverage (Plan 2 cubre spec §8):**
- `EngineConfig.importanceByStage` + defaults + migrate → Task 1. ✓
- `calculateSkillChanges(importance)` + `getStageImportance` + threading por `simulateMatch`/`simulateMatchWithPenalties` → Task 2. ✓
- EngineSettings (7 perillas) → Task 3. ✓
- Penales = empate para Elo → sin cambios (comportamiento actual preservado; documentado). ✓
- **Cableado del store (pasar `importance` en cada simulate) → DIFERIDO a Plan 5** (documentado en Global Constraints y en el handoff). Los pesos quedan inertes hasta entonces; el default `importance = 1` preserva exactamente el comportamiento actual.

**Placeholder scan:** sin TBD/TODO; todo el código completo en cada step. ✓

**Type consistency:** `ImportanceKey`, `importanceByStage`, `updateImportance`, `getStageImportance`, `CONTINENTAL_LATE_ROUNDS`, `IMPORTANCE_ROWS` — nombres consistentes entre tasks. `calculateSkillChanges` exportada en Task 2 y consumida por su test. Los defaults (0.75/0.90/1.20/1.10/1.40/1.25/1.60) idénticos en Task 1 (config) y en los asserts de Task 2. ✓

**Riesgo anotado:** `calculateSkillChanges` pasa de privada a exportada; Task 2 Step 5 corre la suite completa + tsc para confirmar que no rompe consumidores (hoy solo la usa `simulateMatch` dentro del mismo archivo).
