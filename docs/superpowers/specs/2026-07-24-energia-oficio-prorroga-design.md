# Energía, oficio y prórroga en el motor de simulación

Fecha: 2026-07-24
Estado: diseño aprobado, pendiente de plan de implementación

## Problema

El motor actual (`src/core/engine.ts`) resuelve cada partido con un único modelo:

```
λ_local    = 1,5 + (diferencia de skill) / 50
λ_visitante = 1,5 − (diferencia de skill) / 50
```

Tiene dos consecuencias. La primera es que **un partido no deja rastro en el
siguiente**: no existe estado entre encuentros, así que llegar a una semifinal
tras dos alargues es idéntico a llegar descansado. La segunda es que **el azar no
tiene causas legibles**: cuando un equipo de 60 elimina a uno de 90 no hay nada
que lo explique más allá de la varianza de Poisson.

Además, todo empate en eliminación directa se define directamente por penales,
que son casi un volado: eso resuelve el 23,7% de los partidos de knockout.

## Objetivo

Que las sorpresas tengan una causa visible, sin volverlas raras. En palabras del
autor del pedido:

> en partidos complicados los equipos con más skill tienen más "oficio" pero eso
> también los cansa para el siguiente partido. Eso no significa que en un partido
> de más dificultad gane siempre el que tiene más skill ni tampoco que el
> cansancio determine absolutamente la derrota en el siguiente.

Es decir: **el oficio y el desgaste son la misma moneda**. Un partido exigente lo
gana más seguido el grande, y justamente por eso lo deja peor para el próximo.

## No objetivos

- No se toca la varianza base del modelo de goles (el `1,5` y el `/50`).
- No se modela nada intra-partido: el resultado se sigue calculando entero y
  después se reproduce (*commit-then-replay*), que es de lo que depende el modo
  "Ver en vivo".
- No entran lesiones, suspensiones ni tarjetas. Es un sistema de estado paralelo
  con su propia persistencia y UI; da para una feature propia.
- No entra racha ni momentum: el Elo ya mueve el skill con cada resultado, y
  sumar un bonus por venir ganando sería contar dos veces lo mismo.
- No entra ataque/medio/defensa. Ver "Trabajo futuro".

## Modelo

### Energía

Un número por equipo entre **100 y 60** (piso duro), que se traduce a puntos de
skill efectivo:

```
penalizaciónPorCansancio(e) = (100 − e) × 0,2      // 0 en 100, −8 en el piso
skillEfectivo(skill, e)     = skill − penalizaciónPorCansancio(e)
```

La escala está elegida para que el piso corresponda a los −8 puntos aprobados: un
equipo exhausto de 96,2 rinde como un 88,2.

### Dos dificultades distintas

Son cosas diferentes y se usan para cosas diferentes:

| | Fórmula | Para qué |
|---|---|---|
| Dificultad **del partido** | `normSkill(min(skillLocal, skillVisitante)) × (0,6 + 0,4 × normImp(importancia))` | activa el oficio; una por partido |
| Dificultad **del rival** | `0,6 × normSkill(skillRival) + 0,4 × normImp(importancia)` | define cuánta energía gasta cada uno; una por equipo |

con

```
normSkill(s) = clamp((s − 30) / 70, 0, 1)
normImp(i)   = clamp(i / 1,6, 0, 1)      // i = getStageImportance(etapa, ronda)
```

El divisor 1,6 es la importancia por defecto del knockout del Mundial, la más
alta de la tabla. Como esos pesos son editables desde Ajustes, el `clamp` es
load-bearing: subir un peso por encima de 1,6 satura la dificultad en 1 en vez de
desbordarla.

La dificultad del partido es **multiplicativa a propósito**. Una primera versión
la definía como `0,6 × calidadMedia + 0,4 × importancia`, y con esa fórmula unos
octavos de Mundial daban dificultad alta aunque enfrente estuviera el peor rival
del cuadro: en las simulaciones, Marruecos exhausto en el piso de energía **le
ganaba a Ghana más seguido que en el motor actual** (+1,1 pts), porque el oficio
le compensaba el cansancio. Con la forma multiplicativa —"qué tan bueno es el
rival, escalado por lo que está en juego"— ese caso pasa a −1,8 pts, que es lo
correcto: una final contra un equipo flojo no es un partido difícil.

Que use `min(skillLocal, skillVisitante)` responde a lo mismo: mide qué tan
exigente es el partido **para el favorito**, que es quien tiene oficio que
aplicar.

### Cómo se arma el resultado

1. Cada equipo parte de su skill real menos su penalización por cansancio; el
   local suma su ventaja (sólo en clasificatorias, como hoy).
2. La diferencia entre ambos se amplifica:
   `diferencia × (1 + dificultadDelPartido × 0,15)`.
3. Esa diferencia entra al modelo de goles sin más cambios.
4. **El Elo actualiza los skills con el skill real, nunca con el efectivo.**
   Ganar cansado premia igual.

### Costo de energía

```
costo = (6
         + 4 × dificultadDelRival
         + 2  si el partido fue ajustado
         + 7  si hubo alargue
         + 2  si hubo penales)
        × (1 − 0,25 × normSkill(skillPropio))
```

"Ajustado" significa que la diferencia de goles del **resultado final** fue de 0 o
1, contando el alargue si lo hubo. Un 1-1 que se define por penales es ajustado;
un 3-0 no lo es.

El último factor es la **profundidad de plantel**: un equipo de 100 paga un 25%
menos que uno de 30, porque tiene banco para rotar. Sin él, la fatiga castiga
proporcionalmente más al grande, que es justo el que juega más partidos difíciles.

```
energíaNueva = max(60, energía − costo)
```

### Recuperación y reset

- Cada equipo recupera **+4 por jornada transcurrida desde su último partido**
  en continental, Confederaciones y Mundial; **+8** en clasificatorias, cuyas
  fechas en la ficción están separadas por meses. Quien tuvo fecha libre o bye
  recupera el doble, que es exactamente lo que debe pasar.

  La recuperación se resuelve **de forma perezosa, al simular**, no en un evento
  global de avance de jornada. Motivo verificado en el código: `getNextCalendarState`
  sólo se invoca desde `cycle.ts` para las fases continental y confed — las
  clasificatorias y el Mundial nunca mueven el puntero de jornada, así que un
  enganche en "avanzar jornada" no existiría en 3 de las 5 fases. Cada equipo
  guarda su energía junto con el índice de jornada de su último partido, y al
  entrar a un partido nuevo recupera `(índiceActual − índiceGuardado) × recuperación`.

  El índice de jornada **se deriva de la ronda**, no de `Match.matchday`: los
  partidos de eliminación directa del Mundial no llevan `matchday` (`knockout.ts`
  no lo asigna; sólo continental y confed lo hacen). El mapa es R32→1, octavos→2,
  cuartos→3, semis→4, tercer puesto y final→5, desplazado por las 3 jornadas de
  la fase de grupos cuando el torneo las tiene.
- Al **cambiar de torneo**, todos vuelven a 100. Los torneos son cuatro:
  continental, Confederaciones, clasificatorias y Mundial. **`wc-groups` y
  `wc-knockout` son fases distintas del calendario pero el mismo torneo**, así
  que el Mundial no se reinicia a mitad de camino.

```
energíaNueva = min(100, energía + recuperación)
```

### Prórroga

Se dispara en **todo partido de eliminación directa empatado a los 90'**:
continental (de R64 a la final, incluido el tercer puesto), Confederaciones
(semis, tercer puesto, final) y Mundial (de R32 a la final, incluido el tercer
puesto). Nunca en fases de grupos ni en clasificatorias.

```
λ_alargue = λ_partido × (30 / 90) × 0,85
```

El 0,85 refleja que en el alargue se juega más lento. Si el alargue termina
empatado, se van a los penales que ya existen (`simulatePenalties`, sin cambios).

El marcador oficial pasa a ser el de los 120'. El Elo usa ese resultado; si se
define por penales sigue contando como empate, igual que hoy.

## Calibración

Medida con los skills reales de la tabla `teams` al 2026-07-24 (210 equipos,
media 61,7; Bélgica 96,2 · Marruecos 94,8 · Croacia 94,1 · … · Alemania 77,7),
replicando los formatos de la app: 16 grupos de 4 → R32 → final, 127 partidos por
Mundial.

### Qué hace cada palanca (5.000 Mundiales por configuración)

| Configuración | títulos del top-8 | campeón de fuera del top-16 |
|---|---|---|
| Motor actual | 48,6% | 28,2% |
| Solo prórroga | 50,2% | 27,7% |
| Solo energía, sin plantel | 49,0% | 27,7% |
| Solo energía, con plantel | 50,2% | 26,3% |
| Solo oficio 0,35 | 57,3% | 19,5% |

**La energía por sí sola casi no mueve el reparto de títulos (+0,4 pts).** Cansa
a los grandes tanto como los favorece cuando el rival llega fundido, y se
compensa: es narrativa sin costo de balance, que es exactamente el requisito de
que el cansancio no determine la derrota. El que concentra títulos es el oficio.

### Elección del oficio (20.000 Mundiales, margen ±0,7 pts)

| Configuración | títulos del top-8 | cenicientas | penales en KO |
|---|---|---|---|
| Motor actual | 47,8% | 29,1% | 23,7% |
| Sin oficio | 50,1% | 26,5% | 12,0% |
| **Oficio 0,15 — elegido** | **53,9%** | **22,6%** | **11,8%** |
| Oficio 0,20 | 55,5% | 21,8% | 12,2% |
| Oficio 0,35 | 58,6% | 18,6% | 11,6% |

Se elige **0,15**: sube el dominio del top-8 unos 6 puntos, perceptible a lo
largo de varios ciclos, y un Mundial de cada cinco lo sigue ganando alguien de
fuera del top-16.

### Verificaciones

**Duelos sueltos** (200.000 repeticiones cada uno; remedidos con el oficio en
0,15, el valor efectivamente elegido — la tabla original se había quedado
con las cifras del oficio en 0,35):

| Cruce | actual | nuevo |
|---|---|---|
| Bélgica–Argentina, semi, ambos frescos | 56,0% | 57,0% |
| Bélgica–Argentina, semi, Bélgica viene de 2 alargues | 56,1% | 50,9% |
| Bélgica–Argentina, semi, Argentina la fundida | 55,9% | 63,0% |
| Marruecos en el piso vs Ghana, octavos | 81,0% | 77,5% |

**Desgaste a lo largo del Mundial** (8.000 torneos, energía media de los que
juegan cada ronda): R32 87,2 · octavos 81,4 · cuartos 76,0 · semis 71,2 · final
67,6 (p10 64,0). El campeón disputa la final con 68 de energía promedio y el piso
de 60 casi no se toca: la escala no se satura.

**Continental** (8.000 ediciones, 55 equipos, 9 byes, 6 rondas seguidas): el
campeón termina con 72,2 de media, y el **62% de los campeones había entrado con
bye**. Ahorrarse un partido pesa.

**El cansancio inclina pero no decide** (400.000 cruces entre equipos de skill
±3): con 25+ puntos de ventaja de energía se gana el 57,3%; con 25+ de
desventaja, el 42,7%.

**Prórroga**: 23% de los partidos de eliminación directa van al alargue y los
penales bajan de 23,7% a 11,8%. Son cifras de Mundial real.

## Arquitectura

### Módulo nuevo: `src/core/energy.ts`

Puro, sin dependencias del store: penalización por cansancio, las dos
dificultades, costo de un partido, aplicación de costo y recuperación con sus
límites, y el mapa de fase del calendario a torneo. Todo lo demás lo consume.

### Cambio de firma del motor

`simulateMatch(homeSkill, awaySkill, disableHomeAdvantage, importance)` pasa a
recibir un objeto de contexto:

```ts
simulateMatch({
  home: { skill, energy },
  away: { skill, energy },
  stage, round,
  neutral,
})
```

Son seis llamadas en `useTournamentStore` más los tests existentes. Es refactor
mecánico, y evita llegar a una firma de seis parámetros posicionales que no se
puede leer en el call site.

`simulateMatchWithPenalties` resuelve alargue antes de penales.

### Estado y persistencia

El estado de energía vive **dentro del `Cycle`**: un `Record<teamId, number>` más
el torneo al que corresponde. Como el ciclo se persiste completo como documento
JSONB en `tournament_cycle_state` (ver `serializeCycleState`), **no hace falta
migración**: entra en el snapshot que ya se guarda, con bump documental de
`schema_version`. Un torneo guardado sin la clave se lee como "todos al 100%".

La marca de alargue viaja en `KnockoutMatch.extraTime`, que también va en el
JSONB. **La única migración es la 017**: una columna `went_to_extra_time` en
`match_history`, para que el historial distinga un 2-1 de un 2-1 en el alargue.

`SimulatedMatchOutcome` suma los goles del alargue por separado, porque el modo
en vivo reproduce un resultado ya comprometido y necesita saber cuáles van
después del minuto 90.

### Enganches

No hay hooks en transiciones de calendario. Todo se resuelve en el momento de
simular un partido, a partir de su etapa y su ronda:

- La **etapa** define el torneo (`qualifier` → clasificatorias; `world-cup-group`
  y `world-cup-knockout` → Mundial; `continental`; `confed-group` y
  `confed-knockout` → Confederaciones). Si el torneo cambió respecto al guardado,
  el estado de energía se reinicia entero.
- La **ronda** define el índice de jornada, y con él cuánto recuperó cada equipo
  desde su último partido.

Esto mantiene el módulo puro: no necesita el `Cycle` completo, sólo `(etapa,
ronda, jornada)`.

### Configuración

Toda la calibración va a `EngineConfig` (`useConfigStore`), junto al K-factor y
el resto, y por lo tanto aparece en `EngineSettings` y se persiste con las demás
preferencias en `app_settings`. Si el 0,15 no convence al probarlo en la app, se
mueve con un control y no con un deploy.

### Banco de pruebas

El script que produjo todos los números de este documento se incorpora al repo
como `scripts/simulate-engine.mjs`, con un `npm run simulate`. Recalibrar
cualquier cambio futuro del motor pasa a costar un comando. En la implementación
debe pasar a importar `src/core/engine.ts` en vez de replicarlo.

## UI

La energía aparece en tres lugares, ninguno nuevo. No se agregan pestañas ni
vistas: la energía es contexto de un partido, no una sección.

- **Previa del partido** (`MatchPreview`) — una `PixelBar` por equipo con su
  energía y la dificultad esperada del cruce.
- **Detalle del partido jugado** (`MatchDetailModal`) — con cuánta energía llegó
  cada uno, para poder explicar el resultado después.
- **Tarjeta de la jornada en vivo** — sólo un indicador compacto; el espacio
  compite con el marcador.

En el modo "Ver en vivo" el reloj sigue del 90' al 120' con sus goles en los
minutos que corresponden, y los penales aparecen recién después. Esto toca
`buildMatchTimeline`, el playback y sus tests.

El marcador se muestra siempre como el de los 120', con un chip al lado. El chip
dice **`ALARGUE`** y no `PRÓRROGA`: la Press Start 2P rompe las mayúsculas
acentuadas.

## Testing

- **`energy.ts` puro** — costos, piso y techo, efecto del plantel, recuperación,
  mapa de fase a torneo.
- **Motor** — que un empate en eliminación directa vaya al alargue y sólo después
  a penales; que el skill efectivo y el oficio produzcan los goles esperados. Con
  el generador de aleatorios inyectado, igual que `simulatePenalties` y
  `buildMatchTimeline`.
- **Calendario** — recuperación al avanzar de jornada; reset al cambiar de
  torneo, con el Mundial contando grupos y knockout como uno solo.
- **Timeline en vivo** — goles del alargue ubicados entre el 91 y el 120.
- **Regresión estadística** — unos miles de partidos con semilla fija,
  verificando que los alargues caigan entre 20 y 27% y los penales entre 9 y 15%.
  Caza una constante descalibrada por accidente, y con semilla fija no es
  inestable.

## Riesgos

- **Partidas en curso.** Un torneo guardado antes de esto no tiene energía en su
  JSONB ni `extraTime` en sus partidos. Se leen como 100 y `false`
  respectivamente: la partida sigue, sin fatiga acumulada previa.
- **Las seis llamadas al motor repartidas en un store de 2.700 líneas.** Si cada
  una arma el contexto de energía por su cuenta, se van a desincronizar. Un único
  helper que lo construya, y las seis lo usan.
- **El resultado del alargue tiene que sobrevivir al replay**, de ahí que el
  outcome lleve los goles del alargue por separado.

## Trabajo futuro

Descartado de este spec y ordenado por lo que da sobre lo que cuesta:

- **Ataque / medio / defensa.** El modelo pasaría de diferencia a multiplicativo
  (los goles salen del ataque propio contra la defensa rival, estilo
  Dixon-Coles), y el mediocampo controlaría el ritmo del partido en vez de sumar
  goles. Existirían equipos con estilo, no sólo mejores y peores. Los 630 números
  que hoy no existen los podría separar el propio Elo: arrancan iguales al skill
  actual y cada partido reparte el cambio según lo que pasó. **Invalida la
  calibración de este spec**, que está medida contra el modelo de diferencia, y
  por eso se hace después y con el banco de pruebas ya en el repo.
- **Localía de verdad.** Hoy la ventaja de local es +3 fija. Podría depender de
  dónde se juega (altitud) y de cuánto viajó el visitante. Sólo aplica a
  clasificatorias, que es la única fase con local y visitante.
- **Rivalidades.** Una tabla de pares donde el partido se empareja y el desgaste
  sube. Poca data, mucho sabor, y engancha con la energía.
- **Eje ofensivo/defensivo.** Un solo número por equipo que modula el total de
  goles sin cambiar quién gana: la versión barata de ataque/medio/defensa.
