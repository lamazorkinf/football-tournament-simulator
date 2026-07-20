import { describe, it, expect } from 'vitest';
import { escapeOrValue } from '../supabase';

describe('escapeOrValue', () => {
  it('envuelve valores simples entre comillas dobles', () => {
    expect(escapeOrValue('arg')).toBe('"arg"');
  });

  it('preserva comas y paréntesis como literales dentro de las comillas', () => {
    // Sin escapar, la coma partiría el filtro .or() de PostgREST.
    expect(escapeOrValue('a,b')).toBe('"a,b"');
    expect(escapeOrValue('team(1)')).toBe('"team(1)"');
  });

  it('escapa comillas dobles y backslashes internos', () => {
    expect(escapeOrValue('a"b')).toBe('"a\\"b"');
    expect(escapeOrValue('a\\b')).toBe('"a\\\\b"');
  });
});
