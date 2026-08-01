import { getPhaseMatches } from '../core/calendar';
import { getContinentalProgress, getConfederationsProgress } from '../utils/cycleProgress';
import { getQualifierProgress, getWorldCupGroupProgress } from '../utils/tournamentProgress';
import { currentModeJornada } from '../core/formats/modeJornada';
import type { Cycle } from '../types';
import type { ModeEngine } from './types';
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

export interface HubHeader {
  /** Título grande: el ciclo o la temporada en curso. */
  title: string;
  /** Renglón de abajo: la fase o la fecha que toca. */
  phaseLabel: string;
  /** 0..1, para la `PixelBar`. */
  progress: number;
  /**
   * Qué decir cuando no hay próxima acción. `undefined` deja el texto genérico
   * del Hub. Existe porque no todos los cierres son iguales: un ciclo terminado
   * no es lo mismo que un modo al que todavía no le sembraron los clubes, y
   * decirle a ese último "no queda nada por jugar" es mentirle.
   */
  emptyMessage?: string;
}

/** Lo que la rama de temporada necesita saber del store. */
export interface SeasonHeaderInput {
  status: SeasonModeStatus;
  tournaments: ModeTournament[];
  year: number | null;
}

export interface DeriveHubHeaderInput {
  engine: ModeEngine;
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
 * Partidos de los playoffs del Mundial: R32 + octavos + cuartos + semis + 3er
 * puesto + final. Va como constante —y no contando los que existen— porque la
 * llave genera cada ronda recién cuando termina la anterior: contar sólo lo
 * generado deja la barra en 100% durante todos los playoffs (cada ronda está
 * completa justo antes de que aparezca la siguiente).
 */
const WORLD_CUP_KNOCKOUT_MATCHES = 32 + 16 + 8 + 4 + 1 + 1;

interface Counted {
  playedMatches: number;
  totalMatches: number;
}

function cycleHeader(cycle: Cycle | null): HubHeader {
  if (!cycle) return { title: 'Ciclo mundial', phaseLabel: 'Cargando…', progress: 0 };

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
  };
}

function seasonHeader({ status, tournaments, year }: SeasonHeaderInput): HubHeader {
  const title = year !== null ? `Temporada ${year}` : 'Temporada';
  const laTemporada = year !== null ? `la temporada ${year}` : 'la temporada';

  // El progreso suma sólo los torneos `liga` a propósito: son los que tienen un
  // total de partidos conocido de entrada. Un cuadro de eliminación genera sus
  // rondas a medida que avanza, así que contarlo daría un porcentaje que
  // retrocede.
  const matches = tournaments.flatMap((t) => (t.format === 'liga' ? t.state.matches : []));
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
      emptyMessage:
        'Este modo todavía no tiene sus divisiones cargadas. En cuanto se siembren los clubes ' +
        `(con su división y skill inicial), vas a poder iniciar ${laTemporada} acá.`,
    };
  }
  if (status === 'error') return { title, phaseLabel: 'Sin conexión', progress };
  if (status !== 'ready') return { title, phaseLabel: 'Cargando…', progress };

  const pending = tournaments
    .map((t) => ({ t, jornada: currentModeJornada(t) }))
    .find((x) => x.jornada !== null);
  if (pending) {
    return { title, phaseLabel: `${pending.t.name} · ${pending.jornada!.label}`, progress };
  }

  return {
    title,
    // Sin torneos la temporada no arrancó (es donde queda el modo después de
    // cerrar la anterior); con torneos y sin jornada pendiente, se jugó entera.
    phaseLabel: tournaments.length === 0 ? 'Sin arrancar' : 'Temporada completa',
    progress,
  };
}

export function deriveHubHeader(input: DeriveHubHeaderInput): HubHeader {
  return input.engine === 'national-cycle' ? cycleHeader(input.cycle) : seasonHeader(input.season);
}
