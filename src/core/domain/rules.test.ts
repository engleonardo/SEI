import { describe, expect, it } from 'vitest';
import {
  MAX_DATE_OFFSET_DAYS,
  createRule,
  defaultRules,
  renderRuleComment,
  ruleAppliesNow,
  ruleDate,
  ruleDateLabel,
  ruleDateMatches,
  ruleIsConfigured,
  ruleIssue,
  ruleMatches,
  ruleRunChangeCount,
  ruleWouldChange,
  type Rule,
  type RuleRun,
} from './rules';

const card = { idBoard: 'board-1', idList: 'list-1', links: ['11111.111111/2024-11'] };
const unlinked = { ...card, links: [] };

function rule(overrides: Partial<Rule> = {}): Rule {
  return createRule({ enabled: true, boardId: 'board-1', ...overrides });
}

describe('regras', () => {
  it('cria 6 regras iniciais desativadas e sem quadro', () => {
    const rules = defaultRules();
    expect(rules).toHaveLength(6);
    expect(rules.every((item) => !item.enabled)).toBe(true);
    expect(rules.every((item) => item.boardId === '')).toBe(true);
    expect(rules.some((item) => item.trigger.type === 'created')).toBe(true);
    expect(rules.some((item) => item.actions.some((action) => action.type === 'addComment'))).toBe(true);
  });

  it('não aplica regras em cartões sem vínculo com o SEI', () => {
    const completed = rule({ trigger: { type: 'completed' }, actions: [{ type: 'moveToTop' }] });
    expect(ruleMatches(completed, { kind: 'completed' }, card)).toBe(true);
    expect(ruleMatches(completed, { kind: 'completed' }, unlinked)).toBe(false);
  });

  it('permite liberar cartões sem vínculo em uma regra específica', () => {
    const completed = rule({
      requiresSeiLink: false,
      trigger: { type: 'completed' },
      actions: [{ type: 'moveToTop' }],
    });
    expect(ruleMatches(completed, { kind: 'completed' }, card)).toBe(true);
    expect(ruleMatches(completed, { kind: 'completed' }, unlinked)).toBe(true);
    expect(ruleAppliesNow(completed, { ...unlinked, dueComplete: true })).toBe(true);
    expect(ruleAppliesNow(completed, { ...unlinked, dueComplete: false })).toBe(false);
  });

  it('não aplica regras em cartões de outro quadro', () => {
    const completed = rule({ trigger: { type: 'completed' }, actions: [{ type: 'moveToTop' }] });
    expect(ruleMatches(completed, { kind: 'completed' }, { ...card, idBoard: 'board-2' })).toBe(false);
  });

  it('dispara ao concluir o cartão', () => {
    const completed = rule({ trigger: { type: 'completed' }, actions: [{ type: 'moveToTop' }] });
    expect(ruleMatches(completed, { kind: 'completed' }, card)).toBe(true);
    expect(ruleMatches(completed, { kind: 'seiUpdated' }, card)).toBe(false);
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
    expect(ruleMatches(enter, { kind: 'seiUpdated' }, card)).toBe(false);
  });

  it('dispara quando o processo SEI é atualizado', () => {
    const sei = rule({
      trigger: { type: 'seiUpdated', listId: 'list-1' },
      actions: [{ type: 'moveToTop' }],
    });
    expect(ruleMatches(sei, { kind: 'seiUpdated' }, card)).toBe(true);
    expect(ruleMatches(sei, { kind: 'seiUpdated' }, { ...card, idList: 'list-2' })).toBe(false);
    expect(ruleMatches(sei, { kind: 'moved', toListId: 'list-1' }, card)).toBe(false);
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
      expect(ruleAppliesNow(completedRule, { ...card, idBoard: 'board-2', dueComplete: true })).toBe(false);
      expect(ruleAppliesNow(completedRule, { ...unlinked, dueComplete: true })).toBe(false);
    });

    it('entrou na lista só atinge cartões que estão naquela lista', () => {
      const enter = rule({
        trigger: { type: 'enterList', listId: 'list-2' },
        actions: [{ type: 'addLabel', labelId: 'label-1' }],
      });
      expect(ruleAppliesNow(enter, { ...card, dueComplete: false })).toBe(false);
      expect(ruleAppliesNow(enter, { ...card, idList: 'list-2', dueComplete: false })).toBe(true);
    });

    it('processo SEI atualizado só atinge cartões com novidade', () => {
      const sei = rule({
        trigger: { type: 'seiUpdated', listId: 'list-1' },
        actions: [{ type: 'moveToTop' }],
      });
      expect(ruleAppliesNow(sei, { ...card, dueComplete: false })).toBe(false);
      expect(ruleAppliesNow(sei, { ...card, dueComplete: false }, { seiUnread: true })).toBe(true);
      expect(
        ruleAppliesNow(sei, { ...card, idList: 'list-2', dueComplete: false }, { seiUnread: true }),
      ).toBe(false);
    });
  });

  it('ignora cartões que já estão com a regra aplicada', () => {
    const combined = rule({
      actions: [
        { type: 'moveToList', listId: 'list-2' },
        { type: 'addLabel', labelId: 'label-1' },
      ],
    });

    expect(ruleWouldChange(combined, { idList: 'list-1', labels: [] })).toBe(true);
    expect(ruleWouldChange(combined, { idList: 'list-2', labels: [{ id: 'label-1' }] })).toBe(false);
    expect(ruleWouldChange(combined, { idList: 'list-2', labels: [] })).toBe(true);
    expect(ruleWouldChange(combined, { idList: 'list-1', labels: [{ id: 'label-1' }] })).toBe(true);

    const removeRule = rule({ actions: [{ type: 'removeLabel', labelId: 'label-1' }] });
    expect(ruleWouldChange(removeRule, { idList: 'list-1', labels: [] })).toBe(false);
    expect(ruleWouldChange(removeRule, { idList: 'list-1', labels: [{ id: 'label-1' }] })).toBe(true);

    const top = rule({ actions: [{ type: 'moveToTop' }] });
    expect(ruleWouldChange(top, { idList: 'list-1', labels: [] })).toBe(true);
  });

  describe('criação do cartão', () => {
    it('dispara só no evento de criação', () => {
      const created = rule({ trigger: { type: 'created' }, actions: [{ type: 'moveToTop' }] });
      expect(ruleMatches(created, { kind: 'created', toListId: 'list-1' }, card)).toBe(true);
      expect(ruleMatches(created, { kind: 'moved', toListId: 'list-1' }, card)).toBe(false);
      expect(ruleMatches(created, { kind: 'completed' }, card)).toBe(false);
    });

    it('entrada em lista também considera a criação do cartão', () => {
      const enter = rule({
        trigger: { type: 'enterList', listId: 'list-1' },
        actions: [{ type: 'moveToTop' }],
      });
      expect(ruleMatches(enter, { kind: 'created', toListId: 'list-1' }, card)).toBe(true);
    });

    it('não entra no aplicar agora', () => {
      const created = rule({
        trigger: { type: 'created' },
        actions: [{ type: 'setDueDate', days: 7 }],
      });
      expect(ruleAppliesNow(created, { ...card, dueComplete: true })).toBe(false);
    });
  });

  describe('datas e comentários', () => {
    it('calcula a data ao meio-dia local e reconhece o mesmo dia', () => {
      const base = new Date(2026, 10, 3, 9, 30, 0);
      const today = ruleDate(0, base);
      expect(new Date(today).getHours()).toBe(12);
      expect(ruleDateMatches(today, 0, base)).toBe(true);
      expect(ruleDateMatches(today, 1, base)).toBe(false);
      expect(ruleDateLabel(0)).toBe('hoje');
      expect(ruleDateLabel(1)).toBe('amanhã');
      expect(ruleDateLabel(-1)).toBe('ontem');
      expect(ruleDateLabel(7)).toBe('em 7 dias');
      expect(ruleDateLabel(-3)).toBe('há 3 dias');
    });

    it('exige dias dentro do limite', () => {
      const invalid = rule({
        actions: [{ type: 'setDueDate', days: MAX_DATE_OFFSET_DAYS + 1 }],
      });
      expect(ruleIssue(invalid)).toMatch(/número de dias/);
      expect(ruleIsConfigured(invalid)).toBe(false);
    });

    it('não aceita início posterior ao término', () => {
      const invalid = rule({
        actions: [
          { type: 'setStartDate', days: 10 },
          { type: 'setDueDate', days: 5 },
        ],
      });
      expect(ruleIssue(invalid)).toMatch(/posterior/);
    });

    it('não mistura limpar datas com definir datas', () => {
      const invalid = rule({
        actions: [{ type: 'clearDates' }, { type: 'setDueDate', days: 1 }],
      });
      expect(ruleIssue(invalid)).toMatch(/Limpar início e término/);
    });

    it('exige texto no comentário e limita a um por regra', () => {
      expect(ruleIssue(rule({ actions: [{ type: 'addComment' }] }))).toMatch(/texto do comentário/);
      expect(
        ruleIssue(
          rule({
            actions: [
              { type: 'addComment', text: 'Um' },
              { type: 'addComment', text: 'Dois' },
            ],
          }),
        ),
      ).toMatch(/apenas um comentário/);
    });

    it('não mistura concluir com reabrir', () => {
      expect(ruleIssue(rule({ actions: [{ type: 'markComplete' }, { type: 'reopenCard' }] }))).toMatch(
        /conclusão/,
      );
    });

    it('substitui os marcadores do comentário', () => {
      const text = renderRuleComment(
        'Processo {processo} do cartão {cartao} em {data} às {hora} ({lista}/{quadro}/{regra}).',
        {
          processNumber: '11111.111111/2024-11',
          cardName: 'Cartão teste',
          boardName: 'Quadro',
          listName: 'Lista',
          ruleName: 'Minha regra',
          now: new Date(2026, 10, 3, 14, 5, 0),
        },
      );
      expect(text).toBe(
        'Processo 11111.111111/2024-11 do cartão Cartão teste em 03/11/2026 às 14:05 (Lista/Quadro/Minha regra).',
      );
    });

    it('detecta mudança de datas e de conclusão', () => {
      const dates = rule({
        actions: [
          { type: 'setStartDate', days: 0 },
          { type: 'setDueDate', days: 7 },
        ],
      });
      expect(
        ruleWouldChange(dates, {
          idList: 'list-1',
          labels: [],
          start: ruleDate(0),
          due: ruleDate(7),
        }),
      ).toBe(false);
      expect(
        ruleWouldChange(dates, {
          idList: 'list-1',
          labels: [],
          start: ruleDate(0),
          due: ruleDate(3),
        }),
      ).toBe(true);

      const complete = rule({ actions: [{ type: 'markComplete' }] });
      expect(ruleWouldChange(complete, { idList: 'list-1', labels: [], dueComplete: true })).toBe(false);
      expect(ruleWouldChange(complete, { idList: 'list-1', labels: [], dueComplete: false })).toBe(true);

      const clear = rule({ actions: [{ type: 'clearDates' }] });
      expect(ruleWouldChange(clear, { idList: 'list-1', labels: [] })).toBe(false);
      expect(ruleWouldChange(clear, { idList: 'list-1', labels: [], due: ruleDate(1) })).toBe(true);
    });

    it('conta todas as alterações registradas na execução', () => {
      const run: RuleRun = {
        id: 'run-1',
        at: 0,
        ruleId: 'rule-1',
        ruleName: 'Regra',
        moves: [{ cardId: 'card-1', cardName: 'A', fromListId: 'list-1', toListId: 'list-2' }],
        labels: [{ cardId: 'card-1', cardName: 'A', labelId: 'label-1', added: true }],
        dates: [
          {
            cardId: 'card-1',
            cardName: 'A',
            previousStart: null,
            previousDue: null,
            start: ruleDate(0),
            due: ruleDate(7),
          },
        ],
        comments: [{ cardId: 'card-1', cardName: 'A', text: 'Oi', actionId: 'action-1' }],
        completes: [{ cardId: 'card-1', cardName: 'A', previous: false, value: true }],
      };
      expect(ruleRunChangeCount(run)).toBe(5);
    });
  });
});
