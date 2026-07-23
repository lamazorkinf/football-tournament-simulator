# Banderas faltantes: migración a flagcdn

**Fecha:** 2026-07-23
**Estado:** Diseño aprobado

## Problema

Cinco equipos se renderizan como texto (`ENG`, `WAL`, `SCO`, `NIR`, `KOS`) en vez de mostrar
su bandera. Son **dos bugs distintos** con la misma manifestación visual:

1. **Kosovo.** `country-codes.ts` mapea `kos → XK` y la DB guarda
   `https://flagsapi.com/XK/flat/64.png`. FlagsAPI solo acepta códigos ISO 3166-1 alpha-2
   asignados; `XK` es un código de usuario. Responde **HTTP 500**.

2. **Inglaterra, Gales, Escocia e Irlanda del Norte.** Ya hubo un intento de parche:
   `scripts/fix-uk-flags.cjs` y `fix-uk-flags-v2.cjs` reemplazaron esas cuatro filas en la DB
   por URLs de thumbnails de Wikimedia. Hoy ese endpoint
   (`/wikipedia/en/thumb/.../320px-Flag_of_England.svg.png`) responde **HTTP 400**. El SVG
   original sí responde 200, pero el thumbnail no. El parche está muerto.

En ambos casos la imagen falla al cargar, `TeamFlag.tsx:43` cae al fallback de texto y se ve
la abreviatura.

## Evidencia

Se probaron los 211 códigos del mapa contra ambos CDNs (el mapa tiene 211 entradas para 210
equipos: `asa` quedó sin equipo asociado):

| Proveedor          | Cobertura                            |
| ------------------ | ------------------------------------ |
| flagsapi.com (hoy) | **206/211** — fallan los 5 de arriba |
| flagcdn.com        | **211/211**                          |

flagcdn publica dos formatos, y la diferencia importa:

- `{W}x{H}` — ratio 4:3 exacto, pero la bandera viene con **efecto de tela ondeando** y sombra.
- `w{N}` — bandera **plana y rectangular**, el mismo estilo que servía FlagsAPI, en la
  proporción real de cada país (Suiza cuadrada, Nepal más alta que ancha).

Se usa `w{N}`: mantener el estilo plano de la interfaz pesa más que el ratio uniforme. Los
anchos disponibles son 20, 40, 80, 160, 320…; se elige el primero que cubra el doble del tamaño
de render, para no ver la imagen borrosa en pantallas retina.

`TeamFlag` renderiza con `style={{ width: size, height: size * 0.75 }}`, es decir 4:3. Los PNG
cuadrados de FlagsAPI se aplastan contra ese ratio, así que hoy las 206 banderas que
"funcionan" se ven deformadas. Con `objectFit: contain`, cada bandera entra entera y centrada
dentro del recuadro, sin estirarse.

## Decisiones de diseño

**Migrar los 210 equipos a flagcdn**, no solo los 5 rotos. Un único proveedor evita que
convivan dos encuadres distintos en la misma pantalla, y de paso corrige la deformación de los
otros 205.

**La URL se deriva en código, no en la base de datos.** Hoy `TeamFlag.tsx:26` hace
`providedFlagUrl || getFlagUrl(...)`: la URL completa vive en `teams.flag` y *gana* sobre la
generada. Eso es exactamente lo que dejó podrido el parche de Wikimedia — quedó congelado en la
DB y nadie se enteró cuando el endpoint se rompió. Derivando desde `country-codes.ts`, un
arreglo futuro es un deploy en vez de una migración SQL, y cada uso puede pedir el tamaño que
realmente necesita en lugar de bajar siempre el PNG de 64px.

**El input de URL de bandera del `TeamEditor` se elimina.** Con la URL derivada del ID del
equipo, ese campo (`TeamEditor.tsx:271`) quedaría guardando en la DB algo que nunca se muestra.
Se prefiere borrarlo antes que sostener una regla de override que haya que explicar y testear.

## Alcance

### `src/data/country-codes.ts`

`COUNTRY_CODES` pasa a códigos flagcdn en minúscula (`'arg': 'ar'`, `'eng': 'gb-eng'`,
`'kos': 'xk'`, …). Es una conversión mecánica de las 211 entradas; los cinco casos especiales
ya tienen la forma correcta y solo cambian de caja.

```ts
const FLAG_SIZES = { 16: '16x12', 24: '24x18', 32: '32x24', 48: '48x36', 64: '64x48' } as const;

export function getFlagUrl(teamId: string, size: 16|24|32|48|64 = 64): string {
  const code = COUNTRY_CODES[teamId];
  if (!code) { console.warn(`No country code found for team: ${teamId}`); return ''; }
  return `https://flagcdn.com/${FLAG_SIZES[size]}/${code}.png`;
}
```

Se elimina el parámetro `style` (`'flat' | 'shiny'`): flagcdn no tiene equivalente y ningún
call site lo pasa. Se elimina `getCountryCode`, que no tiene consumidores.

### `src/components/ui/TeamFlag.tsx`

Se eliminan las props `flagUrl` y `style`. Queda `const flagUrl = getFlagUrl(teamId, size)`.

El fallback a texto y el reset de `hasError` cuando cambia la URL se mantienen sin cambios:
siguen cubriendo el caso de un `teamId` que no esté en el mapa.

### Call sites

53 usos pasan `flagUrl={team.flag}` a `<TeamFlag>`. Se elimina esa prop en todos. Es un cambio
mecánico sin lógica; `tsc -b` detecta cualquiera que quede.

### `src/components/tournament/TeamEditor.tsx`

Se elimina el input de URL de bandera y la clave `flag` de `editForm`. El editor sigue
manejando skill y región. Si con eso `teamsService.updateTeam` (línea 117) queda sin ningún
llamador que mande `flag`, se elimina también esa rama.

### Datos

- `scripts/generate-flags.ts` se actualiza a la nueva firma de `getFlagUrl` y regenera
  `src/data/teams.json` con las URLs canónicas de flagcdn.
- Migraciones `014_flagcdn_urls.sql` y `015_flagcdn_flat_urls.sql`: `UPDATE` de las 210 filas de
  `teams.flag` a la URL canónica (`https://flagcdn.com/w160/<code>.png`). Aunque el render ya no
  lee esa columna, se normaliza para que el dato deje de estar podrido y una reseed futura quede
  consistente. Son dos migraciones porque la 014 usó el formato ondeado y la 015 lo corrigió al
  plano tras verlo renderizado.
- Se borran `scripts/fix-uk-flags.cjs` y `scripts/fix-uk-flags-v2.cjs`: son scripts one-shot
  cuyo parche es la causa del bug 2, y volver a correrlos reintroduciría el problema.

### Fuera de alcance

`opponent_flag` en `supabase/schema.sql:168` devuelve `teams.flag` desde la función de head to
head. Ningún componente del frontend lo consume (solo aparece en los tipos autogenerados de
`database.ts:501`), así que no se toca. La migración 014 lo deja apuntando a URLs válidas de
todos modos.

## Tests

- `getFlagUrl`: los cinco casos especiales (`eng`, `wal`, `sco`, `nir`, `kos`), un caso normal,
  los cinco tamaños, e ID desconocido → `''`.
- Guardarraíl: todos los IDs de `teams.json` tienen entrada en `COUNTRY_CODES`. Así un equipo
  nuevo sin bandera rompe el CI en lugar de aparecer como texto en la app.

No se agregan tests de red a la suite. La verificación de los 211 códigos contra el CDN se
corrió durante el diseño; repetirla en CI sería lenta y frágil.

## Verificación

1. `npx tsc -b` sin errores.
2. Suite completa en verde (289 tests al momento del diseño).
3. Abrir la app y confirmar visualmente las banderas de Inglaterra, Gales, Escocia, Irlanda del
   Norte y Kosovo, más una pantalla con muchas banderas (tabla de posiciones) para validar el
   nuevo encuadre.

## Riesgo conocido

Las banderas de los otros 205 equipos cambian de aspecto: hoy son PNG cuadrados aplastados a
4:3, pasan a mostrarse enteras y sin deformar dentro del recuadro. Es una mejora, pero es un
cambio visible en toda la aplicación y conviene mirarlo antes de mergear.
