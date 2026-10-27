import { describe, expect, it } from 'vitest';
import {
  createRule,
  defaultRules,
  ruleAppliesNow,
  ruleIsConfigured,
  ruleIssue,
  ruleMatches,
  type Rule,
} from './rules';

const card = { idBoard: 'board-1', idList: 'list-1', links: ['08660.018176/2014-60'] };
const unlinked = { ...card, links: [] };

function rule(overrides: Partial<Rule> = {}): Rule {
  return createRule({ enabled: true, boardId: 'board-1', ...overrides });
}

describe('regras', () => {
  it('cria 4 regras iniciais desativadas e sem quadro', () => {
    const rules = defaultRules();
    expect(rules).toHaveLength(4);
    expect(rules.every((item) => !item.enabled)).toBe(true);
    expect(rules.every((item) => item.boardId === '')).toBe(true);
  });

  it('não aplica regras em cartões sem vínculo com o SEI', () => {
    const completed = rule({ trigger: { type: 'completed' }, actions: [{ type: 'moveToTop' }] });
    expect(ruleMatches(completed, { kind: 'completed' }, card)).toBe(true);
    expect(ruleMatches(completed, { kind: 'completed' }, unlinked)).toBe(false);
  });

  it('não aplica regras em cartões de outro quadro', () => {
    const completed = rule({ trigger: { type: 'completed' }, actions: [{ type: 'moveToTop' }] });
    expect(
      ruleMatches(completed, { kind: 'completed' }, { ...card, idBoard: 'board-2' }),
    ).toBe(false);
  });

  it('dispara ao concluir o cartão', () => {
    const completed = rule({ trigger: { type: 'completed' }, actions: [{ type: 'moveToTop' }] });
    expect(ruleMatches(completed, { kind: 'completed' }, card)).toBe(true);
    expect(ruleMatches(completed, { kind: 'updated' }, card)).toBe(false);
  });

  it('dispara ao entrar na lista configurada', () => {
    const enter = rule({
      trigger: { type: 'enterList', listId: 'list-9' },
      actions: [{ type: 'moveToTop' }],
    });
    expect(ruleMatches(enter, { kind: 'moved', toListId: 'list-9' }, card)).toBe(true);
    expect(ruleMatches(enter, { kind: 'moved', toListId: 'list-2' }, card)).toBe(false);
  });

  it('dispara ao entrar em qualquer lista', () => {
    const enter = rule({ trigger: { type: 'enterAnyList' }, actions: [{ type: 'moveToTop' }] });
    expect(ruleMatches(enter, { kind: 'moved', toListId: 'list-2' }, card)).toBe(true);
    expect(ruleMatches(enter, { kind: 'updated' }, card)).toBe(false);
  });

  it('em atualização, respeita a lista configurada', () => {
    const updated = rule({
      trigger: { type: 'updated', listId: 'list-1' },
      actions: [{ type: 'moveToTop' }],
    });
    expect(ruleMatches(updated, { kind: 'updated' }, card)).toBe(true);
    expect(ruleMatches(updated, { kind: 'updated' }, { ...card, idList: 'list-2' })).toBe(false);
  });

  it('ignora regra desativada', () => {
    const disabled = rule({ enabled: false, trigger: { type: 'completed' } });
    expect(ruleMatches(disabled, { kind: 'completed' }, card)).toBe(false);
  });

  it('bloqueia mover para duas listas diferentes', () => {
    const conflicting = rule({
      actions: [
        { type: 'moveToList', listId: 'list-1' },
        { type: 'moveToList', listId: 'list-2' },
      ],
    });
    expect(ruleIssue(conflicting)).toMatch(/duas listas/);
    expect(ruleIsConfigured(conflicting)).toBe(false);
  });

  it('aceita mover e mover para o topo na mesma regra', () => {
    const combined = rule({
      actions: [
        { type: 'addLabel', labelId: 'label-1' },
        { type: 'moveToList', listId: 'list-2' },
        { type: 'moveToTop' },
      ],
    });
    expect(ruleIssue(combined)).toBeNull();
    expect(ruleIsConfigured(combined)).toBe(true);
  });

  it('exige o quadro da regra', () => {
    expect(ruleIssue(rule({ boardId: '' }))).toMatch(/quadro da regra/);
    expect(ruleMatches(rule({ boardId: '' }), { kind: 'completed' }, card)).toBe(false);
  });

  it('exige lista de destino ao mover', () => {
    expect(ruleIssue(rule({ actions: [{ type: 'moveToList' }] }))).toMatch(/lista de destino/);
  });

  it('exige etiqueta nas ações de etiqueta', () => {
    expect(ruleIssue(rule({ actions: [{ type: 'addLabel' }] }))).toMatch(/etiqueta da ação/);
    expect(ruleIssue(rule({ actions: [{ type: 'removeLabel' }] }))).toMatch(/etiqueta da ação/);
  });

  it('exige lista no gatilho de entrada em lista', () => {
    expect(ruleIssue(rule({ trigger: { type: 'enterList' } }))).toMatch(/dispara a regra/);
  });

  it('exige pelo menos uma ação', () => {
    expect(ruleIssue(rule({ actions: [] }))).toMatch(/pelo menos uma ação/);
  });

  describe('aplicar agora', () => {
    const completedRule = rule({
      trigger: { type: 'completed' },
      actions: [{ type: 'moveToList', listId: 'list-done' }],
    });

    it('só atinge cartões já concluídos', () => {
      expect(ruleAppliesNow(completedRule, { ...card, dueComplete: true })).toBe(true);
      expect(ruleAppliesNow(completedRule, { ...card, dueComplete: false })).toBe(false);
    });

    it('só atinge cartões do quadro da regra e vinculados ao SEI', () => {
      expect(
        ruleAppliesNow(completedRule, { ...card, idBoard: 'board-2', dueComplete: true }),
      ).toBe(false);
      expect(ruleAppliesNow(completedRule, { ...unlinked, dueComplete: true })).toBe(false);
    });

    it('entrou na lista só atinge cartões que estão naquela lista', () => {
      const enter = rule({
        trigger: { type: 'enterList', listId: 'list-2' },
        actions: [{ type: 'addLabel', labelId: 'label-1' }],
      });
      expect(ruleAppliesNow(enter, { ...card, dueComplete: false })).toBe(false);
      expect(
        ruleAppliesNow(enter, { ...card, idList: 'list-2', dueComplete: false }),
      ).toBe(true);
    });

    it('atualizado respeita a lista configurada', () => {
      const updated = rule({
        trigger: { type: 'updated', listId: 'list-2' },
        actions: [{ type: 'moveToTop' }],
      });
      expect(ruleAppliesNow(updated, { ...card, dueComplete: false })).toBe(false);
      expect(
        ruleAppliesNow(updated, { ...card, idList: 'list-2', dueComplete: false }),
      ).toBe(true);
    });
  });
});
