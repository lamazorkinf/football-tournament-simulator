import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ConfederationsCupView } from '../ConfederationsCupView';
import { makeDrawnContinentalCycle } from '../../../test/fixtures/cycle';

describe('Fase bloqueada', () => {
  it('explica el desbloqueo y ofrece la salida cuando la confed no fue sorteada', async () => {
    // Continental sorteada pero sin terminar: la confed todavía no existe.
    const { cycle, teams } = makeDrawnContinentalCycle();
    const onNavigate = vi.fn();

    render(<ConfederationsCupView cycle={cycle} teams={teams} onNavigate={onNavigate} />);

    expect(screen.getByText(/se desbloquea/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /ir a continental/i }));
    expect(onNavigate).toHaveBeenCalledWith('continental');
  });
});
