import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Trophy } from 'lucide-react';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('muestra título y descripción', () => {
    render(<EmptyState icon={Trophy} title="Sin partidos" description="Todavía no se jugó ninguno" />);
    expect(screen.getByText('Sin partidos')).toBeInTheDocument();
    expect(screen.getByText('Todavía no se jugó ninguno')).toBeInTheDocument();
  });

  it('dispara el CTA cuando se le pasa action', async () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        icon={Trophy}
        title="Confederaciones bloqueada"
        action={{ label: 'Ir a Continental', onClick }}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /ir a continental/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('no renderiza botón cuando no hay action', () => {
    render(<EmptyState icon={Trophy} title="Sin datos" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
