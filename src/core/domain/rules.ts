export type RuleTriggerType = 'completed' | 'enterList' | 'enterAnyList' | 'updated';

export interface RuleTrigger {
  type: RuleTriggerType;
  /** Lista que dispara `enterList` ou filtra `updated`. */
  boardId?: string;
  listId?: string;
}

export type RuleActionType = 'moveToList' | 'moveToTop' | 'addLabel' | 'removeLabel';

export interface RuleAction {
  type: RuleActionType;
  boardId?: string;
  listId?: string;
  labelId?: string;
  labelName?: string;
}

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: RuleTrigger;
  actions: RuleAction[];
}

export const RULE_TRIGGER_LABELS: Record<RuleTriggerType, string> = {
  completed: 'Ao concluir o cartão',
  enterList: 'Ao entrar na lista',
  enterAnyList: 'Ao entrar em qualquer lista',
  updated: 'Ao atualizar o cartão',
};

export const RULE_ACTION_LABELS: Record<RuleActionType, string> = {
  moveToList: 'Mover para a lista',
  moveToTop: 'Mover para o topo',
  addLabel: 'Adicionar etiqueta',
  removeLabel: 'Remover etiqueta',
};

export function newRuleId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `rule_${Date.now().toString(36)}_${random}`;
}

export function createRule(partial: Partial<Rule> = {}): Rule {
  return {
    id: newRuleId(),
    name: 'Nova regra',
    enabled: false,
    trigger: { type: 'completed' },
    actions: [{ type: 'moveToTop' }],
    ...partial,
  };
}

/**
 * Regras iniciais: ficam desativadas até o usuário escolher as listas e etiquetas.
 * São só modelos - nada roda até serem configuradas e ativadas.
 */
export function defaultRules(): Rule[] {
  return [
    createRule({
      id: 'rule_default_completed',
      name: 'Concluído vai para a lista de concluídos',
      trigger: { type: 'completed' },
      actions: [{ type: 'moveToList' }],
    }),
    createRule({
      id: 'rule_default_enter_list_label',
      name: 'Entrou na lista, recebe etiqueta',
      trigger: { type: 'enterList' },
      actions: [{ type: 'addLabel' }],
    }),
    createRule({
      id: 'rule_default_top',
      name: 'Ao mudar de lista, vai para o topo',
      trigger: { type: 'enterAnyList' },
      actions: [{ type: 'moveToTop' }],
    }),
    createRule({
      id: 'rule_default_updated',
      name: 'Atualizado na lista, segue para outra lista',
      trigger: { type: 'updated' },
      actions: [{ type: 'moveToList' }],
    }),
  ];
}

/** Uma regra só pode ter uma lista de destino por execução. */
export function ruleIsConfigured(rule: Rule): boolean {
  if (rule.actions.length === 0) return false;
  const moves = rule.actions.filter((action) => action.type === 'moveToList');
  if (moves.some((action) => !action.listId)) return false;
  if (moves.length > 1) {
    const unique = new Set(moves.map((action) => action.listId));
    if (unique.size > 1) return false;
  }
  if (rule.trigger.type === 'enterList' && !rule.trigger.listId) return false;
  return true;
}

/** Motivo pelo qual a regra não pode rodar, ou null quando está pronta. */
export function ruleIssue(rule: Rule): string | null {
  if (rule.actions.length === 0) return 'Adicione pelo menos uma ação.';
  const moves = rule.actions.filter((action) => action.type === 'moveToList');
  if (moves.some((action) => !action.listId)) return 'Escolha a lista de destino.';
  const uniqueLists = new Set(moves.map((action) => action.listId));
  if (uniqueLists.size > 1) {
    return 'Uma regra não pode mover para duas listas diferentes.';
  }
  if (rule.trigger.type === 'enterList' && !rule.trigger.listId) {
    return 'Escolha a lista que dispara a regra.';
  }
  return null;
}

export interface RuleEvent {
  kind: 'completed' | 'moved' | 'updated';
  fromListId?: string | null;
  toListId?: string | null;
}

export function ruleMatches(
  rule: Rule,
  event: RuleEvent,
  card: { idList: string; links: string[] },
): boolean {
  if (!rule.enabled) return false;
  if (card.links.length === 0) return false;
  if (ruleIssue(rule)) return false;

  switch (rule.trigger.type) {
    case 'completed':
      return event.kind === 'completed';
    case 'enterList':
      return event.kind === 'moved' && event.toListId === rule.trigger.listId;
    case 'enterAnyList':
      return event.kind === 'moved' && Boolean(event.toListId);
    case 'updated':
      if (event.kind !== 'updated') return false;
      return rule.trigger.listId ? card.idList === rule.trigger.listId : true;
    default:
      return false;
  }
}
