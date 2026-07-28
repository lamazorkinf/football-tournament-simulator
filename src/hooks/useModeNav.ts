import { useMemo } from 'react';
import { useSeasonModeStore } from '../store/useSeasonModeStore';
import { useTournamentStore } from '../store/useTournamentStore';
import { useModeDescriptor } from './useModeDescriptor';
import { deriveModeNav, type ModeNav } from '../modes/nav';
import { lockedViewsForCycle } from '../modes/seleccionesAdapter';
import type { View } from '../types/view';

/**
 * La navegación del modo activo, tal como la ve la interfaz.
 *
 * Es el único punto donde la UI mira el modo: sidebar, barra mobile, menú de
 * pausa y el ruteo de App leen de acá. Ningún componente vuelve a ramificar
 * por tipo de modo — si hace falta saberlo, se pregunta por `nav.engine`.
 */
export function useModeNav(currentView: View): ModeNav {
  const seasonStatus = useSeasonModeStore((s) => s.status);
  const seasonTournaments = useSeasonModeStore((s) => s.tournaments);
  const requestedTab = useSeasonModeStore((s) => s.activeTab);
  const cycle = useTournamentStore((s) => s.currentTournament);

  const descriptor = useModeDescriptor();

  return useMemo(() => {
    const isSeason = descriptor.engine === 'season';
    return deriveModeNav({
      descriptor,
      currentView,
      requestedTab,
      runningCompetitionIds:
        isSeason && seasonStatus === 'ready' ? seasonTournaments.map((t) => t.competitionId) : [],
      lockedViews: isSeason ? [] : lockedViewsForCycle(cycle),
    });
  }, [descriptor, currentView, requestedTab, seasonStatus, seasonTournaments, cycle]);
}
