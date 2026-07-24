import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Tabs } from '../Tabs';

const ITEMS = [
  { id: 'palmares', label: 'Palmarés' },
  { id: 'cronologia', label: 'Cronología' },
];

describe('Tabs', () => {
  it('expone los roles ARIA de lista de pestañas', () => {
    render(<Tabs items={ITEMS} value="palmares" onChange={vi.fn()} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: 'Palmarés' })).toHaveAttribute('aria-selected', 'true');
  });

  it('cambia de pestaña al hacer click', async () => {
    const onChange = vi.fn();
    render(<Tabs items={ITEMS} value="palmares" onChange={onChange} />);

    await userEvent.click(screen.getByRole('tab', { name: 'Cronología' }));
    expect(onChange).toHaveBeenCalledWith('cronologia');
  });

  it('navega con las flechas y cicla en los extremos', async () => {
    const onChange = vi.fn();
    render(<Tabs items={ITEMS} value="palmares" onChange={onChange} />);

    screen.getByRole('tab', { name: 'Palmarés' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('cronologia');

    onChange.mockClear();
    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenCalledWith('cronologia');
  });
});
