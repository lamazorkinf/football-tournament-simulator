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

  it('las filas de la lista ya no repiten el año a secas', async () => {
    render(<TournamentSelector />);
    const disparador = screen.getAllByRole('button')[0];
    await userEvent.click(disparador);

    // El año a secas sobrevive SÓLO en el botón disparador, que es la etiqueta
    // compacta del selector cerrado. Antes también era el renglón grande de
    // cada fila, y eso es lo que hacía indistinguibles a dos torneos del mismo
    // año: con dos torneos en la lista habría tres "2026" en pantalla.
    const sueltos = screen.getAllByText('2026');
    expect(sueltos).toHaveLength(1);
    expect(disparador).toContainElement(sueltos[0]);
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
