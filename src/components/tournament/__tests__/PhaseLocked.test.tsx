import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ConfederationsCupView } from '../ConfederationsCupView';
import { ContinentalView } from '../ContinentalView';
import type { Region } from '../../../types';
import {
  makeDrawnContinentalCycle,
  makeContinentalDoneCycle,
} from '../../../test/fixtures/cycle';

describe('Fase bloqueada', () => {
  it('explica el desbloqueo y ofrece la salida cuando la confed no fue sorteada', async () => {
    // Continental sorteada pero sin terminar: la confed todavía no existe.
    const { cycle, teams } = makeDrawnContinentalCycle();
    const onNavigate = vi.fn();

    render(<ConfederationsCupView cycle={cycle} teams={teams} onNavigate={onNavigate} />);

    // Contra el título, no la descripción: el texto explicativo se afina y no
    // tiene por qué romper el test cada vez.
    expect(screen.getByText(/copa confederaciones bloqueada/i)).toBeInTheDocument();

    // A Progreso, que es donde vive el sorteo de confederaciones. Mandar a
    // Continental deja al usuario en una llave ya jugada apenas esa fase
    // termina, que es justo cuando más probable es que entre acá.
    await userEvent.click(screen.getByRole('button', { name: /ir a progreso/i }));
    expect(onNavigate).toHaveBeenCalledWith('wizard');
  });

  it('explica el desbloqueo cuando los continentales no fueron sorteados', async () => {
    const { cycle, teams } = makeDrawnContinentalCycle();
    // isContinentalDrawn mira que algún bracket tenga roundOf64 con partidos:
    // vaciarlos devuelve el ciclo al estado "sin sortear".
    const brackets = { ...cycle.continental.brackets };
    for (const region of Object.keys(brackets) as Region[]) {
      brackets[region] = { ...brackets[region], roundOf64: [] };
    }
    const sinSortear = {
      ...cycle,
      continental: { ...cycle.continental, brackets },
    };
    const onNavigate = vi.fn();

    render(<ContinentalView cycle={sinSortear} teams={teams} onNavigate={onNavigate} />);

    expect(screen.getByText(/sortear/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /ir a progreso/i }));
    expect(onNavigate).toHaveBeenCalledWith('wizard');
  });

  // La dirección peligrosa: que el EmptyState tape datos reales. Con la fase
  // continental TERMINADA la llave tiene que seguir viéndose.
  it('NO tapa la llave continental cuando la fase ya se jugó entera', () => {
    const { cycle, teams } = makeContinentalDoneCycle();

    render(<ContinentalView cycle={cycle} teams={teams} onNavigate={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /ir a progreso/i })).not.toBeInTheDocument();
  });
});
