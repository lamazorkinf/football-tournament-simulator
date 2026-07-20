/**
 * Los stores usan el middleware `persist` de Zustand, que necesita
 * localStorage. En entorno Node no existe, así que se instala un stub en
 * memoria en lugar de arrastrar jsdom solo para esto.
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

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
