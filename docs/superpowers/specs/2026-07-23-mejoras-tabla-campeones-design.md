# Mejoras de la tabla de campeones (Palmarés + Cronología)

**Fecha:** 2026-07-23
**Estado:** Aprobado (diseño) — pendiente plan de implementación

## Problema

`src/components/tournament/ChampionsHistory.tsx` es una tabla plana de 6 columnas
(Año · Competición · Campeón · Subcampeón · 3° · 4°). En cada visita descarga **todos**
los torneos `completed`, **todos** sus `tournament_cycle_state` y todos los equipos
referenciados, para renderizar un listado cronológico sin filtros ni agregados.

Limitaciones concretas:

1. **No hay palmarés.** No existe ningún "quién ganó más". El conteo de títulos por
   equipo vive escondido en `TeamProfileModal`.
2. **No hay filtros.** Con N años simulados son ~6 filas por año (1 Mundial + 4
   continentales + 1 Confederaciones) en una sola tabla interminable.
3. **Poco contexto por fila.** Solo 4 banderas. No se ve el marcador de la final, si se
   definió por penales, ni hay forma de saltar al bracket de ese año.
4. **No escala.** El JSONB de cada ciclo pesa **~91 KB** (medido). Con 4 torneos
   completados hoy son ~370 KB descargados en cada visita, solo para leer 6 campeones por
   año. Crece lineal con los años — el mismo problema que ya resolvimos en el historial de
   partidos con RPCs server-side.
5. **Móvil.** Tabla de 6 columnas con `overflow-x`; los nombres son códigos (`ARG`) con
   tooltip, que en touch no se dispara.
6. **Errores silenciosos.** El `catch` solo hace `console.error` → se muestra el estado
   "No hay torneos completados" (falso vacío) cuando en realidad falló la carga.

## Decisiones tomadas (brainstorming)

- **Alcance:** los cuatro ejes — palmarés agregado, filtros, más contexto por fila, y
  móvil + rendimiento + errores.
- **Layout:** dos sub-pestañas dentro de la misma vista — **Palmarés** y **Cronología**.
  Son dos modelos mentales distintos ("quién ganó más" vs "qué pasó en tal año"), cada uno
  con sus filtros y su propia consulta.
- **Orden del palmarés:** por **total de títulos**, desempate por subcampeonatos y luego
  terceros puestos. Las columnas MUN/CON/CCF quedan visibles; el usuario ve el desglose y
  saca sus conclusiones (nada de pesos inventados).
- **Interacción en la cronología:** botón `→` por fila que hace `selectTournament(id)` y
  navega al bracket correspondiente. El clic en las banderas sigue abriendo el perfil del
  equipo.
- **Sede/anfitrión:** **descartado** — no existe en el modelo de datos.
- **Fuente de datos:** **RPCs server-side** (migración `016`) que parsean el JSONB en
  Postgres y devuelven filas planas. Deja de bajar 91 KB × N.

## Esquema relevante (actual)

El estado de cada ciclo vive como JSONB en `tournament_cycle_state.state`
(tipo `CycleStatePayload` en `src/core/cycle.ts`). Los campeones y marcadores salen de:

- **Mundial:** `state->'worldCup'->'knockout'->'final'` y `...->'thirdPlace'`.
- **Continental (×4):** `state->'continental'->'brackets'->{Europe|America|Africa|Asia}->'final'`
  y `...->'thirdPlace'`.
- **Confederaciones:** `state->'confederationsCup'->'knockout'->'final'` y `...->'thirdPlace'`.

Estructura de cada objeto `final` / `thirdPlace` (verificada contra la DB):

```json
{
  "winnerId": "sui", "loserId": "bel",
  "homeTeamId": "sui", "awayTeamId": "irq",
  "homeScore": 3, "awayScore": 1,
  "penalties": { "homeScore": 4, "awayScore": 3 },   // ausente si no hubo penales
  "isPlayed": true
}
```

**Asimetría importante:** la `final` del **Mundial** trae `winnerId` pero **no** `loserId`.
El subcampeón se deriva: `homeTeamId`/`awayTeamId` ≠ `winnerId`. Las continentales y la
Confederaciones **sí** traen `loserId`.

`tournaments_new` tiene `champion_team_id`, `runner_up_team_id`, `third_place_team_id`,
`fourth_place_team_id` para el Mundial, pero **no** el marcador de la final ni penales —
por eso es obligatorio parsear el JSONB, no basta con las columnas planas.

## Diseño

### Arquitectura

```
ChampionsHistory (contenedor: tabs + estado de carga/error + navegación)
├── champions_history()  RPC ──► una fila por competición-año  → ChampionsTimeline
└── champions_palmares() RPC ──► una fila por equipo agregada   → ChampionsPalmares

src/services/championsService.ts     ← wrappea ambas RPC, tipa el retorno
src/components/tournament/
├── ChampionsHistory.tsx             ← contenedor + tabs (reescrito)
├── ChampionsPalmares.tsx            ← tabla de ranking
└── ChampionsTimeline.tsx            ← cronología filtrable
```

Dos RPC separadas (no una): el palmarés es un `GROUP BY equipo` y la cronología es
fila-por-competición; agregarlas en SQL es más barato y claro que traer todo y agrupar en
el cliente.

### 1. Base de datos — migración `016_champions_rpcs.sql`

Dos funciones `SECURITY INVOKER`, `STABLE`, que iteran el JSONB de los ciclos de torneos
`completed`. Un CTE común aplana cada competición a una fila; ambas RPC parten de ahí.

**`champions_history()`** — una fila por competición con campeón definido:

| campo | origen |
|---|---|
| `year`, `tournament_id` | `tournaments_new` |
| `kind` | `'world-cup' \| 'continental' \| 'confederations'` |
| `region` | solo continentales (`NULL` en el resto) |
| `champion_id` | `final.winnerId` |
| `runner_up_id` | `final.loserId`; para el Mundial se deriva (`home/awayTeamId ≠ winnerId`) |
| `third_id` | `thirdPlace.winnerId` |
| `fourth_id` | `thirdPlace.loserId` |
| `home_id, away_id, home_score, away_score` | objeto `final` |
| `home_pen, away_pen` | `final.penalties` (`NULL` si no hubo) |
| `champion_name, runner_up_name, third_name, fourth_name, *_region` | `JOIN teams` |

Ordena por `year DESC` y, dentro del año, por un orden fijo de competición
(Mundial → continentales por región → Confederaciones) para no depender del orden del
cliente.

**`champions_palmares()`** — agrega sobre las mismas filas aplanadas, `GROUP BY champion`:

| campo | cálculo |
|---|---|
| `team_id, team_name, region` | `JOIN teams` |
| `titles` | total de competiciones ganadas |
| `runner_ups` | total de subcampeonatos |
| `thirds` | total de terceros puestos |
| `wc_titles, continental_titles, confed_titles` | títulos desglosados por `kind` |

Ordena por `titles DESC, runner_ups DESC, thirds DESC, team_name ASC`.

Ambas filtran `tournaments_new.status = 'completed'`. El `JOIN teams` evita un segundo
viaje al cliente por nombres/regiones. Solo se incluyen competiciones con campeón definido
(final jugada).

### 2. Servicio — `src/services/championsService.ts`

Wrappea ambas RPC vía el helper `db`/`supabase`, tipa el retorno con interfaces explícitas
(`ChampionHistoryRow`, `PalmaresRow`) y normaliza los `null`. Un único punto de acceso a
datos para las dos vistas. Tests Vitest sobre el service con el RPC mockeado (mapeo de
filas, penales presentes/ausentes, subcampeón del Mundial derivado).

### 3. Contenedor — `ChampionsHistory.tsx` (reescrito)

- Estado de sub-pestaña activa (`'palmares' | 'timeline'`), por defecto **Palmarés**.
- Carga ambos datasets vía `championsService` (con guard de desmontaje, como
  `HistoricalStats`).
- **Estados:** loader por pestaña; **error explícito con botón de reintento** (reemplaza el
  `catch` silencioso); vacío real ("No hay torneos completados") solo cuando la carga fue
  exitosa y no hay filas.
- Recibe `onNavigate` por props desde `App.tsx` (igual que las demás vistas).
- Header con resumen: `N títulos · M años · K selecciones`.

### 4. Vista Palmarés — `ChampionsPalmares.tsx`

- Tabla ordenada por total de títulos (desempate 🥈 → 🥉), columnas MUN/CON/CCF visibles.
- Filtro por región (reutiliza `REGION_LABELS`).
- **Fila clickeable** → cambia a la pestaña Cronología con el filtro de equipo aplicado.
- Bandera → perfil del equipo (`useTeamProfile`, ya existe).

```
#  EQUIPO        🏆  🥈  🥉  │ MUN CON CCF
1  🇧🇷 Brasil      4   1   0  │  2   2   0
2  🇦🇷 Argentina   3   2   1  │  1   1   1
```

### 5. Vista Cronología — `ChampionsTimeline.tsx`

- Listado enriquecido: marcador de la final, `(4-2 pen)` cuando `home_pen/away_pen` no son
  `NULL`, 3°/4° como banderas.
- **Botón `→` por fila:** `selectTournament(id)` + `onNavigate` al bracket según `kind`
  (Mundial→`worldcup`, continental→`continental`, Confed→`confederations`). Mismo patrón
  que `TournamentHistory` ya usa hoy — cambia el torneo activo de la sesión.
- **Filtros:** competición (Mundial / continental por región / Confederaciones), equipo,
  rango de años. Aplicados en cliente sobre las filas ya traídas.
- **Móvil:** las filas se apilan como cards con nombres completos (no códigos), sin tabla
  de 6 columnas con scroll horizontal.

### 6. Errores, carga y móvil (transversal)

- Error explícito con reintento en el contenedor.
- Skeleton/loader por pestaña.
- Cards apiladas en móvil; tabla en desktop.

## Fuera de alcance (YAGNI)

- Sede/anfitrión de cada final (no existe en el modelo).
- Modal de detalle de la final con camino del campeón (se evaluó; se optó por navegar al
  bracket existente).
- Puntaje ponderado / medallero jerárquico (se optó por total de títulos transparente).
- Paginación de la cronología: los agregados server-side ya evitan el problema de tráfico;
  el número de filas de campeones (~6/año) no justifica keyset todavía.

## Testing

- **Service (Vitest):** mapeo de filas del RPC, penales presentes/ausentes, derivación del
  subcampeón del Mundial, orden del palmarés y desempates.
- **RPC:** verificación manual vía MCP (`execute_sql`) contra los ciclos reales antes de
  cablear el cliente; comprobar conteos del palmarés contra el listado cronológico.
- La suite completa (`tsc -b` + Vitest) debe quedar en verde.

## Migración

- `016_champions_rpcs.sql` aplicada a producción vía MCP `apply_migration`.
- Registrar en memoria que debe reaplicarse si se recrea la DB (como 014/015).
