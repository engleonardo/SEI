export type RuleTriggerType = 'completed' | 'enterList' | 'enterAnyList' | 'seiUpdated';

export interface RuleTrigger {
  type: RuleTriggerType;
  /** Lista do quadro da regra que dispara `enterList` ou filtra `seiUpdated`. */
  listId?: string;
}

export type RuleActionType = 'moveToList' | 'moveToTop' | 'addLabel' | 'removeLabel';

export interface RuleAction {
  type: RuleActionType;
  listId?: string;
  labelId?: string;
  labelName?: string;
}

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  /** Quadro da regra: listas e etiquetas são sempre deste quadro. */
  boardId: string;
  trigger: RuleTrigger;
  actions: RuleAction[];
}

export const RULE_TRIGGER_LABELS: Record<RuleTriggerType, string> = {
  completed: 'Ao concluir o cartão',
  enterList: 'Ao entrar na lista',
  enterAnyList: 'Ao entrar em qualquer lista',
  seiUpdated: 'Quando o processo SEI for atualizado',
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
    boardId: '',
    trigger: { type: 'completed' },
    actions: [{ type: 'moveToTop' }],
    ...partial,
  };
}

/**
 * Regras iniciais: ficam desativadas até o usuário escolher o quadro, as listas
 * e as etiquetas. São só modelos - nada roda até serem configuradas e ativadas.
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
      name: 'Processo SEI atualizado, segue para outra lista',
      trigger: { type: 'seiUpdated' },
      actions: [{ type: 'moveToList' }],
    }),
  ];
}

/** Motivo pelo qual a regra não pode rodar, ou null quando está pronta. */
export function ruleIssue(rule: Rule): string | null {
  if (!rule.boardId) return 'Escolha o quadro da regra.';
  if (rule.actions.length === 0) return 'Adicione pelo menos uma ação.';

  const moves = rule.actions.filter((action) => action.type === 'moveToList');
  if (moves.some((action) => !action.listId)) return 'Escolha a lista de destino.';
  const uniqueLists = new Set(moves.map((action) => action.listId));
  if (uniqueLists.size > 1) {
    return 'Uma regra não pode mover para duas listas diferentes.';
  }

  const labels = rule.actions.filter(
    (action) => action.type === 'addLabel' || action.type === 'removeLabel',
  );
  if (labels.some((action) => !action.labelId)) return 'Escolha a etiqueta da ação.';

  if (rule.trigger.type === 'enterList' && !rule.trigger.listId) {
    return 'Escolha a lista que dispara a regra.';
  }
  return null;
}

export function ruleIsConfigured(rule: Rule): boolean {
  return ruleIssue(rule) === null;
}

export interface RuleEvent {
  kind: 'completed' | 'moved' | 'seiUpdated';
  fromListId?: string | null;
  toListId?: string | null;
}

export interface RuleRunMove {
  cardId: string;
  cardName: string;
  fromListId: string;
  toListId: string;
}

export interface RuleRunLabel {
  cardId: string;
  cardName: string;
  labelId: string;
  added: boolean;
}

export interface RuleRun {
  id: string;
  at: number;
  ruleId: string;
  ruleName: string;
  moves: RuleRunMove[];
  labels: RuleRunLabel[];
}

export function ruleRunCardCount(run: RuleRun): number {
  const ids = new Set<string>();
  for (const move of run.moves) ids.add(move.cardId);
  for (const label of run.labels) ids.add(label.cardId);
  return ids.size;
}

export function ruleMatches(
  rule: Rule,
  event: RuleEvent,
  card: { idBoard: string; idList: string; links: string[] },
): boolean {
  if (!rule.enabled) return false;
  if (card.links.length === 0) return false;
  if (!rule.boardId || card.idBoard !== rule.boardId) return false;
  if (ruleIssue(rule)) return false;

  switch (rule.trigger.type) {
    case 'completed':
      return event.kind === 'completed';
    case 'enterList':
      return event.kind === 'moved' && event.toListId === rule.trigger.listId;
    case 'enterAnyList':
      return event.kind === 'moved' && Boolean(event.toListId);
    case 'seiUpdated':
      if (event.kind !== 'seiUpdated') return false;
      return rule.trigger.listId ? card.idList === rule.trigger.listId : true;
    default:
      return false;
  }
}

/**
 * Usado pelo "Aplicar agora": a regra só age nos cartões que já estão na
 * condição do gatilho neste momento. Nunca aplica a ação em massa sem isso.
 */
export function ruleAppliesNow(
  rule: Rule,
  card: { idBoard: string; idList: string; dueComplete: boolean; links: string[] },
  options: { seiUnread?: boolean } = {},
): boolean {
  if (card.links.length === 0) return false;
  if (!rule.boardId || card.idBoard !== rule.boardId) return false;
  if (ruleIssue(rule)) return false;

  switch (rule.trigger.type) {
    case 'completed':
      return card.dueComplete;
    case 'enterList':
      return card.idList === rule.trigger.listId;
    case 'enterAnyList':
      return true;
    case 'seiUpdated':
      if (!options.seiUnread) return false;
      return rule.trigger.listId ? card.idList === rule.trigger.listId : true;
    default:
      return false;
  }
}
