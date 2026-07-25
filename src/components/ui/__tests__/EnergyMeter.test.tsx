import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EnergyMeter } from '../EnergyMeter';
import { useConfigStore, DEFAULT_CONFIG } from '../../../store/useConfigStore';

describe('EnergyMeter', () => {
  afterEach(() => {
    useConfigStore.setState({ config: DEFAULT_CONFIG });
  });

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

  // Regresión: el piso salía de DEFAULT_FATIGUE (congelado), no del config en
  // vivo. Con el piso bajado desde Ajustes, aria-valuemin debía moverse con
  // él — si se hubiera quedado fijo en 60, este aserto habría fallado (y con
  // una energía de 50, aria-valuenow habría quedado por debajo de
  // aria-valuemin, un estado ARIA inválido).
  it('usa el piso de energía configurado en vivo, no el default congelado', () => {
    useConfigStore.getState().updateFatigue({ energyMin: 40 });
    render(<EnergyMeter energy={50} label="Bélgica" />);
    const meter = screen.getByRole('meter', { name: /Bélgica/ });
    expect(meter).toHaveAttribute('aria-valuemin', '40');
    expect(meter).toHaveAttribute('aria-valuenow', '50');
  });
});
