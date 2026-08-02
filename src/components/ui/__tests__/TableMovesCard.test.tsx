import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TableMovesCard } from '../TableMovesCard';
import type { TableSummaryView } from '../../../core/tableMoves';

const table = (over: Partial<TableSummaryView> = {}): TableSummaryView => ({
  leaderTeamId: 'A',
  leaderTeamName: 'Ben Hur',
  leaderIsNew: true,
  hadPreviousTable: true,
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

  /**
   * LA FECHA 1, la instancia más vista del bloque: `deriveTableSummary` no
   * reporta movimientos ni puntero nuevo porque el orden de antes era el de
   * siembra. Decir "sigue puntero" ahí sería afirmar una continuidad contra un
   * pasado que no existió: el puntero de la fecha 1 nunca fue puntero.
   */
  it('sin tabla previa no afirma que el puntero venía de antes', () => {
    render(
      <TableMovesCard table={table({ leaderIsNew: false, hadPreviousTable: false, moves: [] })} />,
    );
    expect(screen.getByText('Ben Hur')).toBeInTheDocument();
    expect(screen.getByText('es el puntero')).toBeInTheDocument();
    expect(screen.queryByText(/sigue puntero/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/nuevo puntero/i)).not.toBeInTheDocument();
  });

  it('muestra cada movimiento con sus dos posiciones', () => {
    render(<TableMovesCard table={table()} />);
    expect(screen.getByText('Talleres')).toBeInTheDocument();
    expect(screen.getByText('7º → 4º')).toBeInTheDocument();
    expect(screen.getByText('1º → 3º')).toBeInTheDocument();
  });

  it('la flecha de cada movimiento coincide con si subió o bajó en la tabla', () => {
    render(<TableMovesCard table={table()} />);
    // Talleres: 7º → 4º. Menor número es mejor posición: bajó el número,
    // subió en la tabla → flecha hacia arriba, color led.
    const talleresIcon = screen.getByText('Talleres').closest('p')?.querySelector('svg');
    expect(talleresIcon).toHaveClass('text-led');
    expect(talleresIcon).not.toHaveClass('text-grass-soft');

    // Alumni: 1º → 3º. Subió el número, bajó en la tabla (se cayó del
    // primer puesto) → flecha hacia abajo, color atenuado.
    const alumniIcon = screen.getByText('Alumni').closest('p')?.querySelector('svg');
    expect(alumniIcon).toHaveClass('text-grass-soft');
    expect(alumniIcon).not.toHaveClass('text-led');
  });

  it('sin movimientos rinde igual al puntero', () => {
    render(<TableMovesCard table={table({ moves: [] })} />);
    expect(screen.getByText('Ben Hur')).toBeInTheDocument();
    expect(screen.queryByText('Talleres')).not.toBeInTheDocument();
  });
});
