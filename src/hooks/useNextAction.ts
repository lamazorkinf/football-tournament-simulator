import { useMemo } from 'react';
import { useModeStore } from '../store/useModeStore';
import { useTournamentStore } from '../store/useTournamentStore';
import { useSeasonModeStore } from '../store/useSeasonModeStore';
import { useModeDescriptor } from './useModeDescriptor';
import { deriveNextAction, type Nav } from '../modes/nextAction';
import type { MobileAction } from './useMobileAction';

/**
 * La próxima acción del modo activo. Espejo de `useModeNav`: la derivación es
 * pura y vive en `modes/`, acá sólo se leen los stores y se inyectan sus
 * acciones.
 */
export function useNextAction(nav: Nav): MobileAction | null {
  const descriptor = useModeDescriptor();

  const cycle = useTournamentStore((s) => s.currentTournament);
  // Un sorteo o un batch en curso deshabilita la acción: el store ya tiene sus
  // propios candados, esto evita el doble clic en la interfaz.
  const cycleBusy = useTournamentStore((s) => s.isDrawing || s.isBatchProcessing);

  const seasonStatus = useSeasonModeStore((s) => s.status);
  const seasonTournaments = useSeasonModeStore((s) => s.tournaments);
  const seasonBusy = useSeasonModeStore((s) => s.busy);
  // El año mirado y el año en curso: mirar una temporada vieja es de sólo
  // lectura, y ofrecer ahí una acción sería un botón muerto (el store la aborta
  // sin decir nada).
  const seasonYear = useSeasonModeStore((s) => s.year);
  const seasonCurrentYear = useSeasonModeStore((s) => s.currentYear);

  return useMemo(
    () =>
      deriveNextAction({
        descriptor,
        cycle,
        season: {
          status: seasonStatus,
          tournaments: seasonTournaments,
          year: seasonYear,
          currentYear: seasonCurrentYear,
        },
        busy: descriptor.engine === 'season' ? seasonBusy : cycleBusy,
        nav,
        actions: {
          drawContinental: () => useTournamentStore.getState().drawContinental(),
          drawConfederations: () => useTournamentStore.getState().drawConfederations(),
          advanceToQualifiers: () => useTournamentStore.getState().advanceToQualifiers(),
          generateDrawAndFixtures: (options) =>
            useTournamentStore.getState().generateDrawAndFixtures(options),
          advanceToWorldCup: () => useTournamentStore.getState().advanceToWorldCup(),
          advanceToKnockout: () => useTournamentStore.getState().advanceToKnockout(),
          startSeason: () => useSeasonModeStore.getState().startSeason(),
          simulateJornada: (id) => useSeasonModeStore.getState().simulateJornada(id),
          closeSeason: () => useSeasonModeStore.getState().closeSeason(),
          reloadMode: async () => {
            const mode = useModeStore.getState().activeMode();
            if (mode) await useSeasonModeStore.getState().loadForMode(mode);
          },
        },
      }),
    [
      descriptor,
      cycle,
      cycleBusy,
      seasonStatus,
      seasonTournaments,
      seasonBusy,
      seasonYear,
      seasonCurrentYear,
      nav,
    ],
  );
}
