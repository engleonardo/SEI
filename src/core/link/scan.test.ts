import { describe, expect, it } from 'vitest';
import { findProcessNumbers, snippetFor } from './scan';

const PROCESS = '23541.040441/2026-70';
const OTHER = '08660.018176/2014-60';

describe('busca de número SEI no comentário', () => {
  it('encontra números no formato do SEI', () => {
    expect(findProcessNumbers(`SEI: ${PROCESS}\nNome: Ana`)).toEqual([PROCESS]);
    expect(findProcessNumbers(`Processo ${PROCESS} e ${OTHER}`)).toEqual([PROCESS, OTHER]);
  });

  it('não duplica e ignora formatos parecidos', () => {
    expect(findProcessNumbers(`${PROCESS} ${PROCESS}`)).toEqual([PROCESS]);
    expect(findProcessNumbers('12345.678901/2026')).toEqual([]);
    expect(findProcessNumbers('doc 12345678901')).toEqual([]);
    expect(findProcessNumbers('')).toEqual([]);
  });

  it('extrai a linha onde o número aparece', () => {
    const text = `Nome: Ana\nSEI: ${PROCESS}\nCargo: Técnica`;
    expect(snippetFor(text, PROCESS)).toBe(`SEI: ${PROCESS}`);
  });
});
