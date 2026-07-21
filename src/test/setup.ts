import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Los stores usan el middleware `persist` de Zustand, que necesita
 * localStorage. jsdom normalmente lo provee, pero en esta combinación
 * (jsdom 29 sobre Node >=24) delega en el `localStorage` nativo de Node, que
 * sin el flag `--localstorage-file` queda como un objeto presente pero sin
 * `setItem`/`getItem` reales. Por eso la guarda no puede limitarse a
 * `typeof === 'undefined'`: hay que comprobar que el storage disponible sea
 * realmente funcional antes de confiar en él (y si no, instalar el stub en
 * memoria).
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

function isFunctionalStorage(candidate: Storage | undefined): candidate is Storage {
  return (
    typeof candidate !== 'undefined' &&
    typeof candidate.setItem === 'function' &&
    typeof candidate.getItem === 'function'
  );
}

if (!isFunctionalStorage(globalThis.localStorage)) {
  globalThis.localStorage = new MemoryStorage();
}
if (!isFunctionalStorage(globalThis.sessionStorage)) {
  globalThis.sessionStorage = new MemoryStorage();
}

afterEach(() => {
  cleanup();
});
