import { useRef } from 'react';
import type { TouchEvent } from 'react';

interface SwipeHandlers {
  onTouchStart: (e: TouchEvent<HTMLElement>) => void;
  onTouchEnd: (e: TouchEvent<HTMLElement>) => void;
}

/**
 * ¿El gesto empezó dentro de un contenedor con scroll horizontal propio?
 *
 * Si es así, el swipe es del usuario desplazando ese contenedor (p.ej. una
 * tabla de posiciones dentro de un modal), no una navegación entre tabs. Sin
 * esta comprobación, arrastrar la tabla cambiaba de región/tab y cerraba el
 * modal que se estaba leyendo.
 */
function startsInHorizontalScroll(target: EventTarget | null, boundary: HTMLElement): boolean {
  let node = target as HTMLElement | null;
  while (node && node !== boundary) {
    if (node.scrollWidth > node.clientWidth + 1) {
      const overflowX = getComputedStyle(node).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll') return true;
    }
    node = node.parentElement;
  }
  return false;
}

export function useSwipeNavigation(onPrev: () => void, onNext: () => void): SwipeHandlers {
  const start = useRef<{ x: number; y: number } | null>(null);

  return {
    onTouchStart: (e) => {
      const touch = e.touches[0];
      // Guard: gestos multitáctiles o cancelados pueden dejar la lista vacía.
      if (!touch) {
        start.current = null;
        return;
      }
      if (startsInHorizontalScroll(e.target, e.currentTarget)) {
        start.current = null;
        return;
      }
      start.current = { x: touch.clientX, y: touch.clientY };
    },
    onTouchEnd: (e) => {
      if (!start.current) return;
      const touch = e.changedTouches[0];
      if (!touch) {
        start.current = null;
        return;
      }
      const dx = touch.clientX - start.current.x;
      const dy = touch.clientY - start.current.y;
      start.current = null;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) onNext();
      else onPrev();
    },
  };
}
