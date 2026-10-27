import { describe, expect, it } from 'vitest';
import {
  extractProcessNumber,
  isSameProcess,
  normalizeProcessNumber,
  sanitizeProcessForQuery,
} from './process';

describe('process number', () => {
  it('normaliza o formato padrão do SEI', () => {
    expect(normalizeProcessNumber(' 11111.111111/2024-60 ')).toBe('11111.111111/2024-60');
  });

  it('normaliza formatos alternativos', () => {
    expect(normalizeProcessNumber('11111.111111/2024')).toBe('11111.111111/2024');
    expect(normalizeProcessNumber('12345/678901/2025-12')).toBe('12345/678901/2025-12');
  });

  it('não confunde datas e números curtos com processo', () => {
    expect(normalizeProcessNumber('26/10/2026')).toBeNull();
    expect(normalizeProcessNumber('12345')).toBeNull();
    expect(normalizeProcessNumber('')).toBeNull();
    expect(normalizeProcessNumber(null)).toBeNull();
  });

  it('extrai processo de textos com ruído', () => {
    expect(extractProcessNumber('Processo nº 11111.111111/2024-60 — assunto')).toBe(
      '11111.111111/2024-60',
    );
    expect(extractProcessNumber('sem número aqui')).toBeNull();
  });

  it('compara e sanitiza para busca', () => {
    expect(isSameProcess(' 123 ', '123')).toBe(true);
    expect(sanitizeProcessForQuery('123"\\abc')).toBe('123abc');
  });
});
