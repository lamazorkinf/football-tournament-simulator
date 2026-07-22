# Simulación de partidos minuto a minuto (en vivo)

**Fecha:** 2026-07-22
**Rama:** `feat/sim-minuto-a-minuto`
**Estado:** Diseño aprobado (alcance confirmado por el usuario)

## Contexto

Hoy todo partido se resuelve al instante: el motor (`src/core/engine.ts`) calcula
el marcador final (goles por Poisson) y los cambios de skill (Elo), y las acciones
`simulate*` del store lo persisten y las vistas lo muestran de una. El usuario quiere
poder **ver algunos partidos jugarse minuto a minuto**, con un reloj que avanza y los
goles apareciendo, sin cambiar la estadística del torneo.

## Objetivos

1. Un botón **"Ver en vivo"** junto al "Simular" de siempre, disponible en **cualquier
   partido individual** (clasificatorias, mundial grupos/knockout, continental,
   confederaciones). Es **opt-in por partido**: el usuario elige cuáles ver.
2. Durante el partido en vivo se ve: **marcador con escudos, reloj que avanza (1'→90'+),
   y un feed de goles** (minuto + equipo que marcó). Nada más.
3. **Ritmo con velocidad ajustable (1x / 2x / 4x)** y un botón **"Saltar al final"**.
4. El motor Elo/Poisson y la persistencia quedan **intactos**: ver un partido no cambia
   sus probabilidades ni el balance del torneo.

## No-objetivos (fuera de alcance — YAGNI)

- Comentarios/jugadas menores (tiros, tarjetas, atajadas, ocasiones).
- Barra de momentum/posesión o remates acumulados.
- Simulación "real" minuto a minuto donde el marcador emerge del reloj.
- Kick-by-kick de la tanda de penales (se revela solo el marcador final de penales).
- Modo global "todo en vivo", pausar/reanudar.
- Rediseño de las vistas existentes.

## Principio central: **commit-then-replay** (decidir y luego reproducir)

Ver un partido en vivo **es** simularlo, con una reproducción visual encima:

1. El usuario toca **"Ver en vivo"** en un partido no jugado.
2. Se ejecuta **la misma acción `simulate*` de siempre** → el motor decide el resultado
   con el modelo actual, actualiza skills y persiste. Igual que "Simular".
3. Con el resultado **ya comprometido**, se abre un overlay que lo **reproduce** minuto
   a minuto.

Consecuencias (todas deseables):

- **Cero divergencia:** no hay una segunda tirada del motor; se reproduce exactamente lo
  que se guardó. Un partido visto y uno simulado son idénticos.
- **Robustez:** el resultado queda guardado apenas arranca. Cerrar el overlay, saltar al
  final o que se corte la app deja el partido correctamente jugado y persistido — nunca
  hay estados a medias.
- **Sin spoiler:** el overlay tapa la vista a pantalla completa; el marcador real (que ya
  se actualizó detrás) no se ve hasta que la reproducción lo revela. Las acciones
  `simulate*` individuales **no** disparan toast de resultado (verificado), y el modo
  vivo llama a la acción del store directamente (no pasa por el modal de resultado de las
  vistas), así que no hay nada que suprimir.

## Arquitectura y componentes

Unidades chicas, aisladas y con interfaces claras:

### 1. `src/core/liveMatch.ts` — motor de timeline (puro)

Sin dependencias de React ni del store; testeable en Node.

```ts
export type LiveSide = 'home' | 'away';

export interface LiveGoalEvent {
  minute: number;     // 1..90 (uniforme; sin descuento en esta versión)
  side: LiveSide;
  homeScore: number;  // marcador ACUMULADO tras este gol
  awayScore: number;
}

export interface LivePenaltiesResult {
  homeScore: number;
  awayScore: number;
}

export interface LiveTimeline {
  goals: LiveGoalEvent[];          // ordenados ascendente por minuto
  finalHomeScore: number;
  finalAwayScore: number;
  penalties?: LivePenaltiesResult; // presente solo si el resultado fue a penales
}

/** Hash determinista de un string (matchId) a uint32, para sembrar el PRNG. */
export function hashSeed(input: string): number;

/**
 * Reparte `homeScore`+`awayScore` goles en minutos plausibles y arma el timeline.
 * Determinista dado (marcadores, seed). `rng` inyectable para tests.
 */
export function buildMatchTimeline(
  homeScore: number,
  awayScore: number,
  seed: number,
  penalties?: LivePenaltiesResult,
  rng?: () => number,          // default: mulberry32(seed), puro
): LiveTimeline;
```

**Algoritmo de `buildMatchTimeline`:**
- Para cada uno de los `homeScore` goles locales y `awayScore` visitantes, sortear un
  minuto en `[1, 90]` con el PRNG sembrado (`minute = 1 + floor(rng() * 90)`).
- Etiquetar cada gol con su `side`, combinar todos, ordenar ascendente por minuto
  (tie-break estable), y calcular el marcador acumulado (`homeScore`/`awayScore` de cada
  evento).
- `finalHomeScore`/`finalAwayScore` = los marcadores recibidos. `penalties` se pasa tal
  cual (sin recalcular).
- `0-0` → `goals: []`, finales en 0, sin penales (salvo que se reciban).
- Se permiten dos goles en el mismo minuto (pasa en el fútbol real); no se fuerza unicidad.

**PRNG:** `mulberry32` (o equivalente) sembrado con `seed`. Puro, sin `Math.random`/`Date.now`
en el camino por defecto de tests (se usa `hashSeed(matchId)` como semilla real en runtime,
lo que hace el timeline estable para un mismo partido/marcador).

### 2. `src/store/useLiveMatchStore.ts` — controlador global (zustand)

Consistente con el resto de stores del proyecto (`useTournamentStore`, `useToastStore`, …).

```ts
export interface LiveMatchDescriptor {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  kind: 'qualifier' | 'world-cup' | 'knockout' | 'continental' | 'confederations';
  groupId?: string; // requerido cuando kind es 'qualifier' | 'world-cup'
}

interface LiveMatchState {
  activeMatch: LiveMatchDescriptor | null;
  openLiveMatch: (descriptor: LiveMatchDescriptor) => void;
  closeLiveMatch: () => void;
}
```

El botón sólo llama a `openLiveMatch(...)`; el modal (montado una vez en la raíz) hace toda
la orquestación. Así ninguna vista duplica lógica.

### 3. Cambio en las acciones `simulate*` del store (`useTournamentStore.ts`)

Las 4 acciones devuelven el resultado comprometido en vez de `void`, para que el modal lo
reproduzca sin volver a tirar el motor:

```ts
export interface SimulatedMatchOutcome {
  homeScore: number;
  awayScore: number;
  penalties?: { homeScore: number; awayScore: number };
}
```

- `simulateMatch(matchId, groupId, stage): Promise<SimulatedMatchOutcome | null>`
- `simulateKnockoutMatch(matchId): Promise<SimulatedMatchOutcome | null>`
- `simulateContinentalMatch(matchId): Promise<SimulatedMatchOutcome | null>`
- `simulateConfederationsMatch(matchId): Promise<SimulatedMatchOutcome | null>`

Devuelven `null` cuando el guard rechaza / el partido ya estaba jugado / no hay nada que
simular. **Los llamadores actuales que hacen `await accion(...)` e ignoran el retorno no se
ven afectados** (incluido `simulateMatchdayBatch`, que sigue funcionando igual). Es un cambio
mecánico: cada acción retorna `{ homeScore, awayScore, penalties? }` al final de su camino de
éxito. Firmas también actualizadas en `TournamentState` (`src/types/index.ts`).

### 4. `src/hooks/useLiveMatchPlayback.ts` — reloj y revelado (hook)

```ts
export type LivePhase = 'playing' | 'penalties' | 'finished';
export type LiveSpeed = 1 | 2 | 4;

export interface LivePlaybackState {
  phase: LivePhase;
  minute: number;                 // 0..90
  displayHomeScore: number;       // marcador revelado hasta ahora
  displayAwayScore: number;
  revealedGoals: LiveGoalEvent[];
  penalties?: LivePenaltiesResult; // visible solo en phase 'penalties'|'finished'
  speed: LiveSpeed;
  setSpeed: (s: LiveSpeed) => void;
  skipToEnd: () => void;
}

export function useLiveMatchPlayback(
  timeline: LiveTimeline | null,
  initialSpeed?: LiveSpeed,        // default 1
): LivePlaybackState;
```

**Comportamiento:**
- Un `setInterval` a `1000 / speed` ms; cada tick incrementa `minute`. Al alcanzar el minuto
  de un gol, se revela (incrementa `displayHome/AwayScore`, push a `revealedGoals`).
- Al pasar `minute` de 90: si `timeline.penalties` → `phase='penalties'` (breve suspenso,
  escalado por velocidad) y luego se revela el marcador de penales → `phase='finished'`. Si
  no hay penales → `phase='finished'`.
- `setSpeed`: reajusta el intervalo en caliente (sin reiniciar el minuto).
- `skipToEnd`: limpia el intervalo, salta `minute` al final, revela todos los goles y los
  penales, y pone `phase='finished'`.
- Limpieza del intervalo en unmount / al terminar / al cambiar velocidad.
- `timeline === null` (aún simulando) → estado inicial en 0, sin correr.

### 5. `src/components/tournament/LiveMatchModal.tsx` — overlay (montado en `App.tsx`)

Lee `activeMatch` de `useLiveMatchStore`. Ciclo de vida:

1. `activeMatch` pasa a no-null → estado interno `status: 'simulating'`; muestra spinner
   "Simulando…".
2. Llama a la acción `simulate*` correcta según `descriptor.kind` (ver mapeo abajo) y
   espera el `SimulatedMatchOutcome`.
3. `outcome === null` → mensaje breve + cerrar. Si hay outcome → `buildMatchTimeline(
   outcome.homeScore, outcome.awayScore, hashSeed(matchId), outcome.penalties)`,
   `status: 'playing'`, y maneja `useLiveMatchPlayback`.
4. Render: **marcador con escudos/nombres** (usa `TeamFlag`/`ClickableTeamName` como el resto
   de la app), **reloj grande** (`minute`), **feed de goles** (minuto + escudo del equipo que
   marcó), **selector 1x/2x/4x**, botón **Saltar al final**.
5. Al terminar (`phase='finished'`): muestra el marcador final (+ "Penales X-Y" si hubo), y
   un botón **Cerrar** que llama a `closeLiveMatch()`.

**Mapeo `kind` → acción:**

| `kind`           | acción del store                                   |
|------------------|----------------------------------------------------|
| `qualifier`      | `simulateMatch(matchId, groupId!, 'qualifier')`    |
| `world-cup`      | `simulateMatch(matchId, groupId!, 'world-cup')`    |
| `knockout`       | `simulateKnockoutMatch(matchId)`                   |
| `continental`    | `simulateContinentalMatch(matchId)`                |
| `confederations` | `simulateConfederationsMatch(matchId)`             |

### 6. `src/components/tournament/WatchLiveButton.tsx` — botón reutilizable

Recibe los datos del partido (matchId, equipos, kind, groupId?) y, al hacer click, llama a
`openLiveMatch(...)`. Se coloca junto a cada "Simular"/"Play" existente. Se muestra bajo la
**misma condición** que el botón de simular (partido no jugado y jugable).

## Cableado en las vistas (DRY)

`WatchLiveButton` se agrega en cada punto donde hoy se simula un partido individual:

- **`QualifiersView.tsx`** y **`GroupView.tsx`** — `kind: 'qualifier'`, con `groupId`
  (ambas simulan partidos de clasificatorias con `simulateMatch(_, groupId, 'qualifier')`).
- **`WorldCupViewEnhanced.tsx`** (grupos del Mundial, `simulateMatch(_, groupId, 'world-cup')`) —
  `kind: 'world-cup'`, con `groupId`.
- **`KnockoutView.tsx`** — `kind: 'knockout'`.
- **`ContinentalView.tsx`** — `kind: 'continental'`.
- **`ConfederationsCupView.tsx`** — `kind: 'confederations'`.
- **`MatchCenter.tsx`** — en las filas de partidos individualmente jugables, el botón dispara
  `openLiveMatch` con el `kind` correspondiente (reusa el mapeo de etapa del colector). No
  cambia el camino de "Simular Jornada" en lote.

`LiveMatchModal` se monta una sola vez en `App.tsx`.

## UX y casos borde

- **Cambiar velocidad a mitad de partido** reajusta el intervalo en vivo.
- **Saltar al final** descarga todos los eventos y muestra el marcador final (y penales).
- **Penales** (knockouts/continental/confed empatados a los 90'): tras el 90' el overlay
  muestra una fase **"Penales"** con breve suspenso y revela el marcador de penales ya
  comprometido. **Sin kick-by-kick.**
- **Partidos de grupos/clasificatorias** nunca van a penales (los empates son válidos): el
  overlay termina en el 90' con el marcador final.
- **Cerrar durante la reproducción**: el resultado ya está comprometido/persistido; cerrar
  sólo detiene la animación.
- **Estado de carga**: mientras se espera la acción `simulate*` (puede haber ida a Supabase),
  el overlay muestra "Simulando…".

## Testing (Vitest; suite actual 156)

- **`buildMatchTimeline`** (`src/core/__tests__/liveMatch.test.ts`, Node): invariantes con
  `rng` inyectado —
  - `goals.length === homeScore + awayScore`; conteo por `side` coincide con cada marcador;
  - todos los `minute` en `[1, 90]`; `goals` ordenados ascendente;
  - el acumulado del último evento (o los finales) == `(homeScore, awayScore)`;
  - determinismo: misma `(score, seed)` → salida idéntica;
  - `0-0` → `goals: []`; `penalties` se pasa sin tocar.
  - `hashSeed`: determinista y estable para el mismo string.
- **`useLiveMatchPlayback`** (`src/hooks/__tests__/useLiveMatchPlayback.test.ts`, jsdom +
  `renderHook` con **fake timers**): los goles se revelan en el tick correcto; `setSpeed`
  cambia el intervalo; `skipToEnd` descarga todo y pone `phase='finished'`; con penales,
  transiciona `playing`→`penalties`→`finished`.
- **Retorno de `simulate*`** (test de store): devuelven el `SimulatedMatchOutcome` esperado
  (mock del service); `null` cuando el guard rechaza.
- **`LiveMatchModal`** (jsdom, render liviano): muestra el marcador, aparecen los goles, y
  "Saltar al final" lleva al marcador final.

## Estructura de archivos

**Crear:**
- `src/core/liveMatch.ts` (+ `src/core/__tests__/liveMatch.test.ts`)
- `src/store/useLiveMatchStore.ts`
- `src/hooks/useLiveMatchPlayback.ts` (+ `src/hooks/__tests__/useLiveMatchPlayback.test.ts`)
- `src/components/tournament/LiveMatchModal.tsx` (+ test liviano)
- `src/components/tournament/WatchLiveButton.tsx`

**Modificar:**
- `src/store/useTournamentStore.ts` (retorno de las 4 acciones `simulate*`)
- `src/types/index.ts` (firmas en `TournamentState` + `SimulatedMatchOutcome`)
- `src/App.tsx` (montar `LiveMatchModal`)
- `QualifiersView.tsx`, `GroupView.tsx`, `WorldCupViewEnhanced.tsx`, `KnockoutView.tsx`,
  `ContinentalView.tsx`, `ConfederationsCupView.tsx`, `MatchCenter.tsx` (agregar el botón)

## Riesgos

- **Cambio de firma de las acciones `simulate*`:** de `Promise<void>` a
  `Promise<SimulatedMatchOutcome | null>`. Los llamadores existentes ignoran el retorno, así
  que es compatible; hay que actualizar las firmas también en `TournamentState`.
- **Timers en tests:** el hook usa `setInterval`; los tests deben usar fake timers para ser
  deterministas (el repo ya corre jsdom + testing-library desde el Plan 5B).
- **Realismo del reparto de goles:** minutos uniformes en `[1,90]` (sin sesgo de segundo
  tiempo ni descuento). Es una simplificación consciente acorde al nivel elegido; se puede
  refinar después sin tocar la arquitectura.
