import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { TeamFlag } from '../TeamFlag';
import { useTournamentStore } from '../../../store/useTournamentStore';
import type { Team } from '../../../types';

function setTeams(teams: Team[]) {
  useTournamentStore.setState({ teams });
}

describe('TeamFlag — escudos de club vs banderas de selección', () => {
  beforeEach(() => setTeams([]));

  it('selección (con código de país): usa la bandera del CDN, ignora flag', () => {
    render(<TeamFlag teamId="arg" teamName="Argentina" flag="🏴" />);
    const img = screen.getByRole('img', { name: /argentina/i });
    expect(img).toHaveAttribute('src', expect.stringContaining('flagcdn.com'));
  });

  it('club con emoji en flag: lo renderiza como texto', () => {
    render(<TeamFlag teamId="villa-uuid" teamName="Villa FC" flag="🦅" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('🦅')).toBeInTheDocument();
  });

  it('club con URL de imagen en flag: renderiza un <img> con esa URL', () => {
    render(
      <TeamFlag
        teamId="villa-uuid"
        teamName="Villa FC"
        flag="https://example.com/crests/villa.png"
      />,
    );
    const img = screen.getByRole('img', { name: /villa fc/i });
    expect(img).toHaveAttribute('src', 'https://example.com/crests/villa.png');
  });

  it('club sin flag en props: toma el escudo del pool de equipos por id', () => {
    setTeams([{ id: 'villa-uuid', name: 'Villa FC', flag: '⚽', skill: 60, modeId: 'liga' }]);
    render(<TeamFlag teamId="villa-uuid" teamName="Villa FC" />);
    expect(screen.getByText('⚽')).toBeInTheDocument();
  });

  it('club sin ningún escudo: cae al fallback con el id', () => {
    render(<TeamFlag teamId="villa-uuid" teamName="Villa FC" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('VILLA-UUID')).toBeInTheDocument();
  });
});
