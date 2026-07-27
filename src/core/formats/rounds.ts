/**
 * Taxonomía de rondas y rótulos, compartida por TODOS los formatos de torneo.
 *
 * Antes había dos uniones de ronda incompatibles (`CupRoundKey` en formats/cup.ts
 * y `KnockoutMatch['round']` en types/index.ts) y tres mapas de rótulos sueltos
 * que no coincidían entre sí. Esto es la única fuente de verdad.
 *
 * Convención de nombres: `round-of-N` = ronda de N EQUIPOS (N/2 cruces). Es la
 * convención que ya usaba el ciclo mundialista y la que respeta el castellano:
 * `round-of-16` son los octavos (16 equipos, 8 cruces).
 */

export type RoundKey =
  | 'round-of-128'
  | 'round-of-64'
  | 'round-of-32'
  | 'round-of-16'
  | 'quarter'
  | 'semi'
  | 'third-place'
  | 'final';

/**
 * Rondas de un cuadro, de la más temprana a la final. El 3er puesto queda
 * afuera: no es una ronda del cuadro sino un partido colgado de las semis.
 */
export const ROUND_ORDER: readonly RoundKey[] = [
  'round-of-128',
  'round-of-64',
  'round-of-32',
  'round-of-16',
  'quarter',
  'semi',
  'final',
] as const;

/** Cuántos equipos entran en cada ronda (el `N` de `round-of-N`). */
const ROUND_SIZE: Record<Exclude<RoundKey, 'third-place'>, number> = {
  'round-of-128': 128,
  'round-of-64': 64,
  'round-of-32': 32,
  'round-of-16': 16,
  quarter: 8,
  semi: 4,
  final: 2,
};

function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0;
}

/**
 * Ronda que corresponde a una cantidad de cruces: 16 cruces → `round-of-32`,
 * 1 cruce → `final`. Lanza si no es una potencia de 2 dentro del rango
 * soportado: un cuadro con 6 cruces no es un cuadro, es un error de config.
 */
export function roundKeyForTieCount(tieCount: number): RoundKey {
  if (!isPowerOfTwo(tieCount)) {
    throw new Error(`roundKeyForTieCount requiere una potencia de 2 ≥ 1, recibió ${tieCount}`);
  }
  const size = tieCount * 2;
  const found = ROUND_ORDER.find((r) => ROUND_SIZE[r as Exclude<RoundKey, 'third-place'>] === size);
  if (!found) {
    throw new Error(`Cuadro de ${tieCount} cruces fuera del rango soportado (máx. 64 cruces)`);
  }
  return found;
}

/**
 * Rondas de un cuadro de `size` slots, en orden. `roundOrderFor(8)` →
 * `['quarter', 'semi', 'final']`. Sin el 3er puesto (ver ROUND_ORDER).
 */
export function roundOrderFor(size: number): RoundKey[] {
  if (!isPowerOfTwo(size) || size < 2) {
    throw new Error(`roundOrderFor requiere una potencia de 2 ≥ 2, recibió ${size}`);
  }
  const first = roundKeyForTieCount(size / 2);
  return ROUND_ORDER.slice(ROUND_ORDER.indexOf(first));
}

/** Ronda siguiente dentro del cuadro; null si `round` ya es la final. */
export function nextRoundKey(round: RoundKey): RoundKey | null {
  const i = ROUND_ORDER.indexOf(round);
  if (i < 0) return null; // 'third-place' no tiene siguiente
  return i < ROUND_ORDER.length - 1 ? ROUND_ORDER[i + 1] : null;
}

/** Rótulo corto, para pestañas y encabezados de llave ("Octavos", "Cuartos"). */
const SHORT_LABEL: Record<RoundKey, string> = {
  'round-of-128': '64avos',
  'round-of-64': '32avos',
  'round-of-32': '16avos',
  'round-of-16': 'Octavos',
  quarter: 'Cuartos',
  semi: 'Semis',
  'third-place': '3º puesto',
  final: 'Final',
};

/** Rótulo largo, para textos corridos ("Cuartos de Final"). */
const LONG_LABEL: Record<RoundKey, string> = {
  'round-of-128': 'Sesentaicuatroavos de Final',
  'round-of-64': 'Treintaidosavos de Final',
  'round-of-32': 'Dieciseisavos de Final',
  'round-of-16': 'Octavos de Final',
  quarter: 'Cuartos de Final',
  semi: 'Semifinales',
  'third-place': 'Tercer Puesto',
  final: 'Final',
};

/** Type guard: ¿este string es una ronda conocida? Útil en bordes sin tipar (DB). */
export function isRoundKey(value: string): value is RoundKey {
  return value in SHORT_LABEL;
}

export function roundLabel(round: RoundKey): string {
  return SHORT_LABEL[round] ?? String(round);
}

export function roundLongLabel(round: RoundKey): string {
  return LONG_LABEL[round] ?? String(round);
}

/**
 * Rótulo de una etapa (el `stage` que se estampa en cada partido y viaja a
 * `match_history`). Cubre las 8 etapas permitidas por la migración 018 más las
 * genéricas de los formatos nuevos. Un `stage` desconocido se devuelve crudo,
 * igual que hacía el mapa que reemplaza.
 */
const STAGE_LABEL: Record<string, string> = {
  qualifier: 'Clasificatorias',
  'world-cup-group': 'Mundial · Grupos',
  'world-cup-knockout': 'Mundial · Playoffs',
  continental: 'Continental',
  'confed-group': 'Confederaciones · Grupos',
  'confed-knockout': 'Confederaciones · Playoffs',
  league: 'Liga',
  cup: 'Copa',
  group: 'Grupos',
  knockout: 'Eliminación',
};

export function stageLabel(stage: string): string {
  return STAGE_LABEL[stage] ?? stage;
}
