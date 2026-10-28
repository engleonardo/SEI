import { describe, expect, it } from 'vitest';
import { LINK_WARNING, addLink, hasLink, parseLinks, removeLink, renderLinks, stripLinks } from './marker';

const PROCESS = '08660.018176/2014-60';
const OTHER = '12345.678901/2025-12';
const BLOCK = `---\n${LINK_WARNING}`;

describe('link marker', () => {
  it('extrai vínculos de linhas SEI, inclusive múltiplos e duplicados', () => {
    const description = `${BLOCK}\nSEI ${PROCESS}\nSEI ${OTHER}\nSEI ${PROCESS}\nTexto livre`;
    expect(parseLinks(description)).toEqual([PROCESS, OTHER]);
  });

  it('ignora SEI no meio de uma frase', () => {
    expect(parseLinks('Falar sobre o SEI 08660.018176/2014-60 no texto')).toEqual([]);
  });

  it('adiciona o vínculo no fim com separador e aviso', () => {
    expect(addLink('Texto existente', PROCESS)).toBe(
      `Texto existente\n\n${BLOCK}\nSEI ${PROCESS}`,
    );
    expect(addLink('', PROCESS)).toBe(`${BLOCK}\nSEI ${PROCESS}`);
  });

  it('não duplica vínculo existente', () => {
    const original = `Texto\n\n${BLOCK}\nSEI ${PROCESS}`;
    expect(addLink(original, PROCESS)).toBe(original);
  });

  it('remove apenas o vínculo pedido e preserva o resto', () => {
    const original = `Descrição\n\n${BLOCK}\nSEI ${PROCESS}\nSEI ${OTHER}`;
    expect(removeLink(original, PROCESS)).toBe(`Descrição\n\n${BLOCK}\nSEI ${OTHER}`);
  });

  it('remove o bloco inteiro quando é o único vínculo', () => {
    expect(removeLink(`${BLOCK}\nSEI ${PROCESS}`, PROCESS)).toBe('');
    expect(removeLink(`Texto\n\n${BLOCK}\nSEI ${PROCESS}`, PROCESS)).toBe('Texto');
  });

  it('remove o bloco da descrição exibida', () => {
    expect(stripLinks(`Descrição\n\n${BLOCK}\nSEI ${PROCESS}\nSEI ${OTHER}`)).toBe('Descrição');
  });

  it('limpa o formato antigo com link do processo', () => {
    const legacy = `Descrição\nSEI ${PROCESS}\nProcesso SEI: http://sei.test/x`;
    expect(stripLinks(legacy)).toBe('Descrição');
    expect(addLink(legacy, PROCESS)).toBe(`Descrição\n\n${BLOCK}\nSEI ${PROCESS}`);
  });

  it('mantém um separador que faz parte do texto do usuário', () => {
    expect(stripLinks('Antes\n\n---\nDepois')).toBe('Antes\n\n---\nDepois');
  });

  it('renderiza vários vínculos sem duplicar', () => {
    expect(renderLinks('Texto', [PROCESS, OTHER, PROCESS])).toBe(
      `Texto\n\n${BLOCK}\nSEI ${PROCESS}\nSEI ${OTHER}`,
    );
  });

  it('identifica vínculo existente', () => {
    expect(hasLink(`Texto\nSEI ${PROCESS}`, PROCESS)).toBe(true);
    expect(hasLink('Texto', PROCESS)).toBe(false);
  });

  it('rejeita número inválido', () => {
    expect(() => addLink('Texto', '123')).toThrow();
  });
});
