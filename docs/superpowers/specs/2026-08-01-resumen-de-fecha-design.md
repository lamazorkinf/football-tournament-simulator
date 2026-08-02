# Resumen de fecha

Fecha: 2026-08-01
Estado: diseño aprobado, pendiente de plan de implementación
Base: `3670d19` (merge de la etapa 2)

Etapa 3 y última de las tres que salieron de la revisión "que la app se sienta un
juego" (ver `2026-07-31-proxima-accion-y-hub-design.md`).

## Problema

Es el hueco 2 del diagnóstico: **falta el punto medio entre no ver nada y la
jornada en vivo.**

`MatchResultsModal` rinde una lista plana de tarjetas iguales, ordenadas sólo por
"favorito primero". En una fecha de Liga Villamariense son 10 tarjetas y se lee;
en una de clasificatorias del Mundial son **84**, y no hay ninguna jerarquía que
diga qué mirar. El pie con partidos, goles y promedio es lo único que resume, y
resume lo que menos importa.

La etapa 2 ya construyó la máquina que sabe qué fue interesante
(`src/core/headlines.ts`). Falta enchufarla acá y agregar la otra pregunta que un
resumen de fecha tiene que contestar: **qué cambió en la tabla.**

## Objetivo

El modal pasa de lista plana a tres bloques: titulares, movimientos de tabla, y
los resultados. Lo más notable arriba, lo exhaustivo abajo y plegable.

## No objetivos

- **Cero migraciones.** No se toca `supabase/migrations/` ni la persistencia.
- No se toca el motor de simulación.
- **No entra el bloque de tabla para fases de grupos.** Una fecha de
  clasificatorias reparte 84 partidos en ~14 grupos: mostrar sus tablas es un
  muro, y elegir cuáles mostrar es diseño aparte. El bloque aparece sólo cuando
  la fecha pertenece a **una sola liga**.
- No se toca el Hub ni `useRecentHeadlines`.
- No se rediseña la tarjeta de resultado individual.

## Lo que ya existe

| Pieza | Estado |
|---|---|
| `src/core/headlines.ts` | `deriveHeadlines(matches, limit?)`, cinco tipos de titular, puro y probado |
| `recalcLeagueStandings(state)` | `src/core/formats/league.ts:138`, pura, devuelve `TeamStanding[]` **ya ordenada** |
| `useMatchResultsStore.showResults(results, title)` | 4 llamadores |
| `LiveMatchdayOverlay` | termina llamando a `showResults(session.allResults, session.title)` |
| `useModeJornada` / `useCycleJornada` | los dos hooks que simulan una fecha, uno por motor |

## Diseño

### 1. La etapa deja de hacer falta, y eso simplifica todo

El primer borrador de este diseño hacía viajar la `MatchHistoryStage` de la
jornada hasta el modal, para que `deriveHeadlines` pudiera aplicar
`STAGE_WEIGHT`. Al ir a buscarla apareció que el ciclo no la tiene a mano: su
`MatchWithContext.stage` es un `MatchStage` (la unión de 5 valores del Centro de
Partidos), no un `MatchHistoryStage` (la de 8 de `match_history`), y traducir
`'confederations'` a `'confed-group'` o `'confed-knockout'` requiere adivinar por
número de jornada.

Pero la traducción no hace falta, porque **dentro de una jornada todos los
partidos comparten etapa**: el peso de etapa es entonces un multiplicador
constante sobre todos los candidatos, incapaz de cambiar el orden. Lo único que
mueve es el valor absoluto contra `MIN_SCORE`, en un ±30%.

Por eso:

- `HeadlineMatch.stage` pasa a ser **opcional**, y `STAGE_WEIGHT` cae a `1`
  cuando no está. Un campo menos que fabricar.
- El resumen de fecha **no transporta ninguna etapa**.

En el Hub nada cambia: ahí los partidos vienen de `match_history`, con su etapa
real, y comparar entre etapas sí importa.

### 2. `deriveHeadlines` gana opciones

```ts
export interface DeriveHeadlinesOptions {
  limit?: number;
  /**
   * Decaimiento por antigüedad. `false` para una jornada: sus partidos son
   * simultáneos, no hay más viejo ni más nuevo, y penalizar por posición en el
   * array sería arbitrario.
   */
  decayByAge?: boolean;
}
export function deriveHeadlines(
  matches: HeadlineMatch[],
  options?: DeriveHeadlinesOptions,
): Headline[];
```

Reemplaza al segundo parámetro `limit?: number`. Hoy **ningún llamador lo pasa**
(`useRecentHeadlines` llama con un solo argumento y los tests también), así que
el cambio no rompe nada más que la firma.

Defaults: `limit = HEADLINES_LIMIT` (3), `decayByAge = true`.

Las rachas se calculan igual que siempre, y en una jornada casi nunca se
disparan: cada equipo juega una vez, así que su racha en esa ventana es de 1.
Degradación silenciosa y correcta, la misma que en selecciones.

### 3. `MatchResult` gana los datos por partido

```ts
export interface MatchResult {
  // …lo de hoy…
  /**
   * Skill de cada lado ANTES de este partido. Es lo que mide la sorpresa. Sólo
   * lo completa quien capturó el pool de equipos antes de simular.
   */
  homeSkillBefore?: number;
  awaySkillBefore?: number;
  /** El partido se resolvió en el alargue. */
  wentToExtraTime?: boolean;
}
```

Opcionales: un `MatchResult` sin ellos simplemente no produce titulares de
brecha, igual que las filas reconstruidas del historial.

**Esto hace que la jornada en vivo funcione gratis.** `LiveMatchdayOverlay`
termina llamando a `showResults(session.allResults, …)`, y `allResults` ya son
`MatchResult[]` armados por el mismo productor: si el productor los completa, el
resumen de la jornada en vivo tiene titulares sin tocar el overlay.

### 4. `src/core/tableMoves.ts` — la quinta derivación pura

```ts
export interface TableMove {
  teamId: string;
  /** Posiciones 1-based. */
  from: number;
  to: number;
}

export interface TableSummary {
  leaderTeamId: string;
  /** El puntero cambió en esta fecha. */
  leaderIsNew: boolean;
  /** Los que más se movieron, de mayor a menor salto. Puede venir vacío. */
  moves: TableMove[];
}

export function deriveTableSummary(
  before: TeamStanding[],
  after: TeamStanding[],
  limit?: number,
): TableSummary | null;
```

Pura, sin React ni stores, hermana de `headlines.ts`. `TeamStanding` ya existe
(`src/types/index.ts:56`).

Reglas:

1. La posición de un equipo es su índice + 1 en el array, que
   `recalcLeagueStandings` ya devuelve ordenado.
2. `after` vacío ⇒ `null`.
3. `moves` son los equipos cuya posición cambió, ordenados por magnitud del salto
   descendente; desempate por posición final ascendente, y después por `teamId`,
   para que el orden sea determinista. Se cortan en `limit` (default 3).
4. **La regla de honestidad, hermana de la de las rachas:** si en `before` todos
   los equipos tienen `played === 0`, no había tabla — ese orden es el de siembra.
   Ahí se anuncia el puntero, pero `leaderIsNew` es `false` y `moves` viene
   **vacío**. Decir "subió del 14º al 3º" contra un orden arbitrario sería
   inventar.
5. Un equipo que está en `after` pero no en `before` no produce movimiento.

**Los nombres no viven acá.** `TableSummary` habla de ids, igual que `Headline`.
Quien lo produce —que tiene el pool de equipos a mano— lo enriquece antes de
entregarlo, con la misma forma que ya usa `HeadlineView`:

```ts
export interface TableSummaryView extends TableSummary {
  leaderTeamName: string;
  moves: Array<TableMove & { teamName: string }>;
}
```

Un id que no esté en el pool cae a sí mismo, que es lo que hace el resto de la
app.

### 5. `showResults` gana un tercer argumento

```ts
showResults(results: MatchResult[], title: string, table?: TableSummaryView): void
```

Aditivo: los llamadores que no lo pasan siguen funcionando. `close()` lo limpia
junto con el resto, como hoy.

`LiveMatchdaySession` gana el mismo campo opcional (`table?: TableSummaryView`) y
el overlay lo reenvía en sus dos llamadas a `showResults`.

### 6. Quién arma cada cosa

**`useModeJornada` (motor `season`)** — es el único que arma bloque de tabla.

- Antes de simular, con el torneo todavía sin tocar: si `run.format === 'liga'`,
  `recalcLeagueStandings(run.state)`. Y siempre, el mapa de skills previos desde
  `teams`.
- Después de `simulateJornada`, vuelve a leer el torneo por id desde
  `useSeasonModeStore.getState().tournaments` —el store lo reemplazó— y recalcula
  la tabla.
- `deriveTableSummary(antes, después)`.

**`useCycleJornada` (motor `national-cycle`)** — sólo el mapa de skills previos.
Sus jornadas son clasificatorias repartidas en muchos grupos o llaves sin tabla:
no hay una liga única que resumir. Ya construye un `skillMap` pre-simulación en
`simulateLive` con ese mismo propósito; la novedad es hacerlo también en
`simulate` y pasarlo a `buildJornadaResults`, que gana un quinto parámetro
`skillBefore: ReadonlyMap<string, number>`.

Los dos caminos de cada hook —simular de una y ver en vivo— completan los mismos
datos: `simulateLive` arma sus `MatchResult` con la misma función que `simulate`
(`toResults` en el modo de temporada, `results` en el ciclo), así que alcanza con
que esa función los complete.

**Por qué el mapa se captura explícitamente y no se lee `teams` después:** al
volver de `await simulateJornada(...)` el store ya aplicó los deltas. La variable
`teams` cerrada por el callback todavía apunta al array viejo, así que "funciona"
por accidente. Se captura antes, explícito, como ya hace `simulateLive`.

### 7. El modal

`MatchResultsModal` pasa a tres bloques. Sigue siendo el mismo componente y el
mismo store; lo que cambia es qué rinde arriba de la lista.

1. **Titulares** — deriva desde `results` con
   `deriveHeadlines(matches, { decayByAge: false })`. Sin titulares, el bloque no
   se rinde. Reusa `HeadlinesCard` de la etapa 2, que ya es presentacional puro y
   ya resuelve el ancho de 320 px con su marcador de dos renglones.
2. **La tabla** — sólo con `table` presente. Rinde el puntero (con "nuevo puntero"
   cuando `leaderIsNew`) y hasta tres movimientos con su flecha, `from` y `to`.
3. **Los resultados** — la lista de hoy, sin cambios en la tarjeta, dentro de un
   plegable cuyo encabezado dice cuántos son (`LOS 84 RESULTADOS`, en la
   tipografía arcade y por lo tanto sin tildes). **Arranca colapsada cuando hay
   más de `RESULTS_COLLAPSE_THRESHOLD = 12` resultados**, y expandida si no: una
   fecha de Villamariense (10) se sigue viendo igual que hoy y una de
   clasificatorias (84) deja de ser un muro. El 12 es el mismo tope que ya usa la
   grilla en vivo.
4. **El pie** de partidos, goles y promedio queda como está.

`HeadlinesCard` necesita nombres de equipo resueltos (`HeadlineView`), y
`MatchResult` ya los trae (`homeTeam` / `awayTeam`): el modal arma los
`HeadlineView` sin tocar ningún store.

**`HeadlineView` se muda a `src/core/headlines.ts`.** Hoy vive en
`src/hooks/useRecentHeadlines.ts` porque era su único consumidor; con el modal
como segundo, un componente tendría que importar un tipo desde un hook de datos
que no usa. Es `Headline` más dos nombres: pertenece al lado del tipo que
extiende. El hook lo importa desde ahí.

## Errores y bordes

- **Resultados sin skills previos** (un productor que no los completó, o un
  torneo viejo): no producen titulares de brecha; el bloque puede quedar vacío y
  entonces no se rinde. Nunca rompe.
- **Fecha sin movimientos en la tabla**: se rinde igual el puntero. `moves`
  vacío no oculta el bloque.
- **Jornada de copa en un modo de temporada**: `run.format !== 'liga'` ⇒ sin
  tabla, sólo titulares y lista.
- **La primera fecha del año**: por la regla 4, puntero sin movimientos.
- **Empate de puntos**: no es problema del resumen — `recalcLeagueStandings` ya
  resuelve el orden con sus desempates, incluido el de enfrentamientos directos.
- **El modal abierto desde la jornada en vivo**: mismo camino, mismos tres
  bloques.

## Testing

- **`src/core/__tests__/tableMoves.test.ts`** — tests de tabla: puntero nuevo,
  puntero que se sostiene, subida, bajada, orden por magnitud, corte en `limit`,
  equipo nuevo en `after`, `after` vacío, y **la regla de la primera fecha**
  (todos con `played === 0` ⇒ puntero sin movimientos). Ese último es el que
  protege la regla de honestidad: sin él, un implementador futuro "arregla" el
  borde reportando saltos contra el orden de siembra.
- **`deriveHeadlines` con `decayByAge: false`** — el mismo titular en el índice 0
  y en el 60 puntúa igual; con la opción por defecto, no.
- **`MatchResultsModal`** — RTL: rinde titulares cuando los resultados traen
  skills; no los rinde cuando no; rinde el bloque de tabla sólo con `table`;
  colapsa la lista por encima del umbral y la expande por debajo; el plegable
  abre al hacer clic.
- **El test de cableado** — que `useModeJornada` le pase efectivamente el resumen
  de tabla al store. Es la lección de las dos etapas anteriores: la derivación y
  el componente tuvieron sus tests en verde mientras el cable estaba cortado.
- Verificación con `set -o pipefail` y grep del resumen, **nunca `| tail`**.

## Trabajo futuro

- Tablas de fase de grupos en el resumen, que quedaron afuera por el problema de
  las ~14 tablas de una sola fecha.
- Los bugs sueltos de la revisión original siguen abiertos.
- Los follow-ups menores de las etapas 1 y 2, anotados en su momento.
