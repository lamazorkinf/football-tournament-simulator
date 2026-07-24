import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Encierra el foco del teclado dentro de un modal mientras está abierto y se
 * lo devuelve a quien lo abrió al cerrarse.
 *
 * Sin esto, tabular dentro de un modal termina saliendo a la página de atrás:
 * el foco se pierde entre controles que visualmente están tapados, y quien
 * navega por teclado o lector de pantalla no tiene forma de volver.
 *
 * Devuelve el ref que hay que poner en el contenedor. Conviene que ese
 * contenedor tenga `tabIndex={-1}` para poder recibir el foco cuando no tiene
 * ningún control adentro.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // El selector ya descarta lo deshabilitado y lo que está fuera del orden de
    // tabulación; queda excluir lo oculto por atributo. No se mide visibilidad
    // real (offsetParent / rects) porque depende del layout y en los modales de
    // esta app no hay controles escondidos por CSS.
    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hidden && !el.closest('[hidden]') && el.getAttribute('aria-hidden') !== 'true',
      );

    (focusables()[0] ?? container).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = list[0];
      const last = list[list.length - 1];
      const current = document.activeElement;
      const escaped = !container.contains(current);

      // Solo se interviene en los bordes (y si el foco ya se escapó): en el
      // medio del recorrido mueve el foco el navegador, no este hook.
      if (event.shiftKey && (current === first || escaped)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || escaped)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [active]);

  return ref;
}
