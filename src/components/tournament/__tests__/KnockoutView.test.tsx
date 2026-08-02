import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { KnockoutView } from '../KnockoutView';
import type { KnockoutBracket, Team } from '../../../types';

const teams: Team[] = [
  { id: 'arg', name: 'Argentina', flag: '🇦🇷', region: 'America', skill: 90 },
];

/** Cuadro vacío: alcanza para que se rindan los encabezados de cada ronda. */
const emptyBracket: KnockoutBracket = {
  roundOf32: [],
  roundOf16: [],
  quarterFinals: [],
  semiFinals: [],
  thirdPlace: null,
  final: null,
};

/**
 * Los encabezados de ronda son `sticky` para que se sepa qué columna se está
 * mirando al scrollear un cuadro largo. Sin `z-index` las tarjetas —que vienen
 * después en el DOM y crean su propio contexto de apilado por la animación— se
 * dibujan ENCIMA del encabezado pegado, y se lee "URSEMIFINALES".
 */
describe('KnockoutView — encabezados de ronda', () => {
  it('cada encabezado sticky se apila por encima de las tarjetas', () => {
    const { container } = render(
      <KnockoutView knockout={emptyBracket} teams={teams} onBack={vi.fn()} />,
    );

    // Se afirma sobre TODOS los sticky del cuadro, no sobre una lista de
    // nombres: así un encabezado nuevo queda cubierto sin tocar este test.
    const pegados = Array.from(container.querySelectorAll('.sticky'));

    expect(pegados.length).toBeGreaterThan(0);
    for (const encabezado of pegados) {
      expect(encabezado.className).toContain('z-10');
    }
  });
});
