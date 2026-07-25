import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
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

  // Regresión: `getEngineConfig()` es un getter no reactivo — leerlo no
  // suscribe al componente. Si el medidor lo usara en vez de un selector de
  // `useConfigStore`, mover "Energía mínima" en Ajustes (Task 9) con este
  // medidor ya montado no cambiaría nada en pantalla hasta recargar o
  // remontar, lo que se lee como un control roto.
  it('sigue el piso de energía cuando el config cambia con el medidor ya montado', () => {
    render(<EnergyMeter energy={50} label="Bélgica" />);
    const meter = screen.getByRole('meter', { name: /Bélgica/ });
    expect(meter).toHaveAttribute('aria-valuemin', '60');

    act(() => {
      useConfigStore.getState().updateFatigue({ energyMin: 40 });
    });

    expect(meter).toHaveAttribute('aria-valuemin', '40');
  });
});
