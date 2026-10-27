import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectPageKind, detectSeiVersion } from './detect';
import { findProcessNumber, findProcessSpecification } from './process-number';
import { findCommandBar, findProcessRows, parseTooltip } from './rows';

function fixture(name: string): Document {
  const path = join(process.cwd(), 'src', 'test', 'fixtures', name);
  return new DOMParser().parseFromString(readFileSync(path, 'utf8'), 'text/html');
}

describe('SEI content pages', () => {
  it('encontra o número pelo script infraArvoreNo (SEI 4.x)', () => {
    const doc = fixture('sei-content-v4.html');
    expect(findProcessNumber(doc)).toBe('08660.018176/2014-60');
    expect(findProcessSpecification(doc)).toBe('Aquisição de material de escritório');
  });

  it('encontra o número pelo cabeçalho (SEI 3.x)', () => {
    const doc = fixture('sei-content-v3.html');
    expect(findProcessNumber(doc)).toBe('12345.678901/2025-12');
  });

  it('detecta a página de conteúdo e a versão', () => {
    const v4 = fixture('sei-content-v4.html');
    expect(detectPageKind(v4, 'https://sei.exemplo.gov.br/sei/controlador.php?acao=procedimento_visualizar')).toBe(
      'process-content',
    );
    expect(detectSeiVersion(v4)).toBe('v4');

    const v3 = fixture('sei-content-v3.html');
    expect(detectSeiVersion(v3)).toBe('v3');
  });

  it('detecta a página de lista', () => {
    const doc = fixture('sei-list-v4.html');
    expect(detectPageKind(doc, 'https://sei.exemplo.gov.br/sei/controlador.php?acao=procedimento_controlar')).toBe(
      'process-list',
    );
    expect(detectPageKind(doc, 'https://sei.exemplo.gov.br/sei/controlador.php?acao=procedimento_trabalhar')).toBe(
      'process-list',
    );
  });
});

describe('SEI process list', () => {
  it('encontra as linhas e extrai número e especificação', () => {
    const doc = fixture('sei-list-v4.html');
    const rows = findProcessRows(doc);
    expect(rows).toHaveLength(3);

    const first = rows[0];
    expect(first).toBeDefined();
    expect(first?.querySelector('a')?.textContent?.trim()).toBe('08660.018176/2014-60');
    expect(first?.querySelector('a')?.getAttribute('class')).toContain('processoNaoVisualizado');
  });

  it('encontra a barra de comandos', () => {
    const doc = fixture('sei-list-v4.html');
    expect(findCommandBar(doc)?.id).toBe('divComandos');
  });

  it('faz parse do tooltip do SEI', () => {
    expect(
      parseTooltip("infraTooltipMostrar('Aquisição de material','Processo Administrativo')"),
    ).toEqual({
      specification: 'Aquisição de material',
      processType: 'Processo Administrativo',
    });
    expect(parseTooltip(null)).toEqual({ specification: '', processType: '' });
  });
});
