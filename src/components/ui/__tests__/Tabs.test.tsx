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

  // Con solo dos pestañas, ArrowRight y ArrowLeft desde la primera caen las dos
  // en la segunda, así que el test de arriba no distingue "cicla al último" de
  // "cicla al siguiente". Con tres, los dos destinos son distintos.
  it('al ciclar hacia atrás desde la primera va a la ÚLTIMA, no a la segunda', async () => {
    const onChange = vi.fn();
    const tres = [
      { id: 'uno', label: 'Uno' },
      { id: 'dos', label: 'Dos' },
      { id: 'tres', label: 'Tres' },
    ];
    render(<Tabs items={tres} value="uno" onChange={onChange} />);

    screen.getByRole('tab', { name: 'Uno' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenCalledWith('tres');
  });

  it('solo la pestaña activa entra en el orden de tabulación', () => {
    render(<Tabs items={ITEMS} value="palmares" onChange={vi.fn()} />);

    expect(screen.getByRole('tab', { name: 'Palmarés' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Cronología' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tab', { name: 'Cronología' })).toHaveAttribute('aria-selected', 'false');
  });

  // Un `value` que no matchea ningún id (stale o sin inicializar) hace que
  // findIndex devuelva -1. El guard corta ahí. Sin él NO hay crash —el módulo
  // normaliza el -1 a un índice válido— pero sí un onChange espurio hacia una
  // pestaña arbitraria que el usuario no pidió. El test scratch que lo
  // verificaba se borró antes del commit original y quedó sin red.
  it('no rompe ni notifica si value no matchea ninguna pestaña', async () => {
    const onChange = vi.fn();
    render(<Tabs items={ITEMS} value="inexistente" onChange={onChange} />);

    screen.getByRole('tab', { name: 'Palmarés' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('{ArrowLeft}');

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });
});
