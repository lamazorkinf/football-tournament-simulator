import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TableMovesCard } from '../TableMovesCard';
import type { TableSummaryView } from '../../../core/tableMoves';

const table = (over: Partial<TableSummaryView> = {}): TableSummaryView => ({
  leaderTeamId: 'A',
  leaderTeamName: 'Ben Hur',
  leaderIsNew: true,
  moves: [
    { teamId: 'B', teamName: 'Talleres', from: 7, to: 4 },
    { teamId: 'C', teamName: 'Alumni', from: 1, to: 3 },
  ],
  ...over,
});

describe('TableMovesCard', () => {
  it('anuncia al puntero nuevo', () => {
    render(<TableMovesCard table={table()} />);
    expect(screen.getByText('Ben Hur')).toBeInTheDocument();
    expect(screen.getByText(/nuevo puntero/i)).toBeInTheDocument();
  });

  it('el puntero que se sostiene se lee distinto', () => {
    render(<TableMovesCard table={table({ leaderIsNew: false })} />);
    expect(screen.getByText(/sigue puntero/i)).toBeInTheDocument();
    expect(screen.queryByText(/nuevo puntero/i)).not.toBeInTheDocument();
  });

  it('muestra cada movimiento con sus dos posiciones', () => {
    render(<TableMovesCard table={table()} />);
    expect(screen.getByText('Talleres')).toBeInTheDocument();
    expect(screen.getByText('7º → 4º')).toBeInTheDocument();
    expect(screen.getByText('1º → 3º')).toBeInTheDocument();
  });

  it('sin movimientos rinde igual al puntero', () => {
    render(<TableMovesCard table={table({ moves: [] })} />);
    expect(screen.getByText('Ben Hur')).toBeInTheDocument();
    expect(screen.queryByText('Talleres')).not.toBeInTheDocument();
  });
});
