import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmDialog } from '../ConfirmDialog';

function setup(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Borrar torneo"
      description="Se pierden todos los partidos jugados."
      confirmLabel="Borrar"
      onConfirm={onConfirm}
      {...overrides}
    />
  );
  return { onConfirm, onOpenChange };
}

describe('ConfirmDialog', () => {
  it('muestra título y descripción cuando está abierto', () => {
    setup();
    expect(screen.getByText('Borrar torneo')).toBeInTheDocument();
    expect(screen.getByText('Se pierden todos los partidos jugados.')).toBeInTheDocument();
  });

  it('ejecuta onConfirm y cierra al confirmar', async () => {
    const { onConfirm, onOpenChange } = setup();
    await userEvent.click(screen.getByRole('button', { name: /borrar/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('NO ejecuta onConfirm al cancelar', async () => {
    const { onConfirm, onOpenChange } = setup();
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('NO ejecuta onConfirm al cerrar con Escape', async () => {
    const { onConfirm, onOpenChange } = setup();
    await userEvent.keyboard('{Escape}');
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('no renderiza nada cuando open es false', () => {
    setup({ open: false });
    expect(screen.queryByText('Borrar torneo')).not.toBeInTheDocument();
  });

  it('mantiene el diálogo abierto mientras onConfirm está pendiente', async () => {
    let resolve: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Regenerar sorteo"
        confirmLabel="Regenerar"
        onConfirm={onConfirm}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /regenerar/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    resolve();
    await screen.findByRole('button', { name: /regenerar/i });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('mantiene el diálogo abierto y no rompe cuando onConfirm rechaza', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onConfirm = vi.fn().mockRejectedValue(new Error('sin red'));
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Eliminar torneo"
        confirmLabel="Eliminar"
        onConfirm={onConfirm}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /eliminar/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    // El diálogo NO se cierra: la acción destructiva falló.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // El botón vuelve a estar habilitado para reintentar.
    expect(screen.getByRole('button', { name: /eliminar/i })).not.toBeDisabled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('Escape no cierra el diálogo mientras onConfirm está pendiente', async () => {
    let resolve: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Regenerar sorteo"
        confirmLabel="Regenerar"
        onConfirm={onConfirm}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /regenerar/i }));
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    resolve();
    await screen.findByRole('button', { name: /regenerar/i });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
