import type { MatchHistoryStage } from '../core/formats/rounds';
import type { View } from '../types/view';

/**
 * DESCRIPTOR DE MODO — la descripción declarativa de un modo de juego.
 *
 * El objetivo de la unificación: dar de alta un modo tiene que ser
 * configuración + siembra de equipos, no código nuevo. Este archivo es el
 * vocabulario de esa configuración, y se guarda tal cual en `modes.config`
 * (columna JSONB que ya existe desde la migración 018; hoy sólo se leía
 * `config.theme`). Sin columna nueva y sin migración.
 *
 * Todo modo se describe con los TRES formatos canónicos y nada más:
 *   1. `liga`                → todos contra todos, 1 o 2 ruedas
 *   2. `grupos-eliminacion`  → fase de grupos y, opcionalmente, su cuadro
 *   3. `eliminacion`         → cuadro a partido único o a ida y vuelta
 */

export type CompetitionFormat = 'liga' | 'grupos-eliminacion' | 'eliminacion';

/** De dónde salen los participantes de una competición. */
export type EntrantsSource =
  /** Los equipos de una división del modo. */
  | { from: 'division'; division: string }
  /** Todos los equipos del pool del modo. */
  | { from: 'all-teams' }
  /**
   * Dos divisiones cruzadas (la copa villamariense: cada cruce enfrenta a un
   * equipo de A contra uno de B). Con `usePreviousYear` usa la composición del
   * año anterior, así los ascensos y descensos no alteran el sorteo.
   */
  | { from: 'cross-divisions'; divisions: [string, string]; usePreviousYear?: boolean }
  /** Los que salieron de otra competición del mismo modo. */
  | {
      from: 'competition';
      competitionId: string;
      take: 'qualified' | 'champion-runner-up';
    };

/** Cómo se siembra un cuadro de eliminación. */
export type BracketSeed =
  /** Por rating: el mejor contra el peor. */
  | 'by-skill'
  /** Sorteo puro. */
  | 'random'
  /** Cada cruce enfrenta equipos de divisiones distintas. */
  | 'cross-division'
  /** Por posición en la fase de grupos previa. */
  | 'group-standings';

/** Un cuadro de eliminación: el formato 3, y también la segunda mitad del 2. */
export interface EliminacionSpec {
  /** 1 = partido único; 2 = ida y vuelta (global sin gol de visitante). */
  legs: 1 | 2;
  /** Cancha neutral: sin ventaja de local. */
  neutral: boolean;
  thirdPlace: boolean;
  seed: BracketSeed;
  /**
   * `standard` = adyacencia (el ganador del cruce i se cruza con el del i+1).
   * `fifa-32` = los cruces del Mundial, donde dos equipos del mismo grupo no se
   * pueden reencontrar antes de la final.
   */
  plan: 'standard' | 'fifa-32';
  /**
   * Cómo entran los byes cuando hay menos equipos que slots. `reseed` recoloca
   * byes y ganadores por orden de siembra (lo que hace el continental);
   * `adjacent` es la convención estándar.
   */
  byeJoin: 'adjacent' | 'reseed';
}

/** Clave de icono para la navegación. El mapeo a componentes vive en la UI. */
export type IconKey =
  | 'trophy'
  | 'shield'
  | 'globe'
  | 'route'
  | 'calendar'
  | 'flow'
  | 'crest'
  | 'medal'
  | 'chart'
  | 'compare'
  | 'star'
  | 'history'
  | 'archive'
  | 'settings'
  | 'home';

interface CompetitionBase {
  id: string;
  name: string;
  /** Orden de aparición en la navegación y de resolución de dependencias. */
  order: number;
  entrants: EntrantsSource;
  /** Se estampa en cada partido: define el peso Elo y viaja a match_history. */
  stage: MatchHistoryStage;
  /** Rótulo corto para la barra de pestañas mobile (presupuesto: 6 caracteres). */
  shortLabel?: string;
  icon?: IconKey;
  /**
   * Va en la barra de pestañas de abajo en mobile, que tiene 4 lugares. Sin
   * esto la barra se llena con las vistas de datos del modo.
   */
  primary?: boolean;
}

export type Competition =
  | (CompetitionBase & {
      format: 'liga';
      /** 1 rueda o 2 (ida y vuelta). */
      legs: 1 | 2;
      /** Cuántos puestos se resaltan arriba/abajo de la tabla. */
      highlightTop?: number;
      highlightBottom?: number;
    })
  | (CompetitionBase & {
      format: 'grupos-eliminacion';
      groups: {
        count: number;
        size: number;
        legs: 1 | 2;
        /**
         * Plantilla de fixtures. Si está, MANDA — incluida la numeración de
         * fechas: `fifa-5` reparte un partido por fecha en 20 fechas y `fifa-4`
         * da 6 partidos en 3. Ausente ⇒ round-robin del método del círculo.
         */
        fixtureTemplate?: 'fifa-4' | 'fifa-5';
      };
      draw: { pots: boolean; snake?: boolean; avoidSameRegion?: boolean };
      qualify: { perGroup: number; bestRunnersUp: number };
      /**
       * El cuadro que sigue a los grupos. `null` cuando la fase de grupos sólo
       * clasifica hacia OTRA competición (las clasificatorias del ciclo, que
       * alimentan el Mundial).
       */
      knockout: EliminacionSpec | null;
    })
  | (CompetitionBase & EliminacionSpec & { format: 'eliminacion' });

/**
 * Qué motor corre el modo.
 * - `season`: una temporada por año (ligas + copas), un documento JSONB por torneo.
 * - `national-cycle`: la máquina de 4 años del ciclo mundialista, con su esquema
 *   normalizado y su calendario por fases.
 *
 * Los stores y componentes ramifican por ESTO, nunca por `mode.kind`: un modo de
 * temporada tiene que poder contener una competición `grupos-eliminacion` (un
 * mundial de clubes), que es inexpresable si la rama es por kind.
 */
export type ModeEngine = 'season' | 'national-cycle';

export interface ModeDescriptor {
  /** De la primera división a la última. `[]` = el modo no tiene divisiones. */
  divisions: string[];
  /** Ascensos/descensos entre divisiones CONSECUTIVAS. `null` = no hay. */
  promotion: { count: number } | null;
  competitions: Competition[];
  /** Clave de paleta (`:root[data-theme='...']` en src/index.css). */
  theme: string;
  /** Pestañas propias del modo que no son competiciones. */
  extraTabs: Array<'season' | 'crests'>;
  dataTabs: View[];
  archiveTabs: View[];
  engine: ModeEngine;
}

/**
 * ¿ESTE modo puede cerrar su temporada? Es la mitad declarativa del guard de
 * `closeSeason`: cerrar aplica la escalera de ascensos y descensos, así que el
 * modo tiene que declararla (`promotion`), tener al menos dos divisiones entre
 * las que mover equipos, y correr una liga por división — la tabla de la que
 * salen los que suben y los que bajan.
 *
 * La otra mitad —que esas ligas ya estén terminadas— es estado y no
 * configuración, así que la sigue mirando el store.
 *
 * Vive acá, con el descriptor, porque son tres los que la preguntan: el store
 * (que lo prohíbe), `deriveNextAction` (que si no ofrece "CERRAR TEMPORADA" a
 * un modo donde jamás va a funcionar) y `deriveHubHeader` (que lo explica). Un
 * "Mundial de Clubes" —sin divisiones y sin ascensos— es exactamente el modo
 * que quedaba con ese botón muerto.
 *
 * Va como type predicate y no como `boolean` para que el store no tenga que
 * repetir el chequeo de `promotion` sólo para convencer a TypeScript.
 */
export function canCloseSeason(
  descriptor: ModeDescriptor,
): descriptor is ModeDescriptor & { promotion: { count: number } } {
  if (!descriptor.promotion || descriptor.divisions.length < 2) return false;
  return descriptor.divisions.every((division) =>
    descriptor.competitions.some(
      (c) =>
        c.format === 'liga' &&
        c.entrants.from === 'division' &&
        c.entrants.division === division,
    ),
  );
}
