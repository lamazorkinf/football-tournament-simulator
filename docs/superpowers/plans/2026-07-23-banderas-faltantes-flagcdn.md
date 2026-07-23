# Banderas faltantes — migración a flagcdn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los 211 equipos muestren su bandera — hoy Inglaterra, Gales, Escocia, Irlanda del Norte y Kosovo se ven como texto (`ENG`, `WAL`, `SCO`, `NIR`, `KOS`).

**Architecture:** Se cambia el proveedor de banderas de flagsapi.com (206/211 de cobertura, PNG cuadrados) a flagcdn.com (211/211, PNG en ratio 4:3 nativo). La URL pasa a derivarse siempre desde `country-codes.ts` en función del `teamId` y del tamaño pedido, en lugar de leerse de la columna `teams.flag` de Supabase — que es donde quedó congelado y podrido el parche anterior.

**Tech Stack:** React 19 + TypeScript + Vite, Vitest para tests, Supabase (Postgres) para datos.

**Spec:** `docs/superpowers/specs/2026-07-23-banderas-faltantes-flagcdn-design.md`

## Global Constraints

- Proveedor de banderas: `flagcdn.com`. Formato exacto de URL: `https://flagcdn.com/{ancho}x{alto}/{codigo}.png`.
- Los códigos de flagcdn van **en minúscula**: `ar`, `gb-eng`, `gb-wls`, `gb-sct`, `gb-nir`, `xk`.
- Tamaños válidos y su equivalente 4:3 (los únicos cinco que usa la app): `16 → 16x12`, `24 → 24x18`, `32 → 32x24`, `48 → 48x36`, `64 → 64x48`.
- Rama de trabajo: `fix/banderas-flagcdn` (ya creada, con el spec commiteado).
- Baseline antes de empezar: `npm test` → 40 archivos, 289 tests en verde. `npx tsc -b` sin errores.
- Los comentarios del código y los mensajes de commit van en español, como el resto del repo.

---

### Task 1: `country-codes.ts` apunta a flagcdn

**Files:**
- Create: `src/data/__tests__/country-codes.test.ts`
- Modify: `src/data/country-codes.ts` (todo el archivo)
- Modify: `src/components/ui/TeamFlag.tsx:26` (solo para que compile; la limpieza real es la Task 2)
- Modify: `scripts/generate-flags.ts:7`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces:
  - `export type FlagSize = 16 | 24 | 32 | 48 | 64`
  - `export function getFlagUrl(teamId: string, size?: FlagSize): string`
  - `export const COUNTRY_CODES: Record<string, string>` (valores en minúscula)
  - **Se elimina** `getCountryCode` (sin consumidores) y el parámetro `style` de `getFlagUrl`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/data/__tests__/country-codes.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { COUNTRY_CODES, getFlagUrl } from '../country-codes';
import teamsData from '../teams.json';

describe('getFlagUrl', () => {
  it('genera la URL de flagcdn en el ratio 4:3 del tamaño pedido', () => {
    expect(getFlagUrl('arg', 16)).toBe('https://flagcdn.com/16x12/ar.png');
    expect(getFlagUrl('arg', 24)).toBe('https://flagcdn.com/24x18/ar.png');
    expect(getFlagUrl('arg', 32)).toBe('https://flagcdn.com/32x24/ar.png');
    expect(getFlagUrl('arg', 48)).toBe('https://flagcdn.com/48x36/ar.png');
    expect(getFlagUrl('arg', 64)).toBe('https://flagcdn.com/64x48/ar.png');
  });

  it('usa 64x48 cuando no se pide un tamaño', () => {
    expect(getFlagUrl('bra')).toBe('https://flagcdn.com/64x48/br.png');
  });

  it('resuelve los cinco códigos que FlagsAPI no servía', () => {
    expect(getFlagUrl('eng')).toBe('https://flagcdn.com/64x48/gb-eng.png');
    expect(getFlagUrl('wal')).toBe('https://flagcdn.com/64x48/gb-wls.png');
    expect(getFlagUrl('sco')).toBe('https://flagcdn.com/64x48/gb-sct.png');
    expect(getFlagUrl('nir')).toBe('https://flagcdn.com/64x48/gb-nir.png');
    expect(getFlagUrl('kos')).toBe('https://flagcdn.com/64x48/xk.png');
  });

  it('devuelve cadena vacía y avisa por consola si el equipo no tiene código', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getFlagUrl('zzz')).toBe('');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('COUNTRY_CODES', () => {
  it('cubre a todos los equipos de teams.json', () => {
    const sinCodigo = (teamsData as { id: string; name: string }[])
      .filter((team) => !COUNTRY_CODES[team.id])
      .map((team) => `${team.id} (${team.name})`);
    expect(sinCodigo).toEqual([]);
  });

  it('usa códigos en minúscula, que es lo que espera flagcdn', () => {
    const conMayusculas = Object.entries(COUNTRY_CODES)
      .filter(([, code]) => code !== code.toLowerCase())
      .map(([id, code]) => `${id}: ${code}`);
    expect(conMayusculas).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/data/__tests__/country-codes.test.ts`
Expected: FAIL. Los casos de URL fallan con `expected 'https://flagsapi.com/AR/flat/64.png' to be 'https://flagcdn.com/64x48/ar.png'`, y el de minúsculas lista las 211 entradas en mayúscula.

- [ ] **Step 3: Pasar los 211 códigos a minúscula**

El mapa entero se transforma mecánicamente: solo cambian los **valores** (las claves ya están en minúscula). Los cinco especiales (`GB-ENG`, `GB-WLS`, `GB-SCT`, `GB-NIR`, `XK`) ya tienen la forma que flagcdn espera, solo cambian de caja.

Run:

```bash
perl -i -pe "s/(:\s*')([A-Z][A-Z0-9-]*)(')/\$1\L\$2\$3/g" src/data/country-codes.ts
```

Verificar que no quedó ningún valor en mayúscula (debe imprimir `0`):

```bash
grep -c ": '[A-Z]" src/data/country-codes.ts
```

Y que los cinco críticos quedaron bien:

```bash
grep -n "'eng'\|'wal'\|'sco'\|'nir'\|'kos'" src/data/country-codes.ts
```

Expected: `'eng': 'gb-eng'`, `'wal': 'gb-wls'`, `'sco': 'gb-sct'`, `'nir': 'gb-nir'`, `'kos': 'xk'`.

- [ ] **Step 4: Reescribir el encabezado y las funciones**

En `src/data/country-codes.ts`, reemplazar las dos primeras líneas de comentario:

```ts
// Mapping of team IDs to flagcdn country codes
// flagcdn URL format: https://flagcdn.com/64x48/ar.png
```

Y reemplazar todo lo que va **después** del cierre del objeto `COUNTRY_CODES` (o sea, desde el comentario JSDoc de `getFlagUrl` hasta el final del archivo) por:

```ts
/**
 * Tamaños de bandera disponibles y su equivalente en flagcdn.
 * Todos respetan el ratio 4:3 con el que TeamFlag dibuja la imagen, así que la
 * bandera llena el recuadro sin deformarse.
 */
const FLAG_SIZES = {
  16: '16x12',
  24: '24x18',
  32: '32x24',
  48: '48x36',
  64: '64x48',
} as const;

export type FlagSize = keyof typeof FLAG_SIZES;

/**
 * Devuelve la URL de la bandera de un equipo.
 *
 * La URL se deriva siempre del teamId: es la única fuente de verdad. No se lee
 * de la base — guardarla ahí fue lo que dejó podrido el parche anterior de las
 * banderas británicas cuando el proveedor cambió.
 *
 * @param teamId - ID del equipo en nuestro sistema
 * @param size - Alto/ancho pedido, en el ratio 4:3 que usa TeamFlag
 * @returns URL de la imagen, o cadena vacía si el equipo no tiene código
 */
export function getFlagUrl(teamId: string, size: FlagSize = 64): string {
  const code = COUNTRY_CODES[teamId];
  if (!code) {
    console.warn(`No country code found for team: ${teamId}`);
    return '';
  }
  return `https://flagcdn.com/${FLAG_SIZES[size]}/${code}.png`;
}
```

Nótese que `getCountryCode` desaparece: no lo importa nadie (verificable con `grep -rn "getCountryCode" src/ scripts/`).

- [ ] **Step 5: Ajustar los dos llamadores para que compile**

En `src/components/ui/TeamFlag.tsx:26`, sacar el argumento `style` (la limpieza completa del componente es la Task 2):

```tsx
  const flagUrl = providedFlagUrl || getFlagUrl(teamId, size);
```

En `scripts/generate-flags.ts:7`:

```ts
  flag: getFlagUrl(team.id, 64)
```

- [ ] **Step 6: Correr los tests y el compilador**

Run: `npx vitest run src/data/__tests__/country-codes.test.ts && npx tsc -b`
Expected: 6 tests PASS, `tsc` sin salida.

Si `tsc` se queja de `style` sin usar en `TeamFlag`, dejarlo así: la prop se elimina en la Task 2.

- [ ] **Step 7: Commit**

```bash
git add src/data/country-codes.ts src/data/__tests__/country-codes.test.ts src/components/ui/TeamFlag.tsx scripts/generate-flags.ts
git commit -m "fix(banderas): generar las URLs desde flagcdn en vez de flagsapi

FlagsAPI solo sirve códigos ISO 3166-1 alpha-2 asignados, así que devolvía
500 para gb-eng, gb-wls, gb-sct, gb-nir y xk. flagcdn cubre los 211 equipos
y además entrega el PNG en ratio 4:3, el mismo con el que TeamFlag lo dibuja."
```

---

### Task 2: `TeamFlag` deja de leer la bandera de la base

**Files:**
- Modify: `src/components/ui/TeamFlag.tsx` (props e inicialización de `flagUrl`)
- Modify: los 22 archivos que pasan `flagUrl={...}` (53 usos en total)

**Interfaces:**
- Consumes: `getFlagUrl(teamId, size)` y `FlagSize` de la Task 1.
- Produces: `<TeamFlag teamId teamName size? className? onClick? clickable? />` — sin `flagUrl` ni `style`.

- [ ] **Step 1: Reescribir el componente**

Reemplazar el contenido completo de `src/components/ui/TeamFlag.tsx` por:

```tsx
import { useState } from 'react';
import { getFlagUrl, type FlagSize } from '../../data/country-codes';

interface TeamFlagProps {
  teamId: string;
  teamName: string;
  size?: FlagSize;
  className?: string;
  onClick?: () => void; // Optional click handler
  clickable?: boolean; // Whether to show hover effect
}

export function TeamFlag({
  teamId,
  teamName,
  size = 32,
  className = '',
  onClick,
  clickable = false
}: TeamFlagProps) {
  // La URL se deriva del teamId y del tamaño pedido. Antes ganaba la columna
  // teams.flag de la base, y por eso un parche viejo que quedó congelado ahí
  // seguía sirviendo URLs muertas mucho después de que el proveedor cambiara.
  const flagUrl = getFlagUrl(teamId, size);

  // El fallback se maneja con estado de React, no inyectando nodos DOM crudos:
  // el onError anterior hacía document.createElement + insertBefore dentro de un
  // padre gestionado por React, dejando spans huérfanos que se acumulaban al
  // remontar y abrían la vía a "removeChild" en la reconciliación.
  const [hasError, setHasError] = useState(false);

  // Reset del error cuando cambia la URL (equipo distinto en la misma
  // posición), ajustando el estado durante el render — el patrón de React para
  // "derivar estado de props" sin un efecto que dispare renders en cascada.
  const [prevFlagUrl, setPrevFlagUrl] = useState(flagUrl);
  if (flagUrl !== prevFlagUrl) {
    setPrevFlagUrl(flagUrl);
    setHasError(false);
  }

  if (!flagUrl || hasError) {
    // Fallback: show team ID as text if no flag found or it failed to load
    return (
      <span className={`inline-flex items-center justify-center font-bold font-arcade text-[10px] ${className}`}>
        {teamId.toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={flagUrl}
      alt={`${teamName} flag`}
      title={teamName}
      className={`inline-block outline outline-2 outline-white ${className} ${clickable || onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
      style={{ width: size, height: size * 0.75, imageRendering: 'pixelated' }} // Maintain 4:3 aspect ratio
      loading="lazy"
      onClick={onClick}
      onError={() => setHasError(true)}
    />
  );
}
```

El único cambio respecto del original, además de las props, es de dónde sale `flagUrl`. `imageRendering: 'pixelated'` se mantiene: en pantallas retina el navegador escala el PNG a 2x, y ese escalado duro es lo que le da a las banderas el aspecto retro del resto de la interfaz.

- [ ] **Step 2: Verificar que el compilador marca los 53 call sites**

Run: `npx tsc -b 2>&1 | head -20`
Expected: errores `TS2322`/`TS2353` sobre `flagUrl` en los archivos de componentes. Esto confirma que ninguno queda sin migrar.

- [ ] **Step 3: Eliminar la prop de todos los call sites**

Todos los usos tienen la forma simple `flagUrl={algo.flag}` (verificado: ninguno con llaves anidadas). El primer patrón borra los que están en su propia línea, el segundo los que están en la misma línea que otras props:

```bash
grep -rl "flagUrl=" src/ | xargs perl -0pi -e 's/\n\s*flagUrl=\{[^}]*\}//g; s/ flagUrl=\{[^}]*\}//g'
```

- [ ] **Step 4: Verificar que no quedó ninguno**

Run: `grep -rn "flagUrl" src/ ; npx tsc -b`
Expected: el `grep` no imprime nada (sale con código 1) y `tsc` no imprime nada.

- [ ] **Step 5: Correr la suite completa**

Run: `npm test`
Expected: 41 archivos (los 40 de base más el nuevo), 289 + 6 = 295 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src/
git commit -m "fix(banderas): derivar la bandera del teamId en TeamFlag

La prop flagUrl hacía que la columna teams.flag le ganara a la URL generada.
Con la URL derivada, cada uso además pide el tamaño que realmente muestra en
vez de bajar siempre el PNG de 64px."
```

---

### Task 3: Sacar el input de URL de bandera del `TeamEditor`

**Files:**
- Modify: `src/components/tournament/TeamEditor.tsx` (líneas 24-28, 44, 196, 201, 234, 267-278)
- Modify: `src/services/teamsService.ts:117`

**Interfaces:**
- Consumes: el `<TeamFlag>` ya migrado de la Task 2.
- Produces: `editForm` pasa a ser `{ skill: number; region: Region }`. Ningún llamador de `teamsService.updateTeam` manda `flag` (los otros dos llamadores son `useTournamentStore.ts:731`, que reenvía lo que recibe, y `useTournamentStore.ts:1868`, que manda solo `skill`).

- [ ] **Step 1: Sacar `flag` del estado del formulario**

En `src/components/tournament/TeamEditor.tsx`, líneas 24-28:

```tsx
  const [editForm, setEditForm] = useState<{
    skill: number;
    region: Region;
  }>({ skill: 50, region: 'Europe' });
```

Línea 44:

```tsx
    setEditForm({ skill: Math.round(team.skill), region: team.region });
```

- [ ] **Step 2: Sacar `flag` del tipo de props de `TeamRow`**

Líneas 196 y 201:

```tsx
  editForm: { skill: number; region: Region };
```

```tsx
  onFormChange: (form: { skill: number; region: Region }) => void;
```

- [ ] **Step 3: Eliminar el campo del formulario**

Borrar el bloque completo de las líneas 267-278 (el `<div>` con el label `Flag URL` y su `<input type="url">`).

En la línea 234, el grid queda con dos columnas en vez de tres:

```tsx
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
```

- [ ] **Step 4: Eliminar la rama huérfana del servicio**

En `src/services/teamsService.ts`, borrar la línea 117:

```ts
    if (updates.flag !== undefined) dbUpdates.flag = updates.flag;
```

Ya no queda ningún llamador que mande `flag`; la columna se administra por migración, no por la UI.

- [ ] **Step 5: Verificar**

Run: `npx tsc -b && npm test`
Expected: `tsc` sin salida, 295 tests PASS.

Verificar también que no quedaron referencias sueltas:

Run: `grep -n "flag" src/components/tournament/TeamEditor.tsx`
Expected: solo las dos líneas de `<TeamFlag ...>` (el componente), ninguna de `editForm.flag`.

- [ ] **Step 6: Commit**

```bash
git add src/components/tournament/TeamEditor.tsx src/services/teamsService.ts
git commit -m "refactor(banderas): quitar el input de URL de bandera del editor

Con la URL derivada del teamId, el campo guardaba en la base algo que ya no
se muestra nunca. La bandera de un equipo se cambia en country-codes.ts."
```

---

### Task 4: Normalizar los datos — `teams.json`, migración y scripts muertos

**Files:**
- Modify: `src/data/teams.json` (las 211 entradas, campo `flag`)
- Create: `supabase/migrations/014_flagcdn_urls.sql`
- Delete: `scripts/fix-uk-flags.cjs`, `scripts/fix-uk-flags-v2.cjs`

**Interfaces:**
- Consumes: `getFlagUrl` de la Task 1.
- Produces: nada que consuman tareas posteriores.

Aunque el render ya no lee `teams.flag`, la columna se normaliza para que el dato deje de estar podrido: `teams.json` es el estado inicial del store (`useTournamentStore.ts:210`) y la función SQL de head to head expone `opponent_flag` desde esa columna (`supabase/schema.sql:168`).

- [ ] **Step 1: Regenerar `teams.json`**

Run:

```bash
npx tsx scripts/generate-flags.ts > /tmp/teams.json && mv /tmp/teams.json src/data/teams.json
```

Si `tsx` no está disponible, usar `npx vite-node scripts/generate-flags.ts`.

- [ ] **Step 2: Verificar el resultado**

Run:

```bash
grep -c "flagcdn.com/64x48" src/data/teams.json
grep -c "flagsapi\|wikimedia" src/data/teams.json
```

Expected: `211` y `0`.

- [ ] **Step 3: Generar la migración**

Run:

```bash
node -e "
const teams = require('./src/data/teams.json');
const values = teams.map(t => \`  ('\${t.id}', '\${t.flag}')\`).join(',\n');
const sql = \`-- 014: apuntar las banderas a flagcdn
--
-- FlagsAPI devolvía 500 para gb-eng, gb-wls, gb-sct, gb-nir y xk (solo sirve
-- códigos ISO 3166-1 alpha-2 asignados), y el parche que puso URLs de
-- thumbnails de Wikimedia para las cuatro británicas quedó muerto cuando ese
-- endpoint empezó a devolver 400.
--
-- Desde ahora la app deriva la URL en el cliente a partir del teamId; esta
-- columna se normaliza para que el dato no quede podrido y para que
-- opponent_flag (schema.sql:168) siga devolviendo URLs válidas.

UPDATE teams AS t
SET flag = v.flag
FROM (VALUES
\${values}
) AS v(id, flag)
WHERE t.id = v.id AND t.flag IS DISTINCT FROM v.flag;
\`;
require('fs').writeFileSync('supabase/migrations/014_flagcdn_urls.sql', sql);
console.log('escrito');
"
```

- [ ] **Step 4: Revisar la migración generada**

Run: `head -20 supabase/migrations/014_flagcdn_urls.sql && grep -c "flagcdn" supabase/migrations/014_flagcdn_urls.sql`
Expected: el encabezado con los comentarios, las primeras filas del `VALUES`, y `211` ocurrencias.

- [ ] **Step 5: Aplicar la migración a Supabase**

Aplicar el contenido de `supabase/migrations/014_flagcdn_urls.sql` con la herramienta `mcp__supabase__apply_migration`, con `name: "014_flagcdn_urls"`.

Verificar después con `mcp__supabase__execute_sql`:

```sql
select count(*) filter (where flag like 'https://flagcdn.com/%') as flagcdn,
       count(*) filter (where flag not like 'https://flagcdn.com/%') as otras
from teams;
```

Expected: `flagcdn = 211`, `otras = 0`.

- [ ] **Step 6: Borrar los scripts que causaron el bug**

Run:

```bash
git rm scripts/fix-uk-flags.cjs scripts/fix-uk-flags-v2.cjs
```

Son scripts one-shot que escribieron las URLs de Wikimedia en la base. Volver a correrlos reintroduciría exactamente el bug que este plan arregla.

- [ ] **Step 7: Verificar**

Run: `npx tsc -b && npm test`
Expected: `tsc` sin salida, 295 tests PASS (incluido el guardarraíl de cobertura de `teams.json`).

- [ ] **Step 8: Commit**

```bash
git add -A src/data/teams.json supabase/migrations/014_flagcdn_urls.sql scripts/
git commit -m "chore(banderas): normalizar teams.flag a flagcdn y borrar los fix-uk-flags

La migración 014 deja las 211 filas apuntando a flagcdn, así opponent_flag
sigue devolviendo URLs vivas. Los scripts fix-uk-flags eran los que habían
metido los thumbnails de Wikimedia que hoy devuelven 400."
```

---

### Task 5: Verificación en la aplicación real

**Files:** ninguno (solo verificación).

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la evidencia de que el bug reportado está resuelto.

- [ ] **Step 1: Verificación estática completa**

Run: `npx tsc -b && npm test && npm run build`
Expected: los tres sin errores.

- [ ] **Step 2: Levantar la app**

Run: `npm run dev`

- [ ] **Step 3: Confirmar los cinco equipos del bug**

Abrir el editor de equipos y buscar `England`, `Wales`, `Scotland`, `Northern Ireland` y `Kosovo`. Cada uno debe mostrar su bandera, no la abreviatura en texto.

Con la consola del navegador abierta, confirmar que no aparece ningún error de carga de imagen ni ningún `No country code found for team:`.

- [ ] **Step 4: Confirmar el cambio de encuadre en el resto**

Abrir una tabla de posiciones (muchas banderas de 24px juntas) y la pantalla de campeón (bandera grande). Las banderas ahora llenan el recuadro sin franjas transparentes arriba y abajo, y sin deformarse. Es el cambio visual esperado en los otros 206 equipos.

- [ ] **Step 5: Commit final si hubo ajustes**

Si el paso 3 o 4 requirió algún retoque:

```bash
git add -A
git commit -m "fix(banderas): ajustes tras la verificación en la app"
```

Si no hubo cambios, no hay nada que commitear.

---

## Cierre

Al terminar las cinco tareas, usar la skill `superpowers:finishing-a-development-branch` para decidir cómo integrar `fix/banderas-flagcdn` a `master`.
