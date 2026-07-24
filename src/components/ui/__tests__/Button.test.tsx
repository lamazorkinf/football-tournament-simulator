import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Button } from '../Button';

describe('Button', () => {
  it('con loading queda deshabilitado, expone aria-busy y no dispara onClick', async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Simular</Button>);

    const button = screen.getByRole('button', { name: /simular/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('sin loading no expone aria-busy y dispara onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Simular</Button>);

    const button = screen.getByRole('button', { name: /simular/i });
    expect(button).not.toHaveAttribute('aria-busy', 'true');

    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('muestra el indicador de carga con rol status cuando está loading', () => {
    render(<Button loading>Simular</Button>);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
