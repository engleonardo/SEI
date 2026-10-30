import { describe, expect, it } from 'vitest';
import { parseRulesImport, RulesImportError } from './rule-import';
import type { Rule } from './rules';

const rule: Rule = {
  id: 'rule-1',
  name: 'Concluído aplica etiqueta',
  enabled: true,
  boardId: 'board-1',
  trigger: { type: 'enterList', listId: 'list-1' },
  actions: [{ type: 'addLabel', labelId: 'label-1' }],
};

describe('importação de regras', () => {
  it('aceita o envelope exportado pelo SEI Flow', () => {
    const json = JSON.stringify({ app: 'sei-flow-rules', version: 1, rules: [rule] });
    expect(parseRulesImport(json)).toEqual([rule]);
  });

  it('aceita backup completo e lista pura', () => {
    const backup = JSON.stringify({ app: 'sei-flow', rules: [rule] });
    expect(parseRulesImport(backup)).toEqual([rule]);

    const list = JSON.stringify([rule]);
    expect(parseRulesImport(list)).toEqual([rule]);
  });

  it('gera id quando a regra importada não tem', () => {
    const withoutId = { ...rule, id: '' };
    const [imported] = parseRulesImport(JSON.stringify({ rules: [withoutId] }));
    expect(imported?.id).toBeTruthy();
    expect(imported?.name).toBe(rule.name);
  });

  it('descarta itens que não parecem regra', () => {
    const json = JSON.stringify({ rules: [rule, { foo: 'bar' }, null] });
    expect(parseRulesImport(json)).toHaveLength(1);
  });

  it('rejeita conteúdo inválido', () => {
    expect(() => parseRulesImport('')).toThrow(RulesImportError);
    expect(() => parseRulesImport('{')).toThrow(RulesImportError);
    expect(() => parseRulesImport(JSON.stringify({ app: 'outro', rules: [rule] }))).toThrow(
      RulesImportError,
    );
    expect(() => parseRulesImport(JSON.stringify({ rules: 'nada' }))).toThrow(RulesImportError);
    expect(() => parseRulesImport(JSON.stringify({ rules: [] }))).toThrow(RulesImportError);
  });
});
