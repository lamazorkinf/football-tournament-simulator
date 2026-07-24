import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useFocusTrap } from '../useFocusTrap';

function Modal({ open }: { open: boolean }) {
  const ref = useFocusTrap<HTMLDivElement>(open);
  if (!open) return null;
  return (
    <div ref={ref} tabIndex={-1}>
      <button>Primero</button>
      <button>Medio</button>
      <button>Último</button>
    </div>
  );
}

function App() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      <button>Fondo</button>
      <button onClick={() => setOpen(false)}>Cerrar</button>
      <Modal open={open} />
    </>
  );
}

/** Abre el modal dejando el foco en el botón que lo abrió. */
function abrir() {
  const boton = screen.getByText('Abrir');
  boton.focus();
  act(() => boton.click());
  return boton;
}

describe('useFocusTrap', () => {
  it('al abrir lleva el foco adentro', () => {
    render(<App />);
    abrir();

    expect(screen.getByText('Primero')).toHaveFocus();
  });

  it('Tab desde el último vuelve al primero', () => {
    render(<App />);
    abrir();

    screen.getByText('Último').focus();
    fireEvent.keyDown(document, { key: 'Tab' });

    expect(screen.getByText('Primero')).toHaveFocus();
  });

  it('Shift+Tab desde el primero va al último', () => {
    render(<App />);
    abrir();

    screen.getByText('Primero').focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    expect(screen.getByText('Último')).toHaveFocus();
  });

  it('en el medio del recorrido no interfiere', () => {
    render(<App />);
    abrir();

    screen.getByText('Primero').focus();
    // fireEvent devuelve false si alguien llamó preventDefault: acá el
    // navegador tiene que seguir moviendo el foco por su cuenta.
    expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(true);
  });

  it('si el foco se escapó al fondo, el Tab siguiente lo trae de vuelta', () => {
    render(<App />);
    abrir();

    screen.getByText('Fondo').focus();
    fireEvent.keyDown(document, { key: 'Tab' });

    expect(screen.getByText('Primero')).toHaveFocus();
  });

  it('al cerrar devuelve el foco a quien lo abrió', () => {
    render(<App />);
    const boton = abrir();

    act(() => screen.getByText('Cerrar').click());

    expect(boton).toHaveFocus();
  });
});
