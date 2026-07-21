import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TournamentWizard } from '../TournamentWizard';
import { MobileActionProvider } from '../../../hooks/useMobileAction';
import { useTournamentStore } from '../../../store/useTournamentStore';
import { toCycle } from '../../../core/cycle';
import { baseTournament, makeContinentalDoneCycle } from '../../../test/fixtures/cycle';

function renderWizard() {
  return render(
    <MobileActionProvider>
      <TournamentWizard />
    </MobileActionProvider>
  );
}

describe('TournamentWizard — pasos del ciclo', () => {
  it('ciclo nuevo: muestra los pasos Continental y Confederaciones', () => {
    useTournamentStore.setState({ currentTournament: toCycle(baseTournament()), teams: [] });
    renderWizard();
    expect(screen.getByText('Torneos Continentales')).toBeInTheDocument();
    expect(screen.getByText('Copa Confederaciones')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sortear continentales/i })).toBeInTheDocument();
  });

  it('continental completo: el paso Confederaciones ofrece sortear', () => {
    const { cycle, teams } = makeContinentalDoneCycle();
    useTournamentStore.setState({ currentTournament: cycle, teams });
    renderWizard();
    expect(screen.getByRole('button', { name: /sortear confederaciones/i })).toBeInTheDocument();
  });
});
