import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EngineSettings } from '../EngineSettings';
import { useConfigStore, DEFAULT_CONFIG } from '../../../store/useConfigStore';

// Sin este mock, updateFatigue() deja armada una escritura real a Supabase
// (mismo proyecto que producción): ver src/store/__tests__/useConfigStore.test.ts.
vi.mock('../../../lib/persistSettings', () => ({
  queueSettingsSave: vi.fn(),
  flushSettingsSave: vi.fn(),
}));

describe('EngineSettings — Cansancio y oficio', () => {
  afterEach(() => {
    useConfigStore.setState({ config: DEFAULT_CONFIG });
  });

  it('muestra la línea de contexto de la calibración', () => {
    render(<EngineSettings />);
    expect(
      screen.getByText(/Calibrado con 20\.000 Mundiales simulados/),
    ).toBeInTheDocument();
  });

  it('el interruptor de cansancio arranca activado (default) y se puede apagar', () => {
    render(<EngineSettings />);
    // Único switch de la pantalla: EngineSettings no incluye el de scanlines
    // (ese vive en SettingsHub).
    const toggle = screen.getByRole('switch');
    expect(screen.getByText('Activar cansancio')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(toggle);
    expect(useConfigStore.getState().config.fatigue.enabled).toBe(false);
  });

  it('mover el oficio llama a updateFatigue con clutchGain', () => {
    render(<EngineSettings />);
    const slider = screen.getByLabelText(/Oficio en partidos exigentes/);
    fireEvent.change(slider, { target: { value: '0.35' } });
    expect(useConfigStore.getState().config.fatigue.clutchGain).toBe(0.35);
  });

  // clutchMultiplier devuelve 1 (sin efecto) cuando fatigue.enabled es false
  // (core/energy.ts): el slider de oficio no debería seguir mostrándose
  // operativo como si moverlo hiciera algo.
  it('el slider de oficio se deshabilita cuando el cansancio está apagado', () => {
    useConfigStore.getState().updateFatigue({ enabled: false });
    render(<EngineSettings />);
    const slider = screen.getByLabelText(/Oficio en partidos exigentes/);
    expect(slider).toBeDisabled();
  });

  it.each([
    [0.1, 'Sutil'],
    [0.2, 'Equilibrado'],
    [0.3, 'Marcado'],
    [0.4, 'Dominante'],
  ])('etiqueta cualitativa del oficio en %s es %s', (value, label) => {
    useConfigStore.getState().updateFatigue({ clutchGain: value });
    render(<EngineSettings />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('mover la energía mínima llama a updateFatigue con energyMin', () => {
    render(<EngineSettings />);
    const slider = screen.getByLabelText(/Energía mínima/);
    fireEvent.change(slider, { target: { value: '40' } });
    expect(useConfigStore.getState().config.fatigue.energyMin).toBe(40);
  });

  it('mover la recuperación llama a updateFatigue con recovery', () => {
    render(<EngineSettings />);
    const slider = screen.getByLabelText(/Recuperación por jornada/);
    fireEvent.change(slider, { target: { value: '8' } });
    expect(useConfigStore.getState().config.fatigue.recovery).toBe(8);
  });
});
