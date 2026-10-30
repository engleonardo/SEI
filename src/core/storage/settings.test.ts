import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, isOriginActivated, isSeiHost } from './settings';

describe('ativação de sites do SEI', () => {
  it('reconhece hosts que começam com “sei”', () => {
    expect(isSeiHost('https://sei.ufsc.br/sei/controlador.php')).toBe(true);
    expect(isSeiHost('http://seiprocesos.orgao.gov.br')).toBe(true);
    expect(isSeiHost('https://www.sei.ufsc.br')).toBe(false);
    expect(isSeiHost('https://google.com')).toBe(false);
    expect(isSeiHost('')).toBe(false);
  });

  it('ativa automaticamente apenas quando a opção está ligada', () => {
    const enabled = { ...DEFAULT_SETTINGS, autoSeiHosts: true };
    expect(isOriginActivated('https://sei.ufsc.br/x', enabled)).toBe(true);
    expect(isOriginActivated('https://outro.gov.br', enabled)).toBe(false);
    expect(
      isOriginActivated('https://sei.ufsc.br/x', {
        ...DEFAULT_SETTINGS,
        autoSeiHosts: false,
      }),
    ).toBe(false);
  });

  it('mantém a ativação manual em qualquer host', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      activatedOrigins: ['https://processos.orgao.gov.br'],
    };
    expect(isOriginActivated('https://processos.orgao.gov.br/x', settings)).toBe(true);
    expect(isOriginActivated('https://outro.gov.br/x', settings)).toBe(false);
  });
});
