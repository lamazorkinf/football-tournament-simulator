import { getPhaseMatches } from '../core/calendar';
import { getContinentalProgress, getConfederationsProgress } from '../utils/cycleProgress';
import { getQualifierProgress, getWorldCupGroupProgress } from '../utils/tournamentProgress';
import { currentModeJornada } from '../core/formats/modeJornada';
import { canCloseSeason } from './types';
import type { Cycle } from '../types';
import type { ModeDescriptor } from './types';
import type { SeasonModeStatus } from '../store/useSeasonModeStore';
import type { ModeTournament } from '../core/formats/modeTournament';

/**
 * LA CABECERA DEL HUB — la tercera derivación pura del modo activo, hermana de
 * `nav.ts` (qué se navega) y `nextAction.ts` (qué se hace). Contesta la otra
 * pregunta: en qué anda el modo.
 *
 * Sin React y sin stores, por la misma razón que las otras dos: `App.tsx` sólo
 * le pasa lo que ya tiene suscripto, y esto se testea con objetos literales.
 */

/**
 * QUÉ SIGNIFICA QUE NO HAYA PRÓXIMA ACCIÓN.
 *
 * `deriveNextAction` devuelve `null` en dos situaciones que no se parecen en
 * nada —"todavía no sé" y "no queda nada"— y el Hub no las puede distinguir
 * solo. Cuando eso quedaba implícito, un modo de temporada mostraba un trofeo
 * dorado y "No queda nada por jugar" durante los dos round trips que tarda en
 * cargar. Por eso el motivo es un dato, y no una convención.
 */
export type HubIdle =
  /** El modo todavía no resolvió su estado: esqueleto, ni acción ni cierre. */
  | { kind: 'loading' }
  /** No se puede jugar y el modo tiene su propia explicación. */
  | { kind: 'blocked'; message: string }
  /** Se puede jugar (o se terminó): el Hub decide con `nextAction`. */
  | { kind: 'done' };

export interface HubHeader {
  /** Título grande: el ciclo o la temporada en curso. */
  title: string;
  /** Renglón de abajo: la fase o la fecha que toca. */
  phaseLabel: string;
  /** 0..1, para la `PixelBar`. */
  progress: number;
  /**
   * Por qué no habría nada que apretar. Se lee junto con `deriveNextAction`:
   * mientras haya acción, esto no se rinde. Existe porque no todos los cierres
   * son iguales —un ciclo terminado no es lo mismo que un modo al que todavía
   * no le sembraron los clubes— y porque "cargando" no es un cierre.
   */
  idle: HubIdle;
}

/** Lo que la rama de temporada necesita saber del store. */
export interface SeasonHeaderInput {
  status: SeasonModeStatus;
  tournaments: ModeTournament[];
  /** El año que se está mirando. */
  year: number | null;
  /** El año en curso del modo: los demás son de sólo lectura. */
  currentYear: number | null;
}

export interface DeriveHubHeaderInput {
  /**
   * El descriptor del modo activo, entero — igual que en `deriveNextAction`. La
   * cabecera tiene que explicar cierres que dependen de lo que el modo declara
   * (una temporada jugada entera en un modo sin ascensos no se puede cerrar).
   */
  descriptor: ModeDescriptor;
  /** `national-cycle`: el ciclo activo. `null` mientras carga. */
  cycle: Cycle | null;
  season: SeasonHeaderInput;
}

/** Cómo se lee cada fase del ciclo. */
const CYCLE_PHASE_LABEL: Record<string, string> = {
  continental: 'Torneos Continentales',
  confed: 'Copa Confederaciones',
  'wc-qualifiers': 'Clasificatorias',
  'wc-groups': 'Mundial · Fase de grupos',
  'wc-knockout': 'Mundial · Playoffs',
};

/**
 * Partidos de los playoffs del Mundial.
 *
 * OJO con la aritmética: `round-of-N` es la ronda de N EQUIPOS, o sea N/2
 * cruces (la convención está escrita en `core/formats/rounds.ts`). Entran 32
 * clasificados, así que son 16 cruces en dieciseisavos, 8 en octavos, 4 en
 * cuartos, 2 en semis, más el 3er puesto y la final: 32 partidos, no 62.
 *
 * Va como constante —y no contando los que existen— porque la llave genera cada
 * ronda recién cuando termina la anterior: contar sólo lo generado deja la barra
 * en 100% durante todos los playoffs (cada ronda está completa justo antes de
 * que aparezca la siguiente).
 */
const WORLD_CUP_KNOCKOUT_MATCHES = 16 + 8 + 4 + 2 + 1 + 1;

interface Counted {
  playedMatches: number;
  totalMatches: number;
}

function cycleHeader(cycle: Cycle | null): HubHeader {
  if (!cycle) {
    return {
      title: 'Ciclo mundial',
      phaseLabel: 'Cargando…',
      progress: 0,
      idle: { kind: 'loading' },
    };
  }

  const parts: Counted[] = [
    getContinentalProgress(cycle),
    getConfederationsProgress(cycle),
    getQualifierProgress(cycle),
  ];

  // El Mundial entra en la cuenta recién cuando existe: antes del sorteo no hay
  // ni grupos ni llave, y sumar sus totales haría que la barra arrancara pisada.
  if (cycle.worldCup) {
    parts.push(getWorldCupGroupProgress(cycle.worldCup.groups));
    parts.push({
      playedMatches: getPhaseMatches(cycle, 'wc-knockout').filter((m) => m.isPlayed).length,
      totalMatches: WORLD_CUP_KNOCKOUT_MATCHES,
    });
  }

  const played = parts.reduce((n, p) => n + p.playedMatches, 0);
  const total = parts.reduce((n, p) => n + p.totalMatches, 0);

  return {
    title: `Ciclo ${cycle.year}`,
    phaseLabel: CYCLE_PHASE_LABEL[cycle.calendar.phase] ?? 'Ciclo completo',
    progress: total > 0 ? played / total : 0,
    // El ciclo cargado sí termina: sin próxima acción, se ganó el Mundial y el
    // Hub ofrece arrancar uno nuevo.
    idle: { kind: 'done' },
  };
}

/**
 * Partidos con total conocido de entrada, que son los únicos que pueden estar
 * en el denominador de la barra: los de una liga y los de una fase de grupos.
 *
 * El cuadro de eliminación queda afuera a propósito —genera cada ronda recién
 * cuando termina la anterior, así que sumarlo haría retroceder el porcentaje—,
 * pero los grupos NO tenían por qué irse con él: un modo de una sola copa
 * (grupos + llave) se quedaba con la barra en 0% para siempre.
 */
function countableMatches(tournaments: ModeTournament[]) {
  return tournaments.flatMap((t) => {
    if (t.format === 'liga') return t.state.matches;
    if (t.format === 'grupos-eliminacion') return t.state.groups.groups.flatMap((g) => g.matches);
    return [];
  });
}

function seasonHeader(
  { status, tournaments, year, currentYear }: SeasonHeaderInput,
  descriptor: ModeDescriptor,
): HubHeader {
  const title = year !== null ? `Temporada ${year}` : 'Temporada';
  const laTemporada = year !== null ? `la temporada ${year}` : 'la temporada';

  const matches = countableMatches(tournaments);
  const progress =
    matches.length > 0 ? matches.filter((m) => m.isPlayed).length / matches.length : 0;

  if (status === 'needs-seed') {
    return {
      title,
      phaseLabel: 'Sin clubes sembrados',
      progress: 0,
      // Este texto vivía en la portada del modo de temporada, que el Hub
      // reemplazó: es lo único que explica por qué el modo todavía no se puede
      // jugar. Sin él, el Hub diría "no queda nada por jugar" en un modo que
      // nunca se pudo empezar.
      idle: {
        kind: 'blocked',
        message:
          'Este modo todavía no tiene sus divisiones cargadas. En cuanto se siembren los clubes ' +
          `(con su división y skill inicial), vas a poder iniciar ${laTemporada} acá.`,
      },
    };
  }
  if (status === 'error') {
    return {
      title,
      phaseLabel: 'Sin conexión',
      progress,
      // Inalcanzable mientras haya "▶ REINTENTAR", pero el motivo tiene que ser
      // verdadero igual: sin conexión el modo no está terminado, está caído.
      idle: { kind: 'blocked', message: 'No se pudo cargar la temporada. Revisá la conexión.' },
    };
  }
  // `idle` y `loading`: el modo todavía no contestó. Es la ventana de los dos
  // round trips de `loadForMode`, donde el Hub decía "no queda nada por jugar".
  if (status !== 'ready') {
    return { title, phaseLabel: 'Cargando…', progress, idle: { kind: 'loading' } };
  }

  // Un año pasado no se juega: las tres acciones del store lo rechazan en
  // silencio. El aviso de sólo lectura que tenía la vista de temporada
  // (`SeasonModeView`) lo da acá el Hub, que ahora es la pantalla de entrada.
  if (year !== null && currentYear !== null && year !== currentYear) {
    return {
      title,
      phaseLabel: 'Cerrada · sólo lectura',
      progress,
      idle: {
        kind: 'blocked',
        message:
          `Estás mirando ${laTemporada}, que ya se cerró: es de sólo lectura. ` +
          `Elegí la temporada ${currentYear} en el selector para seguir jugando.`,
      },
    };
  }

  const pending = tournaments
    .map((t) => ({ t, jornada: currentModeJornada(t) }))
    .find((x) => x.jornada !== null);
  if (pending) {
    return {
      title,
      phaseLabel: `${pending.t.name} · ${pending.jornada!.label}`,
      progress,
      idle: { kind: 'done' },
    };
  }

  // Sin torneos la temporada no arrancó (es donde queda el modo después de
  // cerrar la anterior); con torneos y sin jornada pendiente, se jugó entera.
  if (tournaments.length === 0) {
    return { title, phaseLabel: 'Sin arrancar', progress, idle: { kind: 'done' } };
  }

  return {
    title,
    phaseLabel: 'Temporada completa',
    progress,
    // Jugada entera y sin cierre posible: el modo no declara ascensos, así que
    // no hay temporada siguiente que abrir y tampoco hay botón que ofrecer.
    idle: canCloseSeason(descriptor)
      ? { kind: 'done' }
      : {
          kind: 'blocked',
          message:
            `Se jugó ${laTemporada} entera. Este modo no aplica ascensos ni descensos, ` +
            'así que no hay una temporada siguiente para abrir desde acá.',
        },
  };
}

export function deriveHubHeader(input: DeriveHubHeaderInput): HubHeader {
  return input.descriptor.engine === 'national-cycle'
    ? cycleHeader(input.cycle)
    : seasonHeader(input.season, input.descriptor);
}
