import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from './App';
import { useTournamentStore } from './store/useTournamentStore';
import { toCycle } from './core/cycle';
import { baseTournament } from './test/fixtures/cycle';

/**
 * App debe llamar a `initializeTournament` incondicionalmente en el mount, aun
 * si el store ya tiene un `currentTournament` en memoria: esa carga es la que
 * trae el estado real desde la DB (única fuente de verdad) y la que decide si
 * hay que mostrar la pantalla de error. Un gate del tipo
 * `if (!currentTournament)` la dejaría inerte. Es idempotente vía el candado
 * `initializationInFlight`.
 *
 * Se reemplaza `initializeTournament` (y `loadTeamsFromDatabase`, para no
 * pegarle a la red real desde el otro efecto de mount) por spies: sólo
 * interesa que App la invoque; la carga en sí está cubierta en
 * useTournamentStore.init.test.ts.
 */
describe('App — inicialización en el mount', () => {
  it('llama a initializeTournament en el mount aunque ya haya un torneo en memoria', () => {
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
