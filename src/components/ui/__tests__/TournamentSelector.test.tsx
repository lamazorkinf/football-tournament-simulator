import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { TournamentSelector } from '../TournamentSelector';
import { useTournamentStore } from '../../../store/useTournamentStore';

/** Mundial vacío con campeón: el selector sólo mira `worldCup?.champion`. */
const conCampeon = (champion: string) => ({ champion, groups: [], knockout: null });

const torneo = (id: string, year: number, champion?: string) => ({
  id,
  year,
  name: `Mundial ${year}`,
  qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
  worldCup: champion ? conCampeon(champion) : null,
});

beforeEach(() => {
  useTournamentStore.setState({
    tournaments: [torneo('a', 2026, 'bra'), torneo('b', 2026)],
    currentTournamentId: 'a',
    teams: [{ id: 'bra', name: 'Brasil', flag: '', skill: 90 }],
  } as never);
});

/**
 * Las bases viejas tienen dos torneos del mismo año — el guard de
 * `handleCreateNew` ya no deja crearlos, pero los que existen hay que poder
 * distinguirlos. La fila mostraba el año arriba y el nombre abajo, y como el
 * nombre YA trae el año ("Mundial 2026"), las dos filas se leían idénticas.
 */
describe('TournamentSelector — dos torneos del mismo año', () => {
  it('la fila no repite el año: muestra el nombre y, si lo hay, el campeón', async () => {
    render(<TournamentSelector />);
    await userEvent.click(screen.getAllByRole('button')[0]);

    // Los dos se llaman igual…
    expect(screen.getAllByText('Mundial 2026')).toHaveLength(2);
    // …pero sólo uno tiene campeón, y ahí está la diferencia.
    expect(screen.getByText(/Campeón: Brasil/)).toBeInTheDocument();
  });

  it('el año deja de ser el renglón grande, pero no desaparece', async () => {
    render(<TournamentSelector />);
    await userEvent.click(screen.getAllByRole('button')[0]);

    // Antes el año era el renglón grande de CADA fila, y como el nombre ya lo
    // trae, dos torneos del mismo año se leían idénticos. Ahora el renglón de
    // abajo dice el campeón cuando lo hay; el año queda para las filas que no
    // tienen —incluido un torneo importado cuyo nombre puede no traerlo.
    const filas = screen.getAllByRole('button').filter((b) => b.textContent?.includes('Mundial 2026'));
    expect(filas).toHaveLength(2);
    expect(filas[0].textContent).toContain('Campeón: Brasil');
    expect(filas[1].textContent).toContain('2026');
    expect(filas[1].textContent).not.toContain('Campeón');
  });

  /**
   * Lo que este arreglo NO resuelve, dicho de frente: dos torneos del mismo año
   * y ninguno con campeón siguen leyéndose igual. Los distingue el badge de
   * estado, igual que antes — no es una regresión, es el límite.
   */
  it('dos torneos sin campeón del mismo año se distinguen sólo por su estado', async () => {
    useTournamentStore.setState({
      tournaments: [torneo('a', 2026), torneo('b', 2026)],
    } as never);
    render(<TournamentSelector />);
    await userEvent.click(screen.getAllByRole('button')[0]);

    expect(screen.getAllByText('Mundial 2026')).toHaveLength(2);
    expect(screen.queryByText(/Campeón/)).not.toBeInTheDocument();
  });

  it('un campeón que no está en el pool cae a su id', async () => {
    useTournamentStore.setState({
      tournaments: [torneo('a', 2026, 'fantasma')],
    } as never);
    render(<TournamentSelector />);
    await userEvent.click(screen.getAllByRole('button')[0]);

    expect(screen.getByText(/Campeón: fantasma/)).toBeInTheDocument();
  });
});
