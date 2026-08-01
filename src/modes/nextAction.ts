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

/** Estado de la temporada que la rama `season` necesita. La completa la Task 2. */
export interface SeasonView {
  status: SeasonModeStatus;
  tournaments: ModeTournament[];
}

export interface DeriveNextActionInput {
  engine: ModeEngine;
  /** `national-cycle`: el ciclo activo. */
  cycle: Cycle | null;
  /** `season`: estado de la temporada en curso. Lo completa la rama de temporada. */
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
        if (!(await actions.generateDrawAndFixtures())) return;
        toast.success('Sorteo y fixtures generados');
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

export function deriveNextAction(input: DeriveNextActionInput): MobileAction | null {
  const { engine, cycle, nav, actions, busy } = input;

  const action =
    engine === 'national-cycle' ? (cycle ? cycleNextAction(cycle, nav, actions) : null) : null;

  return action ? { ...action, disabled: busy } : null;
}
