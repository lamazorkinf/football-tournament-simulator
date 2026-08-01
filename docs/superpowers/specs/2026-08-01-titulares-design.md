# Titulares desde el motor

Fecha: 2026-08-01
Estado: diseño aprobado, pendiente de plan de implementación
Base: `10082c0` (merge de la etapa 1)

Etapa 2 de las tres que salieron de la revisión "que la app se sienta un juego"
(ver `2026-07-31-proxima-accion-y-hub-design.md`). La etapa 1 dejó el hueco; esta
lo llena.

## Problema

`App.tsx:267` le pasa `lastResult={null}` al Hub, con un comentario que explica
por qué: `useMatchResultsStore` no es un historial sino el búfer del modal —
`showResults` setea la lista y abre el modal, `close()` vacía las dos cosas— así
que ese bloque sólo tenía datos mientras un overlay a pantalla completa lo
tapaba.

El diagnóstico de fondo es el hueco 1 de la revisión: **la simulación no tiene
consecuencia narrada**. Se juegan 84 partidos y sale un toast. El motor ya sabe
qué fue interesante —`skillChange = K · (resultado − esperado)` es literalmente
la sorpresa medida— pero nada se convierte en titular.

## Objetivo

El Hub abre con una portada: hasta tres titulares rankeados por notabilidad,
derivados de lo que ya está guardado. Funciona hacia atrás sobre los datos
existentes y para todos los modos, presentes y futuros.

## No objetivos

- **No se toca el motor de simulación ni la persistencia. Cero migraciones.**
- No entra el resumen de fecha sobre `MatchResultsModal`: es la etapa 3.
- No entra el titular de campeón ni ningún cierre de fase: no sale de
  `match_history` y obliga a una segunda fuente de datos. Queda como candidato
  de la etapa 3.
- No se tocan `nav.ts`, `nextAction.ts` ni `hubHeader.ts`.
- No se arreglan acá los bugs sueltos de la revisión.

## Qué hay disponible

`match_history` guarda, para **todos** los modos y desde la migración 021 con
`mode_id`:

| Columna | Uso |
|---|---|
| `home_skill_before`, `away_skill_before` | la brecha entre los dos equipos |
| `home_skill_change`, `away_skill_change` | (no se usan: ver abajo) |
| `home_score`, `away_score` | goleada, empate |
| `stage` | peso de la etapa |
| `went_to_extra_time` | definición en alargue |
| `metadata.penalties` | definición por penales, cuando el productor la estampa |
| `played_at`, `id` | orden (índice `idx_match_history_mode_keyset`) |

**Por qué la brecha y no `skill_change`:** son equivalentes —el delta es
`K · importancia · (resultado − esperado)` y el esperado sale de la brecha— pero
`K` e `importancia` no están guardados en la fila. Reconstruir la sorpresa desde
`skill_before` no depende de la configuración vigente del motor, así que un
cambio de calibración no reescribe el pasado.

**Penales:** sólo `useTournamentStore` los estampa en `metadata`
(`useTournamentStore.ts:2540`); el modo de temporada persiste `wentToExtraTime`
pero no la tanda. `HeadlineMatch.penalties` es opcional y su ausencia degrada el
titular a `ALARGUE`, que sigue siendo cierto.

## Diseño

### 1. `src/core/headlines.ts` — el módulo puro

Cuarta derivación pura del proyecto, con la misma forma que `nav.ts`,
`nextAction.ts` y `hubHeader.ts`: sin React, sin stores, sin Supabase, testeable
con objetos literales.

```ts
import type { MatchHistoryStage } from './formats/rounds';

export type HeadlineKind = 'upset' | 'rout' | 'decider' | 'hold' | 'streak';

/** Forma neutra: se construye desde `MatchHistoryEntry` o desde una simulación recién corrida. */
export interface HeadlineMatch {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  homeSkillBefore: number;
  awaySkillBefore: number;
  stage: MatchHistoryStage;
  wentToExtraTime?: boolean;
  penalties?: { homeScore: number; awayScore: number };
}

export interface Headline {
  kind: HeadlineKind;
  /**
   * Etiqueta corta, para `font-arcade`. SIN acentos: Press Start 2P no tiene
   * glifos para las mayúsculas acentuadas y se rinden como cuadrados.
   */
  label: string;
  /** Renglón explicativo, tipografía normal — acá los acentos van sí o sí. */
  detail: string;
  /** El partido que ilustra el titular. */
  match: HeadlineMatch;
  /** De quién habla el titular, cuando aplica: el ganador, el que aguantó, el de la racha. */
  subjectTeamId?: string;
  /** Puntaje final, ya con peso de etapa y decaimiento. Expuesto para poder testear el orden. */
  score: number;
}

/**
 * @param matches Ordenados del más nuevo al más viejo — el orden que devuelve
 *   `getMatchesPage`. El índice de cada partido ES su antigüedad.
 */
export function deriveHeadlines(matches: HeadlineMatch[], limit?: number): Headline[];
```

#### Los cinco tipos

`gap = |homeSkillBefore − awaySkillBefore|`, sobre la escala de skill 30–100
(`useConfigStore`: `skillMin: 30`, `skillMax: 100`), así que la brecha máxima
posible es 70. Cada tipo produce una **notabilidad base en 0..1**:

Donde `diff = abs(homeScore − awayScore)`:

| Tipo | Condición | Base | Etiqueta | `subjectTeamId` |
|---|---|---|---|---|
| `upset` | hay ganador **y** ganó el de menor `skillBefore` **y** `gap ≥ 6` | `min(gap / 40, 1)` | `BATACAZO` | el ganador |
| `rout` | `diff ≥ 4` | `min((diff − 3) / 4, 1)` | `GOLEADA` | el ganador |
| `decider` | `penalties` presente **o** `wentToExtraTime` | `0.7` con penales, `0.5` sin | `PENALES` con penales, `ALARGUE` sin | ninguno |
| `hold` | empate **y** `gap ≥ 12` | `min(gap / 40, 1) × 0.8` | `AGUANTE` | el de menor `skillBefore` |
| `streak` | `K ≥ 4` victorias al hilo, acotadas (ver abajo) | `min((K − 3) / 5, 1)` | `RACHA` | el de la racha |

`hold` va deliberadamente por debajo de un `upset` de la misma brecha: empatarle
al grande es menos que ganarle.

**Qué corta una racha:** cualquier partido que no sea victoria — empate o
derrota. Se cuenta hacia atrás desde el partido más reciente del equipo dentro de
la ventana. Un equipo aporta a lo sumo una racha.

`HEADLINE_LABELS` y `HEADLINES_LIMIT = 3` viven en `headlines.ts`, al lado de la
función que los usa. `HEADLINES_WINDOW = 80` y `HEADLINES_DEBOUNCE_MS = 300`
viven en el hook, que es quien consulta.

#### Peso de etapa

Un batacazo en una eliminación directa vale más que en una fecha de liga:

```ts
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
```

`continental` cubre rondas tempranas y tardías con el mismo `stage` en la tabla,
así que se queda neutro: la fila no alcanza para distinguirlas.

#### Decaimiento por antigüedad

```ts
const DECAY = 0.985;
score = base × STAGE_WEIGHT[stage] × DECAY ** index
```

Con la ventana de 80, el partido más viejo conserva ~0.30 de su notabilidad. El
efecto buscado: el batacazo de hoy le gana al batacazo mediano de hace cinco
fechas, pero uno verdaderamente histórico sigue entrando en la portada. Para una
racha, el índice es el del partido más reciente de la racha.

#### Selección

1. Cada partido produce **un solo** titular: el tipo de mayor puntaje.
2. Las rachas son por equipo, no por partido, y se agregan a la misma bolsa. El
   `match` de una racha es el partido más reciente de esa racha: es el que se
   dibuja debajo de la etiqueta.
3. Se descarta todo lo que quede por debajo de `MIN_SCORE = 0.10`.
4. Se ordena por puntaje descendente. Desempate: primero el más reciente (menor
   índice); si empatan, por `homeTeamId` para que el orden sea determinista y
   los tests no dependan del orden de iteración.
5. **Un equipo no aparece dos veces en la portada.** Al recorrer la lista ya
   ordenada, se saltea el titular en el que **cualquiera** de sus dos equipos ya
   figure en uno mejor rankeado. Sin esta regla, un equipo con una buena fecha se
   lleva los tres lugares ("BATACAZO: Ben Hur", "RACHA: Ben Hur, 6 al hilo").
6. Se cortan los primeros `limit` (default `HEADLINES_LIMIT = 3`).

#### Los renglones explicativos

En prosa, con acentos, y sin nombres de equipo: los nombres ya están en la línea
del marcador, justo arriba. `Math.round` sobre la brecha, que es decimal desde la
migración 006.

| Tipo | `detail` |
|---|---|
| `upset` | `le ganó a un rival ${gap} puntos mejor` |
| `rout` | `${diff} goles de diferencia` |
| `decider` | `se definió por penales` / `se resolvió en el alargue` |
| `hold` | `empató contra un rival ${gap} puntos mejor` |
| `streak` | `${K} victorias al hilo` |

### 2. La ventana, y por qué la racha a veces no aparece

Una sola llamada al RPC que ya existe:

```ts
matchHistoryService.getMatchesPage({ modeId, pageSize: HEADLINES_WINDOW })
```

`HEADLINES_WINDOW = 80`. Cero migraciones, y el índice
`idx_match_history_mode_keyset` de la 021 ya cubre exactamente ese acceso
(`mode_id, played_at DESC, id DESC`). El RPC topea en 100, así que 80 está dentro
del límite.

**Por qué la ventana no es "la última fecha":** no hay forma de recortarla así.
El ciclo persiste en batch (`createMatchesBatch`, una sola transacción, todos los
`played_at` idénticos) pero el modo de temporada persiste partido por partido
(`useSeasonModeStore.ts:158`, `Promise.all` de `createMatch`), con `played_at`
distintos por milisegundos. Cualquier agrupamiento por tiempo sería frágil en un
motor o en el otro. La ventana es "los últimos 80 partidos del modo" y el
decaimiento se encarga de que lo viejo pese menos. Por eso el bloque se titula
`TITULARES` y no "última fecha": no promete algo que no puede cumplir.

**La racha, y su regla de honestidad.** Se calcula sobre la misma ventana. Los
partidos de un equipo dentro de la ventana **son** sus últimos partidos, porque
la ventana son los últimos del modo — así que contar hacia atrás desde el más
reciente da la racha real. El problema es el borde: si todos los partidos del
equipo en la ventana son victorias, no sé si la racha es de 5 o de 12.

Regla: **una racha sólo se emite cuando está acotada**, es decir cuando dentro de
la ventana también aparece el partido que la cortó. Si no, no se dice nada. Es
preferible callar a subestimar.

Consecuencia, dicha de frente: en selecciones, donde una fecha de clasificatorias
son ~84 partidos, la ventana de 80 contiene a lo sumo un partido por equipo y la
racha **nunca** se va a disparar. En Villamariense, con fechas de ~10 partidos, la
ventana son unas 8 fechas y funciona bien. Es una degradación silenciosa y
aceptable: los otros cuatro tipos cubren el ciclo de sobra.

### 3. `src/store/useHistoryRevisionStore.ts` — cuándo se refresca

Un contador mínimo:

```ts
interface HistoryRevisionState {
  revision: number;
  bump: () => void;
}
export const useHistoryRevisionStore = create<HistoryRevisionState>(...);
/** Atajo para llamadores que no son componentes. */
export const bumpHistoryRevision = () => useHistoryRevisionStore.getState().bump();
```

`matchHistoryService.createMatch` y `createMatchesBatch` lo incrementan tras un
insert exitoso.

**Por qué en el servicio y no en los stores que persisten:** es el único cuello
de botella por donde pasa el historial de todos los modos. Los seis lugares que
persisten hoy (`useTournamentStore` ×5, `useSeasonModeStore` ×1) son seis
oportunidades de olvidarse, y un modo futuro heredaría el olvido. Ponerlo en el
servicio es la misma regla que gobierna el resto de `src/modes/`: dar de alta un
modo es configuración, no código.

### 4. `src/hooks/useRecentHeadlines.ts`

Consulta, deriva y resuelve nombres. Es el único lugar de esta etapa que toca
stores y servicios.

```ts
export interface HeadlineView extends Headline {
  homeTeamName: string;
  awayTeamName: string;
}
export function useRecentHeadlines(): HeadlineView[];
```

- Lee `useModeStore.activeModeId`, `useTournamentStore.teams` y
  `useHistoryRevisionStore.revision`.
- Efecto con dependencias `[modeId, revision]`, **debounce trailing de 300 ms**
  (`HEADLINES_DEBOUNCE_MS`): una fecha de temporada dispara diez `createMatch` en
  paralelo, o sea diez bumps, y sin debounce serían diez consultas. El `useEffect`
  agenda un `setTimeout` y su cleanup lo cancela, con lo cual sólo corre el
  último — un debounce trailing correcto sin código extra.
- Flag `cancelled` en el cleanup, igual que `ChampionsHistory.tsx:50`, para no
  setear estado después de desmontar.
- **Un fallo de Supabase devuelve lista vacía y loguea por consola.** El bloque es
  decoración: no puede romper el Hub ni bloquear el botón CONTINUAR. No hay
  estado de error en pantalla ni reintento.
- Sin Supabase configurado, `getMatchesPage` ya devuelve vacío: no hay rama
  especial.
- Los nombres salen de `teams`; un id que no esté en el pool cae al propio id,
  que es lo que hace hoy el resto de la app.

**No devuelve `loading`.** Mientras carga no se rinde nada, igual que hoy: el
bloque aparece cuando hay algo que contar. Un esqueleto para un bloque opcional
sería ruido, y el Hub ya tiene su propio `idle` para lo que sí importa.

### 5. `src/components/hub/HeadlinesCard.tsx`

Presentacional puro: recibe `HeadlineView[]` y no importa ningún store.

- Con la lista vacía **no rinde nada** (ni la tarjeta ni el título).
- Título `TITULARES` en `font-arcade`. Elegido sin acentos a propósito: "LO
  ÚLTIMO" necesitaría una Ú mayúscula que la fuente no tiene, y escribirlo sin
  tilde sería una falta de ortografía en pantalla.
- Por titular: la etiqueta con su ícono de `lucide-react` (`Zap` batacazo,
  `Flame` goleada, `Target` definición, `Shield` aguante, `TrendingUp` racha), la
  línea del partido con `TeamFlag` a los dos lados y el marcador al medio, y el
  renglón `detail` debajo.
- Con `penalties`, el marcador agrega `(N-N)` al lado, como ya hace
  `MatchResultsModal`.
- El equipo de `subjectTeamId` va resaltado en la línea del partido.
- A 320 px: el nombre de equipo trunca (`truncate` + `min-w-0`), el marcador es
  `shrink-0`. Es la misma estructura del bloque que reemplaza.

### 6. Cambios en `HubView` y `App.tsx`

`HubView` cambia una prop:

```diff
- lastResult: MatchResult | null;
+ headlines: HeadlineView[];
```

Se borra el bloque `lastResult` entero (`HubView.tsx:78-103`) y sus imports
`TeamFlag` y `MatchResult`, y en su lugar va `<HeadlinesCard headlines={headlines} />`,
en la misma posición: entre la tarjeta de cabecera y el botón CONTINUAR.

En `App.tsx`, `const headlines = useRecentHeadlines();` **antes de los `return`
condicionales**, junto a `useNextAction` y `deriveHubHeader`. La razón está
documentada en ese archivo: si cambia la cantidad de hooks ejecutados entre
renders, React lanza "Rendered more hooks than during the previous render". Se
borra el comentario de siete renglones que explicaba por qué `lastResult` iba en
`null`.

## Errores y bordes

- **Sin modo activo** (`activeModeId === null`): sin consulta, lista vacía.
- **Supabase caído o RPC con error**: `console.error` y lista vacía. El Hub queda
  exactamente como hoy.
- **Modo sin partidos jugados** (recién sembrado): lista vacía, no se rinde nada.
- **Menos de tres titulares por encima del umbral**: se rinden los que haya. Un
  solo titular es una portada válida.
- **Cambio de modo con una consulta en vuelo**: el `cancelled` del cleanup
  descarta la respuesta vieja. Sin eso, entrar a Villamariense y volver rápido a
  selecciones podía dejar titulares del modo equivocado.
- **Equipo con id que no está en `teams`**: se muestra el id. No se filtra el
  titular.

## Testing

- **`src/core/__tests__/headlines.test.ts`** — tests de tabla sobre la función
  pura: una fila por tipo (los cinco), un partido que califica para dos tipos y
  gana el de mayor puntaje, el orden por puntaje, el decaimiento (mismo partido
  en índice 0 y en índice 60 → distinto puntaje, mismo tipo), el umbral mínimo,
  la regla de no repetir equipo, y el corte en `limit`.
- **La racha, con sus dos casos**: una racha acotada se emite con el K correcto;
  una racha que llega al borde de la ventana **no se emite**. El segundo test es
  el que protege la regla de honestidad — sin él, un implementador futuro
  "arregla" el borde emitiendo un K subestimado.
- **`src/components/hub/__tests__/HeadlinesCard.test.tsx`** — RTL con props
  literales: rinde los tres, no rinde nada con lista vacía, muestra los penales,
  resalta al sujeto.
- **`src/hooks/__tests__/useRecentHeadlines.test.tsx`** — servicio mockeado:
  consulta con el `modeId` activo y `pageSize: 80`; un error del servicio deja
  lista vacía sin propagar; un bump de `revision` refetchea; **diez bumps
  seguidos hacen una sola consulta** (fake timers).
- **`src/__tests__/App.headlines.test.tsx` — el test de cableado.** Molde:
  `App.seasonLoad.test.tsx`, que existe justamente porque el Critical de la etapa
  1 pasó con 866 tests en verde. Con el servicio mockeado devolviendo un partido
  notable, el titular tiene que aparecer en el Hub. Es el único test que rompe si
  alguien desconecta la prop en `App.tsx`.
- **Tests existentes que hay que actualizar:** `HubView.test.tsx` usa
  `lastResult` en tres lugares (líneas 38, 130, 146) y pasa a `headlines`;
  `matchHistoryService.test.ts` gana la afirmación de que un insert exitoso
  incrementa la revisión.
- Verificación con `set -o pipefail` y grep del resumen, **nunca `| tail`**: el
  exit code de una tubería es el de `tail` y ya dejó pasar seis pruebas rotas.

## Trabajo futuro

- **Etapa 3 — Resumen de fecha.** `MatchResultsModal` pasa de lista plana a tres
  bloques: titulares (reusando `deriveHeadlines` sobre los resultados en memoria,
  que es para lo que `HeadlineMatch` es una forma neutra y no un alias de
  `MatchHistoryEntry`), movimientos de tabla, y la lista actual colapsada.
- **Titular de campeón**, que quedó afuera por necesitar una segunda fuente.
- **Racha correcta en selecciones**, si alguna vez importa: pide agregación en el
  servidor, o sea una migración.
- Los bugs sueltos de la revisión siguen abiertos, revalidados sobre esta base.
