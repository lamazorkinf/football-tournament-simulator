import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EnergyMeter } from '../EnergyMeter';

describe('EnergyMeter', () => {
  it('expone la energía como medidor accesible', () => {
    render(<EnergyMeter energy={72} label="Bélgica" />);
    const meter = screen.getByRole('meter', { name: /Bélgica/ });
    expect(meter).toHaveAttribute('aria-valuenow', '72');
  });

  it('muestra el porcentaje en texto para quien no distingue el color', () => {
    render(<EnergyMeter energy={72} label="Bélgica" />);
    expect(screen.getByText('72%')).toBeInTheDocument();
  });

  it('redondea sin mostrar decimales', () => {
    render(<EnergyMeter energy={72.4} label="Bélgica" />);
    expect(screen.getByText('72%')).toBeInTheDocument();
  });
});
