import { describe, expect, it } from 'vitest';
import { addLink, hasLink, parseLinks, removeLink, stripLinks } from './marker';

const PROCESS = '11111.111111/2024-60';
const OTHER = '22222.222222/2025-12';

describe('link marker', () => {
  it('extrai vínculos de linhas SEI, inclusive múltiplos e duplicados', () => {
    const description = `SEI ${PROCESS}\nSEI ${OTHER}\nSEI ${PROCESS}\nTexto livre`;
    expect(parseLinks(description)).toEqual([PROCESS, OTHER]);
  });

  it('ignora SEI no meio de uma frase', () => {
    expect(parseLinks('Falar sobre o SEI 11111.111111/2024-60 no texto')).toEqual([]);
  });

  it('adiciona o vínculo no topo sem perder a descrição', () => {
    expect(addLink('Texto existente', PROCESS)).toBe(`SEI ${PROCESS}\nTexto existente`);
    expect(addLink('', PROCESS)).toBe(`SEI ${PROCESS}`);
  });

  it('não duplica vínculo existente', () => {
    const original = `SEI ${PROCESS}\nTexto`;
    expect(addLink(original, PROCESS)).toBe(original);
  });

  it('remove apenas o vínculo pedido e preserva o resto', () => {
    const original = `SEI ${PROCESS}\nSEI ${OTHER}\n\nDescrição`;
    expect(removeLink(original, PROCESS)).toBe(`SEI ${OTHER}\n\nDescrição`);
  });

  it('remove o vínculo quando é a única linha', () => {
    expect(removeLink(`SEI ${PROCESS}`, PROCESS)).toBe('');
  });

  it('remove marcadores da descrição exibida', () => {
    expect(stripLinks(`SEI ${PROCESS}\nSEI ${OTHER}\n\nDescrição`)).toBe('Descrição');
  });

  it('identifica vínculo existente', () => {
    expect(hasLink(`SEI ${PROCESS}\nTexto`, PROCESS)).toBe(true);
    expect(hasLink('Texto', PROCESS)).toBe(false);
  });

  it('rejeita número inválido', () => {
    expect(() => addLink('Texto', '123')).toThrow();
  });
});
