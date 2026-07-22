import { describe, it, expect } from 'vitest';
import { reconcile } from '../syncReconcile';
import type { Cycle } from '../../types';

// Cycle mínimo: reconcile solo mira el id; el resto no importa para la lógica.
const cyc = (id: string): Cycle => ({ id } as unknown as Cycle);

describe('reconcile', () => {
  it('DB más nueva que el último sync → gana DB', () => {
    const r = reconcile({
      local: cyc('t1'),
      localMeta: { syncedUpdatedAt: '2026-07-22T10:00:00Z', dirty: false },
      db: cyc('t1'),
      dbUpdatedAt: '2026-07-22T11:00:00Z',
    });
    expect(r.action).toBe('use-db');
    expect(r.winner?.id).toBe('t1');
    expect(r.syncedUpdatedAt).toBe('2026-07-22T11:00:00Z');
  });

  it('DB sin cambios desde el último sync y local dirty → gana local (push)', () => {
    const r = reconcile({
      local: cyc('t1'),
      localMeta: { syncedUpdatedAt: '2026-07-22T10:00:00Z', dirty: true },
      db: cyc('t1'),
      dbUpdatedAt: '2026-07-22T10:00:00Z',
    });
    expect(r.action).toBe('push-local');
    expect(r.winner?.id).toBe('t1');
  });

  it('DB sin cambios y local NO dirty → gana DB (en sync, canónico)', () => {
    const r = reconcile({
      local: cyc('t1'),
      localMeta: { syncedUpdatedAt: '2026-07-22T10:00:00Z', dirty: false },
      db: cyc('t1'),
      dbUpdatedAt: '2026-07-22T10:00:00Z',
    });
    expect(r.action).toBe('use-db');
  });

  it('sin copia en DB (offline) y local presente → usar local offline', () => {
    const r = reconcile({
      local: cyc('t1'),
      localMeta: { syncedUpdatedAt: '2026-07-22T10:00:00Z', dirty: true },
      db: null,
      dbUpdatedAt: null,
    });
    expect(r.action).toBe('use-local-offline');
    expect(r.winner?.id).toBe('t1');
    expect(r.syncedUpdatedAt).toBe('2026-07-22T10:00:00Z');
  });

  it('DB presente, sin local → usar DB', () => {
    const r = reconcile({ local: null, localMeta: null, db: cyc('t1'), dbUpdatedAt: '2026-07-22T10:00:00Z' });
    expect(r.action).toBe('use-db');
    expect(r.winner?.id).toBe('t1');
  });

  it('sin DB ni local → crear nuevo', () => {
    const r = reconcile({ local: null, localMeta: null, db: null, dbUpdatedAt: null });
    expect(r.action).toBe('create-new');
    expect(r.winner).toBeNull();
  });

  it('primera carga (syncedUpdatedAt null, no dirty) con DB → gana DB', () => {
    const r = reconcile({
      local: cyc('t1'),
      localMeta: { syncedUpdatedAt: null, dirty: false },
      db: cyc('t1'),
      dbUpdatedAt: '2026-07-22T10:00:00Z',
    });
    expect(r.action).toBe('use-db');
  });

  it('legacy sin updated_at en DB y local dirty → push-local', () => {
    const r = reconcile({
      local: cyc('t1'),
      localMeta: { syncedUpdatedAt: null, dirty: true },
      db: cyc('t1'),
      dbUpdatedAt: null,
    });
    expect(r.action).toBe('push-local');
  });
});
