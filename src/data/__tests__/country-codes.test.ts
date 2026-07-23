import { describe, it, expect, vi } from 'vitest';
import { COUNTRY_CODES, getFlagUrl } from '../country-codes';
import teamsData from '../teams.json';

describe('getFlagUrl', () => {
  it('pide el ancho que cubre el doble del tamaño de render', () => {
    expect(getFlagUrl('arg', 16)).toBe('https://flagcdn.com/w40/ar.png');
    expect(getFlagUrl('arg', 24)).toBe('https://flagcdn.com/w80/ar.png');
    expect(getFlagUrl('arg', 32)).toBe('https://flagcdn.com/w80/ar.png');
    expect(getFlagUrl('arg', 48)).toBe('https://flagcdn.com/w160/ar.png');
    expect(getFlagUrl('arg', 64)).toBe('https://flagcdn.com/w160/ar.png');
  });

  it('usa el ancho de 64px cuando no se pide un tamaño', () => {
    expect(getFlagUrl('bra')).toBe('https://flagcdn.com/w160/br.png');
  });

  it('resuelve los cinco códigos que FlagsAPI no servía', () => {
    expect(getFlagUrl('eng')).toBe('https://flagcdn.com/w160/gb-eng.png');
    expect(getFlagUrl('wal')).toBe('https://flagcdn.com/w160/gb-wls.png');
    expect(getFlagUrl('sco')).toBe('https://flagcdn.com/w160/gb-sct.png');
    expect(getFlagUrl('nir')).toBe('https://flagcdn.com/w160/gb-nir.png');
    expect(getFlagUrl('kos')).toBe('https://flagcdn.com/w160/xk.png');
  });

  it('devuelve el formato plano w{N}, no el ondeado WxH', () => {
    const urls = Object.keys(COUNTRY_CODES).map((id) => getFlagUrl(id, 24));
    expect(urls.every((url) => /^https:\/\/flagcdn\.com\/w\d+\/[a-z-]+\.png$/.test(url))).toBe(true);
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
