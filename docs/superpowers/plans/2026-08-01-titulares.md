# Titulares desde el motor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El Hub abre con hasta tres titulares rankeados por notabilidad, derivados de lo que `match_history` ya guarda.

**Architecture:** Una derivación pura (`src/core/headlines.ts`) que puntúa partidos y devuelve los más notables, un hook que la alimenta con una página del historial del modo activo, y una tarjeta presentacional en el Hub. Misma forma que las tres derivaciones que ya existen en `src/modes/`: sin React, sin stores, sin Supabase, dependencias inyectadas por parámetro.

**Tech Stack:** TypeScript 5.9, React 19, Zustand 5, Tailwind v4, Vitest 4 + Testing Library, lucide-react, Supabase.

**Spec:** `docs/superpowers/specs/2026-08-01-titulares-design.md`

## Global Constraints

- **Cero migraciones.** No se toca `supabase/migrations/`. La consulta usa el RPC `get_matches_page` que ya existe (migración 021) y su índice `idx_match_history_mode_keyset`.
- **No se toca el motor de simulación** (`src/core/engine.ts`) ni la persistencia existente, salvo el agregado explícito del bump de revisión en `matchHistoryService`.
- **No se tocan** `src/modes/nav.ts`, `src/modes/nextAction.ts` ni `src/modes/hubHeader.ts`.
- **Etiquetas en `font-arcade` sin acentos.** Press Start 2P no tiene glifos para las mayúsculas acentuadas y se rinden como cuadrados. Esto aplica SOLO a texto con clase `font-arcade`: los renglones en prosa (`detail`) llevan acentos correctos y son obligatorios.
- **`src/core/headlines.ts` es puro**: no importa React, ni stores, ni `supabase`, ni `matchHistoryService`. Sólo tipos.
- **Un fallo de Supabase no puede romper el Hub**: el bloque de titulares es decoración; ante error se rinde lista vacía.
- **Verificación de la suite:** `set -o pipefail` y grep del resumen. **Nunca `| tail`** — el exit code de una tubería es el de `tail` y eso ya dejó pasar seis pruebas rotas en este repo.
- Comentarios y textos de UI en español, con ortografía completa (tildes, ñ).
- En `App.tsx`, todo hook nuevo va **antes** de los `return` condicionales. Si cambia la cantidad de hooks ejecutados entre renders, React lanza "Rendered more hooks than during the previous render".

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/core/headlines.ts` (crear) | Derivación pura: clasifica, puntúa, ordena y selecciona titulares. |
| `src/core/__tests__/headlines.test.ts` (crear) | Tests de tabla de la derivación. |
| `src/store/useHistoryRevisionStore.ts` (crear) | Contador que se incrementa cuando se persiste historial. |
| `src/services/matchHistoryService.ts` (modificar) | Incrementa la revisión tras un insert exitoso. |
| `src/hooks/useRecentHeadlines.ts` (crear) | Consulta la página, deriva y resuelve nombres de equipo. |
| `src/components/hub/HeadlinesCard.tsx` (crear) | Tarjeta presentacional de la portada. |
| `src/components/hub/HubView.tsx` (modificar) | Cambia la prop `lastResult` por `headlines`. |
| `src/App.tsx` (modificar) | Llama al hook y le pasa el resultado al Hub. |
| `src/__tests__/App.headlines.test.tsx` (crear) | Test de cableado: el titular llega a la pantalla. |

---

### Task 1: `deriveHeadlines` — los cuatro tipos de un solo partido

**Files:**
- Create: `src/core/headlines.ts`
- Test: `src/core/__tests__/headlines.test.ts`

**Interfaces:**
- Consumes: `MatchHistoryStage` de `src/core/formats/rounds.ts` (unión de 8 strings: `'qualifier' | 'world-cup-group' | 'world-cup-knockout' | 'continental' | 'confed-group' | 'confed-knockout' | 'league' | 'cup'`).
- Produces: `HeadlineKind`, `HeadlineMatch`, `Headline`, `HEADLINES_LIMIT`, `deriveHeadlines(matches: HeadlineMatch[], limit?: number): Headline[]`.

**Contexto que el implementador necesita:** el skill de un equipo vive en la escala 30–100 (`useConfigStore`: `skillMin: 30`, `skillMax: 100`), así que la brecha máxima posible entre dos equipos es 70. Los skills son decimales desde la migración 006. El array de entrada viene **del más nuevo al más viejo**: el índice de cada partido ES su antigüedad.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/core/__tests__/headlines.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveHeadlines, type HeadlineMatch } from '../headlines';

/** Partido neutro: 1-0 entre iguales, no dispara ningún titular. */
const match = (over: Partial<HeadlineMatch> = {}): HeadlineMatch => ({
  homeTeamId: 'A',
  awayTeamId: 'B',
  homeScore: 1,
  awayScore: 0,
  homeSkillBefore: 70,
  awaySkillBefore: 70,
  stage: 'league',
  ...over,
});

describe('deriveHeadlines — batacazo', () => {
  it('ganar contra un rival mucho mejor es batacazo', () => {
    const [h] = deriveHeadlines([
      match({ homeSkillBefore: 60, awaySkillBefore: 85 }),
    ]);
    expect(h.kind).toBe('upset');
    expect(h.label).toBe('BATACAZO');
    expect(h.subjectTeamId).toBe('A');
    expect(h.detail).toBe('le ganó a un rival 25 puntos mejor');
  });

  it('el batacazo también vale de visitante', () => {
    const [h] = deriveHeadlines([
      match({ homeScore: 0, awayScore: 2, homeSkillBefore: 85, awaySkillBefore: 60 }),
    ]);
    expect(h.kind).toBe('upset');
    expect(h.subjectTeamId).toBe('B');
  });

  it('que gane el favorito no es noticia', () => {
    expect(deriveHeadlines([
      match({ homeSkillBefore: 85, awaySkillBefore: 60 }),
    ])).toEqual([]);
  });

  it('una brecha chica no alcanza', () => {
    expect(deriveHeadlines([
      match({ homeSkillBefore: 67, awaySkillBefore: 71 }),
    ])).toEqual([]);
  });
});

describe('deriveHeadlines — goleada', () => {
  it('cuatro goles de diferencia son goleada', () => {
    const [h] = deriveHeadlines([match({ homeScore: 5, awayScore: 1 })]);
    expect(h.kind).toBe('rout');
    expect(h.label).toBe('GOLEADA');
    expect(h.detail).toBe('4 goles de diferencia');
    expect(h.subjectTeamId).toBe('A');
  });

  it('tres goles de diferencia no', () => {
    expect(deriveHeadlines([match({ homeScore: 3, awayScore: 0 })])).toEqual([]);
  });
});

describe('deriveHeadlines — definición', () => {
  it('los penales mandan sobre el alargue', () => {
    const [h] = deriveHeadlines([
      match({
        homeScore: 1,
        awayScore: 1,
        wentToExtraTime: true,
        penalties: { homeScore: 4, awayScore: 2 },
        stage: 'world-cup-knockout',
      }),
    ]);
    expect(h.kind).toBe('decider');
    expect(h.label).toBe('PENALES');
    expect(h.detail).toBe('se definió por penales');
  });

  it('sin tanda guardada, el alargue igual es titular', () => {
    const [h] = deriveHeadlines([
      match({ homeScore: 2, awayScore: 1, wentToExtraTime: true, stage: 'cup' }),
    ]);
    expect(h.label).toBe('ALARGUE');
    expect(h.detail).toBe('se resolvió en el alargue');
  });
});

describe('deriveHeadlines — aguante', () => {
  it('empatarle al grande es titular', () => {
    const [h] = deriveHeadlines([
      match({ homeScore: 1, awayScore: 1, homeSkillBefore: 55, awaySkillBefore: 85 }),
    ]);
    expect(h.kind).toBe('hold');
    expect(h.label).toBe('AGUANTE');
    expect(h.subjectTeamId).toBe('A');
    expect(h.detail).toBe('empató contra un rival 30 puntos mejor');
  });

  it('un empate entre parecidos no es nada', () => {
    expect(deriveHeadlines([
      match({ homeScore: 1, awayScore: 1, homeSkillBefore: 68, awaySkillBefore: 75 }),
    ])).toEqual([]);
  });
});

describe('deriveHeadlines — selección', () => {
  it('un partido produce UN titular: el de mayor puntaje', () => {
    // Batacazo con brecha 40 (base 1.0) y goleada de 4 (base 0.25) en el mismo
    // partido: gana el batacazo, y no salen dos titulares del mismo partido.
    const res = deriveHeadlines([
      match({ homeScore: 4, awayScore: 0, homeSkillBefore: 50, awaySkillBefore: 90 }),
    ]);
    expect(res).toHaveLength(1);
    expect(res[0].kind).toBe('upset');
  });

  it('ordena por puntaje descendente', () => {
    const res = deriveHeadlines([
      match({ homeTeamId: 'A', awayTeamId: 'B', homeSkillBefore: 65, awaySkillBefore: 75 }),
      match({ homeTeamId: 'C', awayTeamId: 'D', homeSkillBefore: 45, awaySkillBefore: 90 }),
    ]);
    expect(res.map((h) => h.subjectTeamId)).toEqual(['C', 'A']);
    expect(res[0].score).toBeGreaterThan(res[1].score);
  });

  it('lo más reciente pesa más: el mismo titular vale menos más atrás', () => {
    const viejo = Array.from({ length: 50 }, () => match({ homeTeamId: 'X', awayTeamId: 'Y' }));
    const res = deriveHeadlines([
      match({ homeTeamId: 'A', awayTeamId: 'B', homeSkillBefore: 60, awaySkillBefore: 85 }),
      ...viejo,
      match({ homeTeamId: 'C', awayTeamId: 'D', homeSkillBefore: 60, awaySkillBefore: 85 }),
    ]);
    expect(res.map((h) => h.subjectTeamId)).toEqual(['A', 'C']);
    expect(res[0].score).toBeGreaterThan(res[1].score);
  });

  it('un titular flojo y muy viejo cae por debajo del umbral', () => {
    // Batacazo mínimo (brecha 6) en clasificatorias (peso 0.9), al final de una
    // ventana de 80: el decaimiento lo deja por debajo de MIN_SCORE.
    const relleno = Array.from({ length: 79 }, (_, i) =>
      match({ homeTeamId: `h${i}`, awayTeamId: `a${i}` }),
    );
    expect(deriveHeadlines([
      ...relleno,
      match({ homeTeamId: 'A', awayTeamId: 'B', homeSkillBefore: 66, awaySkillBefore: 72, stage: 'qualifier' }),
    ])).toEqual([]);
  });

  it('un equipo no aparece dos veces en la portada', () => {
    const res = deriveHeadlines([
      match({ homeTeamId: 'A', awayTeamId: 'B', homeSkillBefore: 45, awaySkillBefore: 90 }),
      match({ homeTeamId: 'A', awayTeamId: 'C', homeScore: 6, awayScore: 0 }),
    ]);
    expect(res).toHaveLength(1);
    expect(res[0].subjectTeamId).toBe('A');
  });

  it('corta en el límite pedido', () => {
    const res = deriveHeadlines(
      Array.from({ length: 5 }, (_, i) =>
        match({ homeTeamId: `h${i}`, awayTeamId: `a${i}`, homeSkillBefore: 50, awaySkillBefore: 90 }),
      ),
    );
    expect(res).toHaveLength(3);
  });

  it('sin partidos no hay titulares', () => {
    expect(deriveHeadlines([])).toEqual([]);
  });

  /** Las etiquetas se dibujan en Press Start 2P, que no tiene mayúsculas acentuadas. */
  it('las etiquetas son mayúsculas sin tildes', () => {
    const res = deriveHeadlines([
      match({ homeTeamId: 'A', awayTeamId: 'B', homeSkillBefore: 50, awaySkillBefore: 90 }),
      match({ homeTeamId: 'C', awayTeamId: 'D', homeScore: 5, awayScore: 0 }),
      match({
        homeTeamId: 'E',
        awayTeamId: 'F',
        homeScore: 1,
        awayScore: 1,
        homeSkillBefore: 55,
        awaySkillBefore: 85,
      }),
    ]);
    expect(res).toHaveLength(3);
    for (const h of res) expect(h.label).toMatch(/^[A-Z]+$/);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npx vitest run src/core/__tests__/headlines.test.ts
```

Esperado: FAIL — `Failed to resolve import "../headlines"`.

- [ ] **Step 3: Escribir `src/core/headlines.ts`**

```ts
import type { MatchHistoryStage } from './formats/rounds';

/**
 * TITULARES — la cuarta derivación pura del proyecto, hermana de `modes/nav.ts`
 * (qué se navega), `modes/nextAction.ts` (qué se hace) y `modes/hubHeader.ts`
 * (en qué anda el modo). Contesta la que faltaba: qué pasó.
 *
 * Sin React, sin stores y sin Supabase, por la misma razón que las otras tres:
 * quien la llama le pasa los partidos ya leídos, y esto se testea con objetos
 * literales.
 *
 * LA SEÑAL. El motor calcula `skillChange = K · importancia · (resultado −
 * esperado)`: la sorpresa ya está medida. Pero `K` y la importancia NO están
 * guardados en la fila de `match_history`, así que acá la sorpresa se
 * reconstruye desde `skillBefore` de los dos lados. Ventaja: recalibrar el
 * motor no reescribe el pasado.
 */

export type HeadlineKind = 'upset' | 'rout' | 'decider' | 'hold' | 'streak';

/**
 * Forma neutra de un partido, a propósito: se construye tanto desde una fila de
 * `match_history` como desde un resultado recién simulado en memoria. Por eso
 * NO es un alias de `MatchHistoryEntry`.
 */
export interface HeadlineMatch {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  homeSkillBefore: number;
  awaySkillBefore: number;
  stage: MatchHistoryStage;
  wentToExtraTime?: boolean;
  /**
   * Sólo el ciclo mundialista la estampa (`useTournamentStore.ts:2540`); el modo
   * de temporada guarda `wentToExtraTime` pero no la tanda. Su ausencia degrada
   * el titular a ALARGUE, que sigue siendo cierto.
   */
  penalties?: { homeScore: number; awayScore: number };
}

export interface Headline {
  kind: HeadlineKind;
  /**
   * Etiqueta corta, para `font-arcade`. SIN acentos: Press Start 2P no tiene
   * glifos para las mayúsculas acentuadas y se rinden como cuadrados.
   */
  label: string;
  /** Renglón explicativo, en prosa y con acentos. Sin nombres de equipo: ya están arriba. */
  detail: string;
  /** El partido que ilustra el titular. */
  match: HeadlineMatch;
  /** De quién habla el titular, cuando aplica. Una definición por penales no tiene sujeto. */
  subjectTeamId?: string;
  /** Puntaje final, con peso de etapa y decaimiento. Expuesto para poder testear el orden. */
  score: number;
}

/** Cuántos titulares entran en la portada del Hub. */
export const HEADLINES_LIMIT = 3;

/** Por debajo de esto no vale la pena contarlo. */
const MIN_SCORE = 0.1;
/** Cuánto pierde un titular por cada partido de antigüedad. A los 80, conserva ~0.30. */
const DECAY = 0.985;
/** Brecha de skill que satura la notabilidad de un batacazo. */
const GAP_FULL = 40;
const UPSET_MIN_GAP = 6;
const HOLD_MIN_GAP = 12;
const ROUT_MIN_DIFF = 4;

/**
 * Un batacazo en una eliminación directa vale más que en una fecha de liga.
 * `continental` se queda neutro porque cubre rondas tempranas y tardías con el
 * mismo `stage` en la tabla: la fila no alcanza para distinguirlas.
 */
const STAGE_WEIGHT: Record<MatchHistoryStage, number> = {
  'world-cup-knockout': 1.3,
  'confed-knockout': 1.1,
  cup: 1.1,
  'world-cup-group': 1.0,
  continental: 1.0,
  league: 1.0,
  qualifier: 0.9,
  'confed-group': 0.9,
};

/** Un titular candidato, antes de aplicar peso de etapa y decaimiento. */
interface Candidate {
  kind: HeadlineKind;
  label: string;
  detail: string;
  subjectTeamId?: string;
  /** Notabilidad en 0..1, comparable entre tipos. */
  base: number;
}

/** Titular con su antigüedad, que se necesita para desempatar y se descarta después. */
interface Ranked {
  headline: Headline;
  index: number;
}

/**
 * Todos los titulares que un partido podría producir. El orden de esta lista es
 * el desempate cuando dos tipos empatan en notabilidad.
 */
function candidatesFor(m: HeadlineMatch): Candidate[] {
  const out: Candidate[] = [];
  const gap = Math.abs(m.homeSkillBefore - m.awaySkillBefore);
  const diff = Math.abs(m.homeScore - m.awayScore);
  const draw = m.homeScore === m.awayScore;
  const homeWon = m.homeScore > m.awayScore;
  const winnerId = homeWon ? m.homeTeamId : m.awayTeamId;

  if (!draw && gap >= UPSET_MIN_GAP) {
    const winnerSkill = homeWon ? m.homeSkillBefore : m.awaySkillBefore;
    const loserSkill = homeWon ? m.awaySkillBefore : m.homeSkillBefore;
    if (winnerSkill < loserSkill) {
      out.push({
        kind: 'upset',
        label: 'BATACAZO',
        detail: `le ganó a un rival ${Math.round(gap)} puntos mejor`,
        subjectTeamId: winnerId,
        base: Math.min(gap / GAP_FULL, 1),
      });
    }
  }

  if (diff >= ROUT_MIN_DIFF) {
    out.push({
      kind: 'rout',
      label: 'GOLEADA',
      detail: `${diff} goles de diferencia`,
      subjectTeamId: winnerId,
      base: Math.min((diff - 3) / 4, 1),
    });
  }

  if (m.penalties) {
    out.push({
      kind: 'decider',
      label: 'PENALES',
      detail: 'se definió por penales',
      base: 0.7,
    });
  } else if (m.wentToExtraTime) {
    out.push({
      kind: 'decider',
      label: 'ALARGUE',
      detail: 'se resolvió en el alargue',
      base: 0.5,
    });
  }

  if (draw && gap >= HOLD_MIN_GAP) {
    out.push({
      kind: 'hold',
      label: 'AGUANTE',
      detail: `empató contra un rival ${Math.round(gap)} puntos mejor`,
      subjectTeamId:
        m.homeSkillBefore < m.awaySkillBefore ? m.homeTeamId : m.awayTeamId,
      // Deliberadamente por debajo de un batacazo de la misma brecha:
      // empatarle al grande es menos que ganarle.
      base: Math.min(gap / GAP_FULL, 1) * 0.8,
    });
  }

  return out;
}

/** El de mayor notabilidad. Empate ⇒ el primero declarado en `candidatesFor`. */
function pickBest(candidates: Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  for (const candidate of candidates) {
    if (!best || candidate.base > best.base) best = candidate;
  }
  return best;
}

function rank(candidate: Candidate, m: HeadlineMatch, index: number): Ranked {
  return {
    index,
    headline: {
      kind: candidate.kind,
      label: candidate.label,
      detail: candidate.detail,
      subjectTeamId: candidate.subjectTeamId,
      match: m,
      score: candidate.base * STAGE_WEIGHT[m.stage] * DECAY ** index,
    },
  };
}

/**
 * @param matches Ordenados del más nuevo al más viejo — el orden que devuelve
 *   `getMatchesPage`. El índice de cada partido ES su antigüedad.
 */
export function deriveHeadlines(
  matches: HeadlineMatch[],
  limit: number = HEADLINES_LIMIT,
): Headline[] {
  const ranked: Ranked[] = [];
  matches.forEach((m, index) => {
    const best = pickBest(candidatesFor(m));
    if (best) ranked.push(rank(best, m, index));
  });

  const ordered = ranked
    .filter((r) => r.headline.score >= MIN_SCORE)
    .sort(
      (a, b) =>
        b.headline.score - a.headline.score ||
        a.index - b.index ||
        // Último desempate para que el orden sea determinista y los tests no
        // dependan del orden de iteración.
        a.headline.match.homeTeamId.localeCompare(b.headline.match.homeTeamId),
    );

  // Un equipo no aparece dos veces en la portada: sin esta regla, un equipo con
  // una buena fecha se lleva los tres lugares.
  const used = new Set<string>();
  const out: Headline[] = [];
  for (const { headline } of ordered) {
    if (out.length === limit) break;
    const { homeTeamId, awayTeamId } = headline.match;
    if (used.has(homeTeamId) || used.has(awayTeamId)) continue;
    used.add(homeTeamId);
    used.add(awayTeamId);
    out.push(headline);
  }
  return out;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
npx vitest run src/core/__tests__/headlines.test.ts
```

Esperado: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/headlines.ts src/core/__tests__/headlines.test.ts
git commit -m "feat(titulares): derivación pura de batacazo, goleada, definición y aguante"
```

---

### Task 2: rachas, con la regla de honestidad

**Files:**
- Modify: `src/core/headlines.ts`
- Test: `src/core/__tests__/headlines.test.ts`

**Interfaces:**
- Consumes: de la Task 1 — `HeadlineMatch`, `Headline`, `deriveHeadlines`, y los internos `Candidate`, `Ranked`, `rank`, `STAGE_WEIGHT`, `DECAY`.
- Produces: nada nuevo hacia afuera. `deriveHeadlines` empieza a emitir titulares con `kind: 'streak'` y `label: 'RACHA'`.

**La regla que hay que entender antes de escribir código.** Los partidos de un equipo dentro de la ventana **son** sus últimos partidos, porque la ventana son los últimos del modo. Así que contar victorias hacia atrás desde el más reciente da la racha real. El problema es el borde: si TODOS los partidos del equipo en la ventana son victorias, no se sabe si la racha es de 5 o de 12.

Por eso: **una racha sólo se emite cuando está acotada**, es decir cuando dentro de la ventana también aparece el partido que la cortó (empate o derrota). Si no, no se dice nada. Es preferible callar a subestimar.

Consecuencia aceptada: en selecciones, donde una fecha de clasificatorias son ~84 partidos, la ventana de 80 contiene a lo sumo un partido por equipo y la racha nunca se dispara. Es una degradación silenciosa; los otros cuatro tipos cubren ese modo de sobra.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `src/core/__tests__/headlines.test.ts` (el helper `match` ya está declarado arriba del archivo):

```ts
describe('deriveHeadlines — racha', () => {
  /** Cuatro victorias de A, y después el partido que cortó la racha anterior. */
  const rachaAcotada = (corte: Partial<HeadlineMatch>): HeadlineMatch[] => [
    match({ homeTeamId: 'A', awayTeamId: 'B' }),
    match({ homeTeamId: 'A', awayTeamId: 'C' }),
    match({ homeTeamId: 'A', awayTeamId: 'D' }),
    match({ homeTeamId: 'A', awayTeamId: 'E' }),
    match({ homeTeamId: 'A', awayTeamId: 'F', ...corte }),
  ];

  it('cuatro al hilo, con el corte a la vista, son titular', () => {
    const [h] = deriveHeadlines(rachaAcotada({ homeScore: 0, awayScore: 1 }));
    expect(h.kind).toBe('streak');
    expect(h.label).toBe('RACHA');
    expect(h.subjectTeamId).toBe('A');
    expect(h.detail).toBe('4 victorias al hilo');
  });

  it('un empate también corta la racha', () => {
    const [h] = deriveHeadlines(rachaAcotada({ homeScore: 1, awayScore: 1 }));
    expect(h.detail).toBe('4 victorias al hilo');
  });

  /**
   * La regla de honestidad. Sin el partido que la corta, la racha podría ser de
   * 4 o de 12 y no hay forma de saberlo: se calla. Si este test se cae porque
   * alguien "arregló" el borde emitiendo el número que ve, la app pasa a mentir.
   */
  it('una racha que llega al borde de la ventana NO se emite', () => {
    expect(deriveHeadlines(rachaAcotada({}).slice(0, 4))).toEqual([]);
  });

  it('tres al hilo no alcanzan', () => {
    expect(deriveHeadlines(rachaAcotada({}).slice(0, 3).concat(
      match({ homeTeamId: 'A', awayTeamId: 'F', homeScore: 0, awayScore: 1 }),
    ))).toEqual([]);
  });

  it('la racha se cuenta desde el partido más reciente, no desde el más largo', () => {
    // A gana 2, empata, y antes había ganado 4: la racha vigente es de 2.
    const res = deriveHeadlines([
      match({ homeTeamId: 'A', awayTeamId: 'B' }),
      match({ homeTeamId: 'A', awayTeamId: 'C' }),
      match({ homeTeamId: 'A', awayTeamId: 'D', homeScore: 1, awayScore: 1 }),
      match({ homeTeamId: 'A', awayTeamId: 'E' }),
      match({ homeTeamId: 'A', awayTeamId: 'F' }),
      match({ homeTeamId: 'A', awayTeamId: 'G' }),
      match({ homeTeamId: 'A', awayTeamId: 'H' }),
      match({ homeTeamId: 'A', awayTeamId: 'I', homeScore: 0, awayScore: 1 }),
    ]);
    expect(res).toEqual([]);
  });

  it('el partido que ilustra la racha es el más reciente', () => {
    const [h] = deriveHeadlines(rachaAcotada({ homeScore: 0, awayScore: 1 }));
    expect(h.match.awayTeamId).toBe('B');
  });

  it('las victorias de visitante también cuentan', () => {
    const visitante = (rival: string, over: Partial<HeadlineMatch> = {}) =>
      match({ homeTeamId: rival, awayTeamId: 'A', homeScore: 0, awayScore: 1, ...over });
    const [h] = deriveHeadlines([
      visitante('B'),
      visitante('C'),
      visitante('D'),
      visitante('E'),
      visitante('F', { homeScore: 2, awayScore: 0 }),
    ]);
    expect(h.kind).toBe('streak');
    expect(h.subjectTeamId).toBe('A');
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
npx vitest run src/core/__tests__/headlines.test.ts -t racha
```

Esperado: FAIL — los titulares de racha no se emiten todavía (los tests reciben `[]` o titulares de otro tipo).

- [ ] **Step 3: Agregar la detección de rachas a `src/core/headlines.ts`**

Agregar la constante junto a las otras:

```ts
/** Victorias consecutivas a partir de las cuales una racha es noticia. */
const STREAK_MIN = 4;
```

Agregar, antes de `deriveHeadlines`:

```ts
/** Lo que se sabe de un equipo mientras se recorre la ventana hacia atrás. */
interface TeamRun {
  wins: number;
  /** Ya se vio el partido que cortó la racha: recién ahí el número es confiable. */
  bounded: boolean;
  /** Antigüedad del partido más reciente de la racha. */
  index: number;
  match: HeadlineMatch;
}

/**
 * Rachas vigentes, contadas hacia atrás desde el partido más reciente de cada
 * equipo. Sólo se emiten las ACOTADAS: si todos los partidos del equipo en la
 * ventana son victorias, la racha puede ser más larga de lo que se ve y decir el
 * número visible sería subestimar. Se prefiere callar.
 */
function streakCandidates(matches: HeadlineMatch[]): Ranked[] {
  const runs = new Map<string, TeamRun>();

  const note = (teamId: string, won: boolean, m: HeadlineMatch, index: number) => {
    const run = runs.get(teamId);
    if (run?.bounded) return; // ya se cerró: lo de más atrás no cambia nada
    if (!won) {
      runs.set(teamId, run
        ? { ...run, bounded: true }
        : { wins: 0, bounded: true, index, match: m });
      return;
    }
    if (run) runs.set(teamId, { ...run, wins: run.wins + 1 });
    else runs.set(teamId, { wins: 1, bounded: false, index, match: m });
  };

  matches.forEach((m, index) => {
    note(m.homeTeamId, m.homeScore > m.awayScore, m, index);
    note(m.awayTeamId, m.awayScore > m.homeScore, m, index);
  });

  const out: Ranked[] = [];
  for (const [teamId, run] of runs) {
    if (!run.bounded || run.wins < STREAK_MIN) continue;
    out.push(
      rank(
        {
          kind: 'streak',
          label: 'RACHA',
          detail: `${run.wins} victorias al hilo`,
          subjectTeamId: teamId,
          base: Math.min((run.wins - 3) / 5, 1),
        },
        run.match,
        run.index,
      ),
    );
  }
  return out;
}
```

Y en `deriveHeadlines`, sumar las rachas a la misma bolsa antes de filtrar y ordenar:

```ts
  const ranked: Ranked[] = [];
  matches.forEach((m, index) => {
    const best = pickBest(candidatesFor(m));
    if (best) ranked.push(rank(best, m, index));
  });
  // Las rachas son por equipo, no por partido, así que se calculan aparte y
  // compiten en la misma tabla. La regla de "un equipo no aparece dos veces" es
  // la que evita "BATACAZO: Ben Hur" + "RACHA: Ben Hur, 6 al hilo".
  ranked.push(...streakCandidates(matches));
```

- [ ] **Step 4: Correr toda la suite del módulo**

```bash
npx vitest run src/core/__tests__/headlines.test.ts
```

Esperado: PASS, 25 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/headlines.ts src/core/__tests__/headlines.test.ts
git commit -m "feat(titulares): rachas, sólo cuando están acotadas por la ventana"
```

---

### Task 3: el contador de revisión del historial

**Files:**
- Create: `src/store/useHistoryRevisionStore.ts`
- Modify: `src/services/matchHistoryService.ts:165-173` (`createMatch`) y `:389-396` (`createMatchesBatch`)
- Test: `src/services/__tests__/matchHistoryService.test.ts`

**Interfaces:**
- Produces: `useHistoryRevisionStore` (estado `{ revision: number; bump: () => void }`) y el atajo `bumpHistoryRevision(): void`.

**Por qué el bump va en el servicio y no en los stores que persisten:** `matchHistoryService` es el único cuello de botella por donde pasa el historial de **todos** los modos. Los seis lugares que persisten hoy (`useTournamentStore` ×5, `useSeasonModeStore` ×1) son seis oportunidades de olvidarse, y un modo futuro heredaría el olvido. Es la misma regla que gobierna `src/modes/`: dar de alta un modo es configuración, no código.

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `src/services/__tests__/matchHistoryService.test.ts`:

```ts
describe('revisión del historial', () => {
  const insertParams = {
    homeTeamId: 'A',
    awayTeamId: 'B',
    homeScore: 1,
    awayScore: 0,
    stage: 'league' as const,
    homeSkillBefore: 80,
    awaySkillBefore: 70,
    homeSkillAfter: 81,
    awaySkillAfter: 69,
    homeSkillChange: 1,
    awaySkillChange: -1,
  };

  it('un insert exitoso incrementa la revisión', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(supaLib.supabase as unknown as { from: (...a: unknown[]) => unknown }, 'from')
      .mockReturnValue({
        insert: () => ({
          select: () => ({
            single: async () => ({ data: dbRow('nuevo', '2026-01-01T00:00:00Z'), error: null }),
          }),
        }),
      } as never);

    const antes = useHistoryRevisionStore.getState().revision;
    await matchHistoryService.createMatch(insertParams);

    expect(useHistoryRevisionStore.getState().revision).toBe(antes + 1);
  });

  it('un insert fallido NO incrementa la revisión', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(supaLib.supabase as unknown as { from: (...a: unknown[]) => unknown }, 'from')
      .mockReturnValue({
        insert: () => ({
          select: () => ({
            single: async () => ({ data: null, error: new Error('sin red') }),
          }),
        }),
      } as never);

    const antes = useHistoryRevisionStore.getState().revision;
    await expect(matchHistoryService.createMatch(insertParams)).rejects.toThrow();

    expect(useHistoryRevisionStore.getState().revision).toBe(antes);
  });

  it('un batch exitoso incrementa la revisión una sola vez', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(supaLib.supabase as unknown as { from: (...a: unknown[]) => unknown }, 'from')
      .mockReturnValue({
        insert: () => ({
          select: async () => ({
            data: [dbRow('a', '2026-01-01T00:00:00Z'), dbRow('b', '2026-01-01T00:00:00Z')],
            error: null,
          }),
        }),
      } as never);

    const antes = useHistoryRevisionStore.getState().revision;
    await matchHistoryService.createMatchesBatch([insertParams, insertParams], 'villamariense');

    expect(useHistoryRevisionStore.getState().revision).toBe(antes + 1);
  });
});
```

Agregar el import arriba del archivo, junto a los que ya están:

```ts
import { useHistoryRevisionStore } from '../../store/useHistoryRevisionStore';
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
npx vitest run src/services/__tests__/matchHistoryService.test.ts -t revisión
```

Esperado: FAIL — `Failed to resolve import "../../store/useHistoryRevisionStore"`.

- [ ] **Step 3: Crear el store**

`src/store/useHistoryRevisionStore.ts`:

```ts
import { create } from 'zustand';

/**
 * CUÁNDO CAMBIÓ EL HISTORIAL. Un contador y nada más: quien lee `match_history`
 * y quiere estar al día se suscribe acá en vez de re-consultar por las dudas.
 *
 * Lo incrementa `matchHistoryService` tras un insert exitoso. Va ahí y no en los
 * stores que persisten porque el servicio es el único cuello de botella por
 * donde pasa el historial de todos los modos: los seis lugares que hoy escriben
 * son seis oportunidades de olvidarse, y un modo futuro heredaría el olvido.
 */
interface HistoryRevisionState {
  revision: number;
  bump: () => void;
}

export const useHistoryRevisionStore = create<HistoryRevisionState>((set) => ({
  revision: 0,
  bump: () => set((state) => ({ revision: state.revision + 1 })),
}));

/** Atajo para los llamadores que no son componentes. */
export const bumpHistoryRevision = (): void => useHistoryRevisionStore.getState().bump();
```

- [ ] **Step 4: Incrementar la revisión en el servicio**

En `src/services/matchHistoryService.ts`, agregar el import arriba:

```ts
import { bumpHistoryRevision } from '../store/useHistoryRevisionStore';
```

En `createMatch`, justo después de `if (error) throw error;` y antes del `return`:

```ts
    bumpHistoryRevision();
    return dbMatchToMatch(data);
```

En `createMatchesBatch`, igual:

```ts
    bumpHistoryRevision();
    return data.map(dbMatchToMatch);
```

Las ramas de `!isSupabaseConfigured()` **no** incrementan: sin Supabase no hay historial que releer, y `getMatchesPage` ya devuelve vacío.

- [ ] **Step 5: Correr los tests del servicio**

```bash
npx vitest run src/services/__tests__/matchHistoryService.test.ts
```

Esperado: PASS, todos.

- [ ] **Step 6: Commit**

```bash
git add src/store/useHistoryRevisionStore.ts src/services/matchHistoryService.ts src/services/__tests__/matchHistoryService.test.ts
git commit -m "feat(titulares): contador de revisión del historial en el servicio"
```

---

### Task 4: `useRecentHeadlines`

**Files:**
- Create: `src/hooks/useRecentHeadlines.ts`
- Test: `src/hooks/__tests__/useRecentHeadlines.test.tsx`

**Interfaces:**
- Consumes: `deriveHeadlines`, `Headline`, `HeadlineMatch` de `src/core/headlines.ts` (Task 1); `useHistoryRevisionStore` de `src/store/useHistoryRevisionStore.ts` (Task 3); `matchHistoryService.getMatchesPage({ cursor?, pageSize?, stage?, modeId? })` que devuelve `Promise<{ matches: MatchHistoryEntry[]; nextCursor; hasMore }>`; `useModeStore` (campo `activeModeId: string`); `useTournamentStore` (campo `teams: Team[]`, con `{ id, name }`).
- Produces: `useRecentHeadlines(): HeadlineView[]`, `HeadlineView` (= `Headline` + `homeTeamName` + `awayTeamName`), `toHeadlineMatch(entry: MatchHistoryEntry): HeadlineMatch`, `HEADLINES_WINDOW = 80`, `HEADLINES_DEBOUNCE_MS = 300`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/hooks/__tests__/useRecentHeadlines.test.tsx`:

```tsx
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRecentHeadlines } from '../useRecentHeadlines';
import { matchHistoryService, type MatchHistoryEntry } from '../../services/matchHistoryService';
import { useModeStore } from '../../store/useModeStore';
import { useTournamentStore } from '../../store/useTournamentStore';
import { useHistoryRevisionStore } from '../../store/useHistoryRevisionStore';

/** Fila de historial que produce un batacazo de A sobre B. */
const batacazo = (over: Partial<MatchHistoryEntry> = {}): MatchHistoryEntry => ({
  id: 'm1',
  homeTeamId: 'A',
  awayTeamId: 'B',
  homeScore: 2,
  awayScore: 0,
  stage: 'league',
  homeSkillBefore: 55,
  awaySkillBefore: 90,
  homeSkillAfter: 56,
  awaySkillAfter: 89,
  homeSkillChange: 1,
  awaySkillChange: -1,
  playedAt: '2026-01-01T00:00:00Z',
  ...over,
});

const page = (matches: MatchHistoryEntry[]) => ({ matches, nextCursor: null, hasMore: false });

beforeEach(() => {
  vi.useFakeTimers();
  useModeStore.setState({ activeModeId: 'villamariense' });
  useTournamentStore.setState({
    teams: [
      { id: 'A', name: 'Ben Hur', flag: '', skill: 55 },
      { id: 'B', name: 'Alumni', flag: '', skill: 90 },
    ],
  });
  useHistoryRevisionStore.setState({ revision: 0 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Corre el debounce y deja que la promesa del servicio se resuelva. */
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
}

describe('useRecentHeadlines', () => {
  it('consulta la ventana del modo activo', async () => {
    const spy = vi.spyOn(matchHistoryService, 'getMatchesPage').mockResolvedValue(page([]));
    renderHook(() => useRecentHeadlines());
    await flush();

    expect(spy).toHaveBeenCalledWith({ modeId: 'villamariense', pageSize: 80 });
  });

  it('devuelve los titulares con los nombres resueltos', async () => {
    vi.spyOn(matchHistoryService, 'getMatchesPage').mockResolvedValue(page([batacazo()]));
    const { result } = renderHook(() => useRecentHeadlines());
    await flush();

    expect(result.current).toHaveLength(1);
    expect(result.current[0].kind).toBe('upset');
    expect(result.current[0].homeTeamName).toBe('Ben Hur');
    expect(result.current[0].awayTeamName).toBe('Alumni');
  });

  it('un equipo que no está en el pool cae a su id', async () => {
    vi.spyOn(matchHistoryService, 'getMatchesPage')
      .mockResolvedValue(page([batacazo({ awayTeamId: 'FANTASMA' })]));
    const { result } = renderHook(() => useRecentHeadlines());
    await flush();

    expect(result.current[0].awayTeamName).toBe('FANTASMA');
  });

  it('los penales viajan desde metadata', async () => {
    vi.spyOn(matchHistoryService, 'getMatchesPage').mockResolvedValue(
      page([
        batacazo({
          homeScore: 1,
          awayScore: 1,
          homeSkillBefore: 80,
          awaySkillBefore: 80,
          stage: 'cup',
          metadata: { penalties: { homeScore: 4, awayScore: 2 } },
        }),
      ]),
    );
    const { result } = renderHook(() => useRecentHeadlines());
    await flush();

    expect(result.current[0].label).toBe('PENALES');
  });

  /** El bloque es decoración: un fallo de red no puede romper el Hub. */
  it('un error del servicio deja lista vacía sin propagar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(matchHistoryService, 'getMatchesPage').mockRejectedValue(new Error('sin red'));
    const { result } = renderHook(() => useRecentHeadlines());
    await flush();

    expect(result.current).toEqual([]);
  });

  it('un cambio de revisión vuelve a consultar', async () => {
    const spy = vi.spyOn(matchHistoryService, 'getMatchesPage').mockResolvedValue(page([]));
    renderHook(() => useRecentHeadlines());
    await flush();
    expect(spy).toHaveBeenCalledTimes(1);

    act(() => {
      useHistoryRevisionStore.getState().bump();
    });
    await flush();

    expect(spy).toHaveBeenCalledTimes(2);
  });

  /**
   * Una fecha de temporada persiste partido por partido: diez `createMatch` en
   * paralelo son diez bumps. Sin debounce serían diez consultas.
   */
  it('diez bumps seguidos hacen una sola consulta', async () => {
    const spy = vi.spyOn(matchHistoryService, 'getMatchesPage').mockResolvedValue(page([]));
    renderHook(() => useRecentHeadlines());
    await flush();
    expect(spy).toHaveBeenCalledTimes(1);

    act(() => {
      for (let i = 0; i < 10; i++) useHistoryRevisionStore.getState().bump();
    });
    await flush();

    expect(spy).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npx vitest run src/hooks/__tests__/useRecentHeadlines.test.tsx
```

Esperado: FAIL — `Failed to resolve import "../useRecentHeadlines"`.

- [ ] **Step 3: Escribir `src/hooks/useRecentHeadlines.ts`**

```ts
import { useEffect, useMemo, useState } from 'react';
import { deriveHeadlines, type Headline, type HeadlineMatch } from '../core/headlines';
import { matchHistoryService, type MatchHistoryEntry } from '../services/matchHistoryService';
import { useHistoryRevisionStore } from '../store/useHistoryRevisionStore';
import { useModeStore } from '../store/useModeStore';
import { useTournamentStore } from '../store/useTournamentStore';

/**
 * Cuántos partidos mira la portada. El RPC `get_matches_page` topea en 100.
 *
 * La ventana NO es "la última fecha", y no puede serlo: el ciclo persiste en
 * batch (una transacción, todos los `played_at` idénticos) pero el modo de
 * temporada persiste partido por partido, con `played_at` distintos por
 * milisegundos. Cualquier agrupamiento por tiempo sería frágil en un motor o en
 * el otro. Son los últimos 80 partidos del modo, y el decaimiento de
 * `deriveHeadlines` se encarga de que lo viejo pese menos.
 */
export const HEADLINES_WINDOW = 80;

/** Una fecha de temporada dispara diez inserts en paralelo, o sea diez bumps. */
export const HEADLINES_DEBOUNCE_MS = 300;

export interface HeadlineView extends Headline {
  homeTeamName: string;
  awayTeamName: string;
}

/** Adapta una fila del historial a la forma neutra que consume la derivación. */
export function toHeadlineMatch(entry: MatchHistoryEntry): HeadlineMatch {
  const penalties = (
    entry.metadata as { penalties?: { homeScore: number; awayScore: number } } | undefined
  )?.penalties;
  return {
    homeTeamId: entry.homeTeamId,
    awayTeamId: entry.awayTeamId,
    homeScore: entry.homeScore,
    awayScore: entry.awayScore,
    homeSkillBefore: entry.homeSkillBefore,
    awaySkillBefore: entry.awaySkillBefore,
    stage: entry.stage,
    wentToExtraTime: entry.wentToExtraTime,
    ...(penalties ? { penalties } : {}),
  };
}

/**
 * Los titulares del modo activo, listos para dibujar.
 *
 * Es el único lugar de esta feature que toca stores y servicios: la derivación
 * es pura y la tarjeta es presentacional.
 *
 * No devuelve `loading` a propósito: mientras carga no se rinde nada. Un
 * esqueleto para un bloque opcional sería ruido, y el Hub ya tiene su propio
 * `idle` para lo que sí importa.
 */
export function useRecentHeadlines(): HeadlineView[] {
  const modeId = useModeStore((s) => s.activeModeId);
  const revision = useHistoryRevisionStore((s) => s.revision);
  const teams = useTournamentStore((s) => s.teams);
  const [headlines, setHeadlines] = useState<Headline[]>([]);

  // `teams` NO es dependencia de este efecto: los nombres se resuelven abajo, y
  // meterlo acá dispararía una consulta cada vez que cambia un skill.
  useEffect(() => {
    if (!modeId) {
      setHeadlines([]);
      return;
    }
    let cancelled = false;
    // El cleanup cancela el timer anterior, así que ráfagas de bumps colapsan en
    // una sola consulta: un debounce trailing sin código extra.
    const timer = setTimeout(async () => {
      try {
        const page = await matchHistoryService.getMatchesPage({
          modeId,
          pageSize: HEADLINES_WINDOW,
        });
        if (cancelled) return;
        setHeadlines(deriveHeadlines(page.matches.map(toHeadlineMatch)));
      } catch (error) {
        if (cancelled) return;
        // Decoración: un fallo de red no puede romper el Hub ni bloquear el
        // botón de continuar. Se avisa por consola y no se rinde nada.
        console.error('No se pudieron leer los titulares:', error);
        setHeadlines([]);
      }
    }, HEADLINES_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [modeId, revision]);

  return useMemo(
    () =>
      headlines.map((headline) => ({
        ...headline,
        homeTeamName:
          teams.find((t) => t.id === headline.match.homeTeamId)?.name ?? headline.match.homeTeamId,
        awayTeamName:
          teams.find((t) => t.id === headline.match.awayTeamId)?.name ?? headline.match.awayTeamId,
      })),
    [headlines, teams],
  );
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
npx vitest run src/hooks/__tests__/useRecentHeadlines.test.tsx
```

Esperado: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useRecentHeadlines.ts src/hooks/__tests__/useRecentHeadlines.test.tsx
git commit -m "feat(titulares): hook que lee la ventana del modo y resuelve nombres"
```

---

### Task 5: `HeadlinesCard`

**Files:**
- Create: `src/components/hub/HeadlinesCard.tsx`
- Test: `src/components/hub/__tests__/HeadlinesCard.test.tsx`

**Interfaces:**
- Consumes: `HeadlineView` de `src/hooks/useRecentHeadlines.ts` (Task 4); `HeadlineKind` de `src/core/headlines.ts` (Task 1); `Card`/`CardContent` de `src/components/ui/Card.tsx`; `TeamFlag` de `src/components/ui/TeamFlag.tsx` (props `{ teamId, teamName, size? }`); `penaltiesLabel(penalties?)` de `src/utils/matchLabels.ts`, que devuelve `"Penales 4 - 2"` o `null`; `cn` de `src/lib/utils.ts`.
- Produces: `HeadlinesCard({ headlines }: { headlines: HeadlineView[] })`.

**Referencia de estilo:** el bloque que reemplaza está en `src/components/hub/HubView.tsx:78-103`. Mismas clases de layout (`flex items-center justify-between gap-3`, `truncate`, `min-w-0`, `shrink-0`) para que aguante 320 px de ancho. Paleta del proyecto: `text-gold`, `text-grass-soft`, `text-white`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/hub/__tests__/HeadlinesCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HeadlinesCard } from '../HeadlinesCard';
import type { HeadlineView } from '../../../hooks/useRecentHeadlines';

const headline = (over: Partial<HeadlineView> = {}): HeadlineView => ({
  kind: 'upset',
  label: 'BATACAZO',
  detail: 'le ganó a un rival 25 puntos mejor',
  subjectTeamId: 'A',
  score: 0.6,
  homeTeamName: 'Ben Hur',
  awayTeamName: 'Alumni',
  match: {
    homeTeamId: 'A',
    awayTeamId: 'B',
    homeScore: 2,
    awayScore: 0,
    homeSkillBefore: 60,
    awaySkillBefore: 85,
    stage: 'league',
  },
  ...over,
});

describe('HeadlinesCard', () => {
  it('sin titulares no rinde nada', () => {
    const { container } = render(<HeadlinesCard headlines={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('rinde etiqueta, marcador y explicación', () => {
    render(<HeadlinesCard headlines={[headline()]} />);
    expect(screen.getByText('BATACAZO')).toBeInTheDocument();
    expect(screen.getByText('Ben Hur')).toBeInTheDocument();
    expect(screen.getByText('Alumni')).toBeInTheDocument();
    expect(screen.getByText('2 - 0')).toBeInTheDocument();
    expect(screen.getByText('le ganó a un rival 25 puntos mejor')).toBeInTheDocument();
  });

  it('rinde los tres titulares de la portada', () => {
    render(
      <HeadlinesCard
        headlines={[
          headline(),
          headline({
            kind: 'rout',
            label: 'GOLEADA',
            detail: '5 goles de diferencia',
            homeTeamName: 'Ferrocarril',
            awayTeamName: 'Bochas',
            match: { ...headline().match, homeTeamId: 'C', awayTeamId: 'D' },
          }),
          headline({
            kind: 'streak',
            label: 'RACHA',
            detail: '6 victorias al hilo',
            homeTeamName: 'Talleres',
            awayTeamName: 'Alem',
            match: { ...headline().match, homeTeamId: 'E', awayTeamId: 'F' },
          }),
        ]}
      />,
    );
    expect(screen.getByText('BATACAZO')).toBeInTheDocument();
    expect(screen.getByText('GOLEADA')).toBeInTheDocument();
    expect(screen.getByText('RACHA')).toBeInTheDocument();
  });

  it('muestra la tanda de penales junto al marcador', () => {
    render(
      <HeadlinesCard
        headlines={[
          headline({
            kind: 'decider',
            label: 'PENALES',
            detail: 'se definió por penales',
            subjectTeamId: undefined,
            match: {
              ...headline().match,
              homeScore: 1,
              awayScore: 1,
              penalties: { homeScore: 4, awayScore: 2 },
            },
          }),
        ]}
      />,
    );
    expect(screen.getByText(/Penales 4 - 2/)).toBeInTheDocument();
  });

  /**
   * El texto se escribe en minúscula y la mayúscula la pone el CSS (`uppercase`),
   * igual que el bloque que este reemplaza — por eso las aserciones van con
   * regex insensible a mayúsculas y no con el string literal.
   */
  it('titula el bloque en la tipografía arcade', () => {
    render(<HeadlinesCard headlines={[headline()]} />);
    const titulo = screen.getByText(/titulares/i);
    expect(titulo.className).toContain('font-arcade');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npx vitest run src/components/hub/__tests__/HeadlinesCard.test.tsx
```

Esperado: FAIL — `Failed to resolve import "../HeadlinesCard"`.

- [ ] **Step 3: Escribir `src/components/hub/HeadlinesCard.tsx`**

```tsx
import { Flame, Shield, Target, TrendingUp, Zap, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '../ui/Card';
import { TeamFlag } from '../ui/TeamFlag';
import { penaltiesLabel } from '../../utils/matchLabels';
import { cn } from '../../lib/utils';
import type { HeadlineKind } from '../../core/headlines';
import type { HeadlineView } from '../../hooks/useRecentHeadlines';

const KIND_ICON: Record<HeadlineKind, LucideIcon> = {
  upset: Zap,
  rout: Flame,
  decider: Target,
  hold: Shield,
  streak: TrendingUp,
};

/**
 * La portada del Hub: lo más notable de los últimos partidos del modo.
 *
 * Presentacional puro — recibe todo por props y no importa ningún store, igual
 * que `HubView`. Con la lista vacía no rinde nada: el bloque aparece cuando hay
 * algo que contar, no antes.
 */
export function HeadlinesCard({ headlines }: { headlines: HeadlineView[] }) {
  if (headlines.length === 0) return null;

  return (
    <Card>
      <CardContent className="py-4 space-y-4">
        {/* "TITULARES" y no "LO ÚLTIMO": Press Start 2P no tiene la Ú mayúscula,
            y escribirlo sin tilde sería una falta de ortografía en pantalla. */}
        <p className="font-arcade text-[9px] text-grass-soft uppercase">Titulares</p>

        {headlines.map((headline) => {
          const Icon = KIND_ICON[headline.kind];
          const penales = penaltiesLabel(headline.match.penalties);
          return (
            <div key={`${headline.match.homeTeamId}-${headline.match.awayTeamId}`} className="space-y-1">
              <p className="font-arcade text-[9px] text-gold flex items-center gap-2">
                <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
                {headline.label}
              </p>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 min-w-0">
                  <TeamFlag
                    teamId={headline.match.homeTeamId}
                    teamName={headline.homeTeamName}
                    size={24}
                  />
                  <span
                    className={cn(
                      'truncate',
                      headline.subjectTeamId === headline.match.homeTeamId && 'text-gold',
                    )}
                  >
                    {headline.homeTeamName}
                  </span>
                </span>
                <span className="font-arcade text-sm text-white shrink-0">
                  {headline.match.homeScore} - {headline.match.awayScore}
                </span>
                <span className="flex items-center gap-2 min-w-0 justify-end">
                  <span
                    className={cn(
                      'truncate',
                      headline.subjectTeamId === headline.match.awayTeamId && 'text-gold',
                    )}
                  >
                    {headline.awayTeamName}
                  </span>
                  <TeamFlag
                    teamId={headline.match.awayTeamId}
                    teamName={headline.awayTeamName}
                    size={24}
                  />
                </span>
              </div>
              <p className="text-grass-soft text-xs">
                {headline.detail}
                {penales && ` · ${penales}`}
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
npx vitest run src/components/hub/__tests__/HeadlinesCard.test.tsx
```

Esperado: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/hub/HeadlinesCard.tsx src/components/hub/__tests__/HeadlinesCard.test.tsx
git commit -m "feat(titulares): tarjeta de portada del Hub"
```

---

### Task 6: cablear el Hub, y probar el cable

**Files:**
- Modify: `src/components/hub/HubView.tsx` (props, imports y el bloque de las líneas 78-103)
- Modify: `src/components/hub/__tests__/HubView.test.tsx` (líneas 38, 121-161)
- Modify: `src/App.tsx` (hooks del Hub, ~línea 91; render del Hub, ~línea 246)
- Create: `src/__tests__/App.headlines.test.tsx`

**Interfaces:**
- Consumes: `useRecentHeadlines(): HeadlineView[]` y `HeadlineView` de `src/hooks/useRecentHeadlines.ts` (Task 4); `HeadlinesCard` de `src/components/hub/HeadlinesCard.tsx` (Task 5).
- Produces: nada nuevo. `HubView` cambia la prop `lastResult: MatchResult | null` por `headlines: HeadlineView[]`.

**Por qué existe el test de cableado.** El Critical de la etapa 1 pasó con 866 tests en verde: la derivación estaba bien, el componente estaba bien, y el cable entre los dos estaba mal. `src/__tests__/App.seasonLoad.test.tsx` nació de eso y es el molde a copiar. Sin este test, borrar la prop en `App.tsx` deja la suite entera en verde.

- [ ] **Step 1: Escribir el test de cableado que falla**

Crear `src/__tests__/App.headlines.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../App';
import { matchHistoryService, type MatchHistoryEntry } from '../services/matchHistoryService';
import { useModeStore } from '../store/useModeStore';
import { useSeasonModeStore } from '../store/useSeasonModeStore';
import { useTournamentStore } from '../store/useTournamentStore';
import type { GameMode } from '../types';

// A diferencia de `App.seasonLoad.test.tsx`, acá NO se mockea `../lib/supabase`:
// ese test corta en la pantalla de reintento y no monta ninguna vista, mientras
// que éste renderiza el Hub entero. Sin las env vars, `isSupabaseConfigured()`
// ya devuelve false y los servicios cortan solos — es lo que hace `App.test.tsx`,
// que también renderiza la app completa.
vi.mock('../lib/hydrateSettings', () => ({
  hydrateSettings: vi.fn(),
  clearLegacyTournamentStorage: vi.fn(),
}));

const VILLAMARIENSE: GameMode = {
  id: 'villamariense',
  name: 'Liga Villamariense',
  kind: 'league-system',
  config: {},
  currentYear: 2028,
};

const BATACAZO: MatchHistoryEntry = {
  id: 'm1',
  homeTeamId: 'A',
  awayTeamId: 'B',
  homeScore: 2,
  awayScore: 0,
  stage: 'league',
  homeSkillBefore: 55,
  awaySkillBefore: 90,
  homeSkillAfter: 56,
  awaySkillAfter: 89,
  homeSkillChange: 1,
  awaySkillChange: -1,
  playedAt: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  useTournamentStore.setState({
    initStatus: 'ready',
    currentTournament: null,
    teams: [
      { id: 'A', name: 'Ben Hur', flag: '', skill: 55 },
      { id: 'B', name: 'Alumni', flag: '', skill: 90 },
    ],
    loadTeamsFromDatabase: vi.fn(async () => {}),
    initializeTournament: vi.fn(async () => {}),
    refreshFromDatabase: vi.fn(async () => {}),
  });
  useModeStore.setState({
    activeModeId: 'villamariense',
    modes: [VILLAMARIENSE],
    isLoaded: true,
    loadModes: vi.fn(async () => {}),
  });
  useSeasonModeStore.setState({ loadForMode: vi.fn(async () => {}) });
});

/**
 * EL TEST DEL CABLE. La derivación y la tarjeta tienen sus propios tests; este
 * es el único que se rompe si `App.tsx` deja de pasarle los titulares al Hub.
 * El Critical de la etapa 1 —la Liga Villamariense muerta— pasó con 866 tests
 * en verde justamente por no tener uno así.
 */
describe('App — los titulares llegan al Hub', () => {
  it('un batacazo del historial se ve en la pantalla de inicio', async () => {
    vi.spyOn(matchHistoryService, 'getMatchesPage').mockResolvedValue({
      matches: [BATACAZO],
      nextCursor: null,
      hasMore: false,
    });

    render(<App />);

    expect(await screen.findByText('BATACAZO')).toBeInTheDocument();
    expect(screen.getByText('Ben Hur')).toBeInTheDocument();
  });

  it('sin partidos en el historial, el Hub no rinde el bloque', async () => {
    vi.spyOn(matchHistoryService, 'getMatchesPage').mockResolvedValue({
      matches: [],
      nextCursor: null,
      hasMore: false,
    });

    render(<App />);

    await waitFor(() => expect(matchHistoryService.getMatchesPage).toHaveBeenCalled());
    expect(screen.queryByText(/titulares/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npx vitest run src/__tests__/App.headlines.test.tsx
```

Esperado: FAIL — no aparece "BATACAZO" en la pantalla (el Hub todavía recibe `lastResult={null}`).

- [ ] **Step 3: Cambiar la prop de `HubView`**

En `src/components/hub/HubView.tsx`:

Borrar los imports `TeamFlag` y `MatchResult`, agregar `HeadlinesCard` y `HeadlineView`:

```tsx
import { HeadlinesCard } from './HeadlinesCard';
import type { HeadlineView } from '../../hooks/useRecentHeadlines';
```

En `HubViewProps`, reemplazar:

```tsx
  lastResult: MatchResult | null;
```

por:

```tsx
  /** La portada: lo más notable de los últimos partidos del modo. Vacía ⇒ no se rinde. */
  headlines: HeadlineView[];
```

En la firma del componente, cambiar `lastResult` por `headlines`, y reemplazar el bloque entero de `{lastResult && ( … )}` (líneas 78-103) por:

```tsx
      <HeadlinesCard headlines={headlines} />
```

- [ ] **Step 4: Actualizar los tests de `HubView`**

En `src/components/hub/__tests__/HubView.test.tsx`:

- En `props()`, cambiar `lastResult: null,` por `headlines: [],`.
- Borrar los tres tests que probaban el bloque viejo: `'sin último resultado no rinde ese bloque'`, `'con último resultado lo muestra'` y `'con ids de equipo en el resultado rinde las banderas'` (líneas 121-161). Lo que afirmaban ahora lo cubre `HeadlinesCard.test.tsx`, con la excepción del `<img>` de la bandera, que se conserva en el test nuevo de acá abajo.
- Agregar, en su lugar:

```tsx
  it('sin titulares no rinde el bloque de portada', () => {
    render(<HubView {...props()} />);
    expect(screen.queryByText(/titulares/i)).not.toBeInTheDocument();
  });

  it('con titulares los rinde, con banderas', () => {
    // Ids de selección (código de país): `TeamFlag` deriva la URL del id y no
    // depende del pool de equipos del store, así que no hace falta sembrarlo.
    render(
      <HubView
        {...props({
          headlines: [
            {
              kind: 'upset',
              label: 'BATACAZO',
              detail: 'le ganó a un rival 25 puntos mejor',
              subjectTeamId: 'isl',
              score: 0.6,
              homeTeamName: 'Islandia',
              awayTeamName: 'Brasil',
              match: {
                homeTeamId: 'isl',
                awayTeamId: 'bra',
                homeScore: 2,
                awayScore: 1,
                homeSkillBefore: 60,
                awaySkillBefore: 85,
                stage: 'qualifier',
              },
            },
          ],
        })}
      />,
    );
    expect(screen.getByText('BATACAZO')).toBeInTheDocument();
    expect(screen.getByText('Islandia')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /islandia/i })).toHaveAttribute(
      'src',
      expect.stringContaining('flagcdn.com'),
    );
  });
```

- [ ] **Step 5: Cablear `App.tsx`**

Agregar el import:

```tsx
import { useRecentHeadlines } from './hooks/useRecentHeadlines';
```

Junto a los otros hooks del Hub (después de `const nextAction = useNextAction(navigateTo);`, **antes** de los `return` condicionales — el archivo ya explica por qué en el comentario de arriba de ese bloque):

```tsx
  const headlines = useRecentHeadlines();
```

En el render del Hub, reemplazar la prop `lastResult={null}` y **borrar el comentario de siete renglones que la explicaba** (empieza en "Sin último resultado por ahora, a propósito"), por:

```tsx
          headlines={headlines}
```

- [ ] **Step 6: Correr la suite completa**

```bash
set -o pipefail; npm test 2>&1 | grep -E "Test Files|Tests |FAIL"
```

Esperado: 0 failed. El total sube ~40 tests respecto de los 890 de la etapa 1 (≈930): 18 + 7 de la derivación, 3 del servicio, 7 del hook, 5 de la tarjeta, y en el Hub entran 2 y salen 3.

- [ ] **Step 7: Verificar tipos y build**

```bash
npx tsc -b && npm run build
```

Esperado: sin errores.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/components/hub/HubView.tsx src/components/hub/__tests__/HubView.test.tsx src/__tests__/App.headlines.test.tsx
git commit -m "feat(titulares): la portada reemplaza al bloque de último resultado en el Hub"
```
