import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { MatchResultToast, showMatchResultToast } from '../MatchResultToast';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MatchResultToast', () => {
  it('muestra los dos equipos y el marcador', () => {
    render(
      <MatchResultToast homeName="Argentina" awayName="Brasil" homeScore={2} awayScore={1} />,
    );

    expect(screen.getByText('Argentina')).toBeInTheDocument();
    expect(screen.getByText('Brasil')).toBeInTheDocument();
    expect(screen.getByText('2 - 1')).toBeInTheDocument();
  });

  it('muestra la definición por penales cuando el partido fue al punto', () => {
    render(
      <MatchResultToast
        homeName="Argentina"
        awayName="Brasil"
        homeScore={1}
        awayScore={1}
        penalties={{ homeScore: 4, awayScore: 3 }}
      />,
    );

    expect(screen.getByText('Penales 4 - 3')).toBeInTheDocument();
  });

  it('un partido sin penales no menciona penales', () => {
    render(
      <MatchResultToast homeName="Argentina" awayName="Brasil" homeScore={2} awayScore={1} />,
    );

    expect(screen.queryByText(/Penales/)).not.toBeInTheDocument();
  });
});

describe('showMatchResultToast', () => {
  it('emite un aviso de éxito con el resultado', () => {
    showMatchResultToast({
      homeName: 'Argentina',
      awayName: 'Brasil',
      homeScore: 2,
      awayScore: 1,
    });

    expect(toast.success).toHaveBeenCalledTimes(1);
    // El primer argumento es el nodo del aviso: lo renderizamos para verificarlo.
    const node = vi.mocked(toast.success).mock.calls[0][0] as React.ReactNode;
    render(<>{node}</>);
    expect(screen.getByText('2 - 1')).toBeInTheDocument();
  });
});
