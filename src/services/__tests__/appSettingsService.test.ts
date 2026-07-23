import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appSettingsService } from '../appSettingsService';
import { db } from '../../lib/supabaseNormalized';
import * as supaLib from '../../lib/supabase';
import { DEFAULT_CONFIG } from '../../store/useConfigStore';

/** Query builder encadenable que resuelve `maybeSingle` con lo indicado. */
function selectBuilder(result: { data?: unknown; error?: unknown }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null })),
  };
  return builder;
}

function writeBuilder(error: unknown = null) {
  const builder = {
    upsert: vi.fn(async () => ({ error })),
    update: vi.fn(() => ({ eq: vi.fn(async () => ({ error })) })),
  };
  return builder;
}

function mockTable(builder: unknown) {
  return vi.spyOn(db, 'app_settings').mockReturnValue(builder as never);
}

describe('appSettingsService.loadSettings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
  });

  it('mapea la fila de la DB al shape del dominio', async () => {
    mockTable(
      selectBuilder({
        data: {
          engine_config: DEFAULT_CONFIG,
          favorite_team_ids: ['arg', 'bra'],
          scanlines: false,
        },
      }),
    );

    const settings = await appSettingsService.loadSettings();

    expect(settings).toEqual({
      engineConfig: DEFAULT_CONFIG,
      favoriteTeamIds: ['arg', 'bra'],
      scanlines: false,
    });
  });

  it('sin fila devuelve null (primer arranque)', async () => {
    mockTable(selectBuilder({ data: null }));

    expect(await appSettingsService.loadSettings()).toBeNull();
  });

  it('columnas nulas caen a los defaults en vez de romper', async () => {
    mockTable(
      selectBuilder({
        data: { engine_config: DEFAULT_CONFIG, favorite_team_ids: null, scanlines: null },
      }),
    );

    const settings = await appSettingsService.loadSettings();

    expect(settings?.favoriteTeamIds).toEqual([]);
    expect(settings?.scanlines).toBe(true);
  });

  it('propaga el error de la base', async () => {
    mockTable(selectBuilder({ error: new Error('boom') }));

    await expect(appSettingsService.loadSettings()).rejects.toThrow('boom');
  });

  it('sin Supabase configurado no consulta', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(false);
    const table = mockTable(selectBuilder({ data: null }));

    expect(await appSettingsService.loadSettings()).toBeNull();
    expect(table).not.toHaveBeenCalled();
  });
});

describe('appSettingsService.saveSettings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
  });

  it('un patch con la config hace upsert de la fila singleton', async () => {
    const builder = writeBuilder();
    mockTable(builder);

    await appSettingsService.saveSettings({ engineConfig: DEFAULT_CONFIG });

    expect(builder.upsert).toHaveBeenCalledWith(
      { id: 'global', engine_config: DEFAULT_CONFIG },
      { onConflict: 'id' },
    );
  });

  it('un patch parcial actualiza sólo sus columnas', async () => {
    const builder = writeBuilder();
    mockTable(builder);

    await appSettingsService.saveSettings({ favoriteTeamIds: ['arg'] });

    expect(builder.upsert).not.toHaveBeenCalled();
    expect(builder.update).toHaveBeenCalledWith({ favorite_team_ids: ['arg'] });
  });

  it('un patch vacío no llama a la base', async () => {
    const builder = writeBuilder();
    mockTable(builder);

    await appSettingsService.saveSettings({});

    expect(builder.upsert).not.toHaveBeenCalled();
    expect(builder.update).not.toHaveBeenCalled();
  });

  it('propaga el error de la base', async () => {
    mockTable(writeBuilder(new Error('boom')));

    await expect(
      appSettingsService.saveSettings({ engineConfig: DEFAULT_CONFIG }),
    ).rejects.toThrow('boom');
  });
});
