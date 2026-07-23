import { describe, it, expect, vi } from 'vitest';
import { COUNTRY_CODES, getFlagUrl } from '../country-codes';
import teamsData from '../teams.json';

describe('getFlagUrl', () => {
  it('genera la URL de flagcdn en el ratio 4:3 del tamaño pedido', () => {
    expect(getFlagUrl('arg', 16)).toBe('https://flagcdn.com/16x12/ar.png');
    expect(getFlagUrl('arg', 24)).toBe('https://flagcdn.com/24x18/ar.png');
    expect(getFlagUrl('arg', 32)).toBe('https://flagcdn.com/32x24/ar.png');
    expect(getFlagUrl('arg', 48)).toBe('https://flagcdn.com/48x36/ar.png');
    expect(getFlagUrl('arg', 64)).toBe('https://flagcdn.com/64x48/ar.png');
  });

  it('usa 64x48 cuando no se pide un tamaño', () => {
    expect(getFlagUrl('bra')).toBe('https://flagcdn.com/64x48/br.png');
  });

  it('resuelve los cinco códigos que FlagsAPI no servía', () => {
    expect(getFlagUrl('eng')).toBe('https://flagcdn.com/64x48/gb-eng.png');
    expect(getFlagUrl('wal')).toBe('https://flagcdn.com/64x48/gb-wls.png');
    expect(getFlagUrl('sco')).toBe('https://flagcdn.com/64x48/gb-sct.png');
    expect(getFlagUrl('nir')).toBe('https://flagcdn.com/64x48/gb-nir.png');
    expect(getFlagUrl('kos')).toBe('https://flagcdn.com/64x48/xk.png');
  });

  it('devuelve cadena vacía y avisa por consola si el equipo no tiene código', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getFlagUrl('zzz')).toBe('');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('COUNTRY_CODES', () => {
  it('cubre a todos los equipos de teams.json', () => {
    const sinCodigo = (teamsData as { id: string; name: string }[])
      .filter((team) => !COUNTRY_CODES[team.id])
      .map((team) => `${team.id} (${team.name})`);
    expect(sinCodigo).toEqual([]);
  });

  it('usa códigos en minúscula, que es lo que espera flagcdn', () => {
    const conMayusculas = Object.entries(COUNTRY_CODES)
      .filter(([, code]) => code !== code.toLowerCase())
      .map(([id, code]) => `${id}: ${code}`);
    expect(conMayusculas).toEqual([]);
  });
});
