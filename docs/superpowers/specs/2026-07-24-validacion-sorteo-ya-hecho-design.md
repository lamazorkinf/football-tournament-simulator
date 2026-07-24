# Validación de sorteo ya hecho

**Fecha:** 2026-07-24
**Estado:** Diseño aprobado, pendiente de implementación

## Problema

Ninguna de las acciones de sorteo verifica si su producto ya existe. Si una se
dispara dos veces —por un doble clic, por un estado desincronizado de la base o
por un guardado que se cortó a mitad— el segundo sorteo se ejecuta y escribe
encima del primero sin borrarlo.

La consecuencia más grave está en las clasificatorias. `generateGroupMatches`
(`src/utils/drawSystem.ts:120`) crea cada partido con un `nanoid()` nuevo, así
que el `upsert` por `id` de `createQualifierMatch` nunca puede pisar a los
partidos del sorteo anterior: solo agrega. Un segundo sorteo deja **1680
partidos en vez de 840**, y las tablas de posiciones y el progreso quedan
calculados sobre datos duplicados.

Hoy la única barrera es visual: `TournamentWizard` esconde el botón "EMPEZAR"
cuando ya hay fixtures. Depende del estado en memoria, que es exactamente lo que
queda desincronizado cuando la creación del torneo falla a mitad de camino.

### Estado actual de cada acción

| Acción | Chequeo de "ya sorteado" | Borra antes de escribir |
|---|---|---|
| `generateDrawAndFixtures` | solo `hasAnyMatchPlayed` | no |
| `advanceToWorldCup` | ninguno | no |
| `advanceToKnockout` | ninguno (solo la UI) | no |
| `drawContinental` | ninguno (solo la UI) | n/a (JSONB) |
| `drawConfederations` | solo "continental completa" | n/a (JSONB) |
| `regenerateWorldCupDrawAndFixtures` | confirmación en la UI | sí |

Continental y confederaciones persisten en `cycle_state` como JSONB: un
re-sorteo pisa el anterior en vez de duplicarlo, pero igual destruye trabajo sin
avisar.

### Verificación de los datos actuales (2026-07-24)

Consulta directa a producción: los cinco Mundiales (2026, 2030, 2034, 2038,
2042) tienen exactamente 42 grupos, 210 equipos y 840 partidos cada uno, con 5
equipos y 20 partidos por grupo. Sin equipos repetidos dentro de una región, sin
grupos huérfanos y sin partidos `qualifier` sin grupo. **No hay daño que
reparar**; este trabajo es preventivo.

## Diseño

### 1. Guard de "ya sorteado" en el store

La regla se mueve de la UI al store, que es donde se escribe. Cada acción
verifica si su producto ya existe y, si existe, muestra un toast explicando por
qué no procede y retorna sin tocar nada.

| Acción | Condición que bloquea |
|---|---|
| `generateDrawAndFixtures` | `isQualifiersDrawn(cycle)` |
| `advanceToWorldCup` | `worldCup.groups.length > 0` |
| `advanceToKnockout` | `knockout.roundOf32.length > 0` |
| `drawContinental` | `isContinentalDrawn(cycle)` |
| `drawConfederations` | `isConfederationsDrawn(cycle)` |

`isContinentalDrawn` e `isConfederationsDrawn` ya existen en
`src/utils/cycleProgress.ts:32-38`. Se suma junto a ellos `isQualifiersDrawn`,
que es verdadero cuando algún grupo de cualquier región ya tiene partidos.

El candado de re-entrada (sección 3) es global: mientras un sorteo corre, se
rechaza cualquier otro, aunque sea de otra fase.

El bloqueo por `hasAnyMatchPlayed` sigue vigente y tiene prioridad: si ya se
jugó un partido, no hay forma de rehacer el sorteo.

### 2. Escritura idempotente

Segunda capa de defensa, para que ni un bug futuro ni dos ejecuciones en
paralelo puedan duplicar filas. Antes de escribir un sorteo se borra el
anterior del mismo torneo:

- Clasificatorias: `normalizedQualifiersService.deleteQualifierData(id)`, que ya
  existe. La FK `matches_new.qualifier_group_id` es `ON DELETE CASCADE`, así que
  borrar los grupos arrastra planteles y partidos.
- Mundial: `normalizedWorldCupService.deleteWorldCupData(id)`, ya existe.
- Dieciseisavos: `normalizedWorldCupService.deleteKnockoutData(id)`, ya existe.
- Continental y confederaciones: no aplica, el JSONB se pisa solo.

### 3. Candado de re-entrada

Un flag `isDrawing` en el store, siguiendo el patrón del `isSavingMatch` que ya
existe. Mientras un sorteo corre, cualquier otro se rechaza. Sin esto, un doble
clic duplica de forma garantizada: la acción es `async` y tarda varios segundos
entre el chequeo y la escritura.

### 4. Rehacer explícito

`generateDrawAndFixtures` acepta `{ force?: boolean }`:

- sin `force`: bloquea si ya está sorteado;
- con `force`: borra el sorteo anterior y regenera.

Un solo camino de código en vez de duplicar las ~150 líneas del sorteo. La UI
expone `force` desde un botón aparte con confirmación, igual que la
regeneración del Mundial.

### 5. Detección de sorteo parcial

Helper puro en `src/utils/cycleProgress.ts`:

```ts
type QualifiersDrawStatus =
  | { state: 'not-drawn' }
  | { state: 'partial'; groupsMissing: number; totalGroups: number }
  | { state: 'drawn' }
```

Un grupo está sano si tiene equipos **y** partidos. El estado es `partial`
cuando al menos un grupo ya tiene partidos y otro no, o cuando una región entera
se quedó sin grupos mientras las demás sí tienen sorteo. Ese es el residuo que
deja un guardado cortado a mitad: las cuatro regiones se guardan en paralelo
(`useTournamentStore.ts:1890`), así que un fallo de red deja unas escritas y
otras no.

**Limitación conocida:** mientras no se recargue, el estado en memoria tiene el
sorteo completo aunque la base haya quedado a medias. Es deliberado — el sorteo
se aplica localmente antes de persistir para no perderlo si la base falla
(`useTournamentStore.ts:1860-1867`) — y en ese momento el usuario ya ve el toast
"el sorteo se generó pero no se pudo guardar". La detección de parcial entra al
recargar, cuando la base vuelve a ser la fuente de verdad.

### 6. UI

En el StepCard de Clasificatorias (`TournamentWizard.tsx:334`):

- **Sorteo hecho, sin jugar:** el botón principal sigue siendo "Ver / Jugar" y
  al lado aparece un "Rehacer sorteo" secundario que abre un `ConfirmDialog`
  advirtiendo que se borra el sorteo actual.
- **Sorteo parcial:** un aviso en la tarjeta ("Sorteo incompleto: faltan
  partidos en N de M grupos") y el botón de rehacer pasa a ser la acción
  destacada.
- **Con partidos jugados:** no se ofrece rehacer.

La condición "ya hay fixtures" está escrita hoy dos veces con formas distintas
(`TournamentWizard.tsx:107` para el botón móvil, `:364` para el de escritorio).
Ambas pasan a usar el helper único: esa divergencia es la clase de bug que
estamos cerrando.

### 7. Tests

Con Vitest, siguiendo los patrones existentes (`useTournamentStore.roundBatch.test.ts`
arma ciclos mínimos, `cycleProgress.test.ts` cubre helpers puros):

- Helper: los cuatro estados, incluyendo región sin grupos y grupo sin partidos.
- Guards: un segundo `generateDrawAndFixtures` sin `force` no modifica el estado
  ni llama a la persistencia; los otros cuatro guards rechazan la segunda
  invocación.
- Idempotencia: con `force`, el borrado ocurre antes de la escritura.
- Re-entrada: dos llamadas concurrentes producen un solo sorteo.
- Regresión del bug original: dos sorteos seguidos dejan 840 partidos, no 1680.

## Fuera de alcance

- **Ids determinísticos para los partidos.** Sería una alternativa al borrado,
  pero cambiaría datos ya guardados en los cinco Mundiales existentes sin
  necesidad.
- **Migración de base de datos.** El esquema ya tiene los `CASCADE` necesarios y
  los datos actuales están limpios.
- **Reparación automática de sorteos parciales.** La app avisa; rehacer es una
  decisión del usuario.
