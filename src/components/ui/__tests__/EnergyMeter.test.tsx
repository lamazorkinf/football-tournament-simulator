import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { EnergyMeter } from '../EnergyMeter';
import { useConfigStore, DEFAULT_CONFIG } from '../../../store/useConfigStore';

// Sin este mock, updateFatigue() deja armada una escritura real a Supabase
// (mismo proyecto que producción): ver src/store/__tests__/useConfigStore.test.ts.
vi.mock('../../../lib/persistSettings', () => ({
  queueSettingsSave: vi.fn(),
  flushSettingsSave: vi.fn(),
}));

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

  // Regresión: los umbrales de color eran absolutos (85/72) sobre una escala
  // 0-100, sin relación con el piso configurable (40-90). Con el piso en 90,
  // toda energía alcanzable (90-100) quedaba por encima de 85 y se veía
  // siempre verde, sin importar qué tan cerca del piso estuviera.
  it('con el piso alto no muestra verde cerca del propio piso', () => {
    useConfigStore.getState().updateFatigue({ energyMin: 90 });
    const { container } = render(<EnergyMeter energy={92} label="Bélgica" />);
    // 92 está a sólo 2 de los 10 puntos útiles por encima del piso (90): la
    // posición relativa es baja, así que no debería pintarse de verde.
    expect(container.querySelector('.bg-led')).toBeNull();
    expect(container.querySelector('.bg-loss')).not.toBeNull();
  });

  // Mismo bug, en la otra punta: con el piso en 40 la barra se ponía roja en
  // un rango (65 de 100, a mitad de camino entre el piso y el máximo) que esa
  // misma configuración considera sano.
  it('con el piso bajo no muestra rojo a mitad del rango útil', () => {
    useConfigStore.getState().updateFatigue({ energyMin: 40 });
    const { container } = render(<EnergyMeter energy={65} label="Bélgica" />);
    expect(container.querySelector('.bg-loss')).toBeNull();
  });
});
