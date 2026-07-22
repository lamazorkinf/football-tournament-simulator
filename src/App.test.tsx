import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from './App';
import { useTournamentStore } from './store/useTournamentStore';
import { toCycle } from './core/cycle';
import { baseTournament } from './test/fixtures/cycle';

/**
 * Regresión del gate `if (!currentTournament) initializeTournament()` en App:
 * con `persist` + `onRehydrateStorage` reconstruyendo `currentTournament`
 * sincrónicamente antes del primer render, cualquier usuario recurrente (con
 * ≥1 torneo en localStorage) ya monta con `currentTournament` truthy, así que
 * ese gate nunca disparaba `initializeTournament()` y la reconciliación
 * multi-dispositivo quedaba inerte. `initializeTournament` ahora reconcilia
 * por recencia y es idempotente (candado `initializationInFlight`), por lo
 * que App debe llamarla incondicionalmente en el mount.
 *
 * Se reemplaza `initializeTournament` (y `loadTeamsFromDatabase`, para no
 * pegarle a la red real desde el otro efecto de mount) por spies: sólo
 * interesa que App la invoque, la reconciliación en sí ya está cubierta en
 * useTournamentStore.sync.test.ts.
 */
describe('App — inicialización en el mount', () => {
  it('llama a initializeTournament en el mount aunque currentTournament ya esté rehidratado', () => {
    const initializeTournament = vi.fn();

    useTournamentStore.setState({
      currentTournament: toCycle(baseTournament()),
      teams: [],
      loadTeamsFromDatabase: vi.fn(),
      initializeTournament,
    });

    render(<App />);

    expect(initializeTournament).toHaveBeenCalled();
  });
});
