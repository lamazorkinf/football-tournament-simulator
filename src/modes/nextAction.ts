import { toast } from 'sonner';
import {
  canDrawContinental,
  canDrawConfederations,
  canAdvanceToQualifiers,
  canDrawQualifiers,
  isQualifiersDrawn,
} from '../utils/cycleProgress';
import {
  getQualifierProgress,
  getWorldCupGroupProgress,
  getKnockoutProgress,
  canAdvanceToWorldCup,
  canAdvanceToKnockout,
} from '../utils/tournamentProgress';
import { currentModeJornada } from '../core/formats/modeJornada';
import type { Cycle } from '../types';
import type { View } from '../types/view';
import type { MobileAction } from '../hooks/useMobileAction';
import type { ModeEngine } from './types';
import type { SeasonModeStatus } from '../store/useSeasonModeStore';
import type { ModeTournament } from '../core/formats/modeTournament';

/**
 * LA PRÓXIMA ACCIÓN DE UN MODO — una sola derivación para toda la interfaz.
 *
 * Espejo de `modes/nav.ts`: puro, sin React, con una rama por motor. Vivía
 * suelta dentro de `TournamentWizard.mobileAction`, sólo para selecciones y
 * sólo para el dock de mobile; un modo de temporada no tenía ninguna.
 *
 * Regla transversal: si la acción del store devuelve `false`, el store ya avisó
 * el motivo con su propio toast, así que acá no se festeja ni se navega.
 */

/** Las acciones de store que el Hub puede disparar, inyectadas para que esto quede puro. */
export interface ModeActions {
  // Ciclo mundialista. Firmas de `TournamentState` en src/types/index.ts.
  drawContinental: () => boolean;
  drawConfederations: () => boolean;
  advanceToQualifiers: () => void;
  generateDrawAndFixtures: (options?: { force?: boolean }) => Promise<boolean>;
  advanceToWorldCup: () => Promise<boolean>;
  advanceToKnockout: () => Promise<boolean>;
  // Modo de temporada. Firmas de `SeasonModeState` en src/store/useSeasonModeStore.ts.
  startSeason: () => Promise<void>;
  simulateJornada: (tournamentId: string) => Promise<unknown>;
  closeSeason: () => Promise<void>;
  /** Reintentar la carga del modo tras un fallo de red. */
  reloadMode: () => Promise<void>;
}

export type Nav = (view: View, tab?: string) => void;

/** Estado de la temporada que necesita la rama `season`. */
export interface SeasonView {
  status: SeasonModeStatus;
  tournaments: ModeTournament[];
}

export interface DeriveNextActionInput {
  engine: ModeEngine;
  /** `national-cycle`: el ciclo activo. */
  cycle: Cycle | null;
  /** `season`: estado de la temporada en curso. */
  season: SeasonView | null;
  /** Sorteo o batch en curso: la acción se ofrece deshabilitada. */
  busy: boolean;
  nav: Nav;
  actions: ModeActions;
}

/**
 * Próxima acción del ciclo mundialista, por prioridad. Es la cadena que vivía
 * en `TournamentWizard.mobileAction`, extendida hasta el final: terminaba en
 * "JUGAR CLASIFICATORIAS" porque las tarjetas-paso cubrían el resto, y al
 * borrarlas esos peldaños quedaban sin dueño.
 */
function cycleNextAction(cycle: Cycle, nav: Nav, actions: ModeActions): MobileAction | null {
  if (canDrawContinental(cycle)) {
    return {
      label: '▶ SORTEAR CONTINENTAL',
      onPress: () => {
        if (!actions.drawContinental()) return;
        toast.success('Torneos continentales sorteados');
        nav('continental');
      },
    };
  }

  if (cycle.calendar.phase === 'continental' && !cycle.continental.isComplete) {
    return { label: '▶ JUGAR CONTINENTAL', onPress: () => nav('continental') };
  }

  if (canDrawConfederations(cycle)) {
    return {
      label: '▶ SORTEAR CONFED',
      onPress: () => {
        if (!actions.drawConfederations()) return;
        toast.success('Copa Confederaciones sorteada');
        nav('confederations');
      },
    };
  }

  if (cycle.calendar.phase === 'confed' && !cycle.confederationsCup.isComplete) {
    return { label: '▶ JUGAR CONFED', onPress: () => nav('confederations') };
  }

  if (canAdvanceToQualifiers(cycle)) {
    return {
      label: '▶ IR A CLASIFICATORIAS',
      onPress: () => {
        actions.advanceToQualifiers();
        toast.success('Fase de Clasificatorias habilitada');
        nav('qualifiers');
      },
    };
  }

  const qualifiersDrawn = isQualifiersDrawn(cycle);

  if (canDrawQualifiers(cycle) && !qualifiersDrawn) {
    return {
      label: '▶ EMPEZAR',
      onPress: async () => {
        // Se lee ANTES del sorteo: si el ciclo ya traía un snapshot de
        // habilidades (Mundial cargado desde una base curada), el sorteo no
        // lo toca, así que el toast puede distinguir ese caso del genérico.
        const hasOriginalSkills =
          cycle.originalSkills && Object.keys(cycle.originalSkills).length > 0;
        if (!(await actions.generateDrawAndFixtures())) return;
        toast.success(
          hasOriginalSkills
            ? 'Sorteo generado — habilidades en la base de este Mundial'
            : 'Sorteo y fixtures generados'
        );
        nav('qualifiers');
      },
    };
  }

  if (
    qualifiersDrawn &&
    cycle.calendar.phase === 'wc-qualifiers' &&
    !getQualifierProgress(cycle).isComplete
  ) {
    return { label: '▶ JUGAR CLASIFICATORIAS', onPress: () => nav('qualifiers') };
  }

  if (canAdvanceToWorldCup(cycle)) {
    return {
      label: '▶ AVANZAR AL MUNDIAL',
      onPress: async () => {
        if (!(await actions.advanceToWorldCup())) return;
        toast.success('Sorteo del Mundial generado');
        nav('worldcup');
      },
    };
  }

  const worldCup = cycle.worldCup;
  if (!worldCup) return null;

  if (!getWorldCupGroupProgress(worldCup.groups).isComplete) {
    return { label: '▶ JUGAR EL MUNDIAL', onPress: () => nav('worldcup') };
  }

  const knockoutStarted = worldCup.knockout.roundOf32.length > 0;

  if (!knockoutStarted && canAdvanceToKnockout(worldCup.groups)) {
    return {
      label: '▶ IR A PLAYOFFS',
      onPress: async () => {
        if (!(await actions.advanceToKnockout())) return;
        toast.success('Playoffs generados');
        nav('worldcup');
      },
    };
  }

  if (knockoutStarted && !getKnockoutProgress(worldCup.knockout).isComplete) {
    return { label: '▶ JUGAR PLAYOFFS', onPress: () => nav('worldcup') };
  }

  // Ciclo completo: no hay camino feliz. El Hub muestra el estado de cierre.
  return null;
}

/**
 * Próxima acción de un modo de temporada, por prioridad.
 *
 * No hay caso "temporada cerrada": `closeSeason` aplica ascensos/descensos,
 * avanza el año y recarga, con lo cual el modo vuelve a `ready` sin torneos —
 * o sea, a "empezar temporada" del año siguiente. Un modo de temporada no
 * termina nunca; el único `null` posible es `needs-seed`.
 *
 * El rótulo de la jornada sale de `currentModeJornada`, que ya resuelve los
 * tres formatos ("Fecha 4" en una liga o una fase de grupos, "Semifinales
 * (ida)" en un cuadro). No se re-deriva acá.
 */
function seasonNextAction(season: SeasonView, actions: ModeActions): MobileAction | null {
  if (season.status === 'error') {
    return { label: '▶ REINTENTAR', onPress: () => void actions.reloadMode() };
  }

  if (season.status !== 'ready') return null;

  if (season.tournaments.length === 0) {
    return { label: '▶ EMPEZAR TEMPORADA', onPress: () => void actions.startSeason() };
  }

  for (const tournament of season.tournaments) {
    const jornada = currentModeJornada(tournament);
    if (jornada) {
      return {
        label: `▶ SIMULAR ${jornada.label.toUpperCase()}`,
        onPress: () => void actions.simulateJornada(tournament.id),
      };
    }
  }

  return { label: '▶ CERRAR TEMPORADA', onPress: () => void actions.closeSeason() };
}

export function deriveNextAction(input: DeriveNextActionInput): MobileAction | null {
  const { engine, cycle, season, nav, actions, busy } = input;

  const action =
    engine === 'national-cycle'
      ? cycle
        ? cycleNextAction(cycle, nav, actions)
        : null
      : season
        ? seasonNextAction(season, actions)
        : null;

  return action ? { ...action, disabled: busy } : null;
}
