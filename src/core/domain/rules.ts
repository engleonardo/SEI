export type RuleTriggerType = 'created' | 'completed' | 'enterList' | 'enterAnyList' | 'seiUpdated';

export interface RuleTrigger {
  type: RuleTriggerType;
  /** Lista do quadro da regra que dispara `enterList` ou filtra `seiUpdated`. */
  listId?: string;
}

export type RuleActionType =
  | 'moveToList'
  | 'moveToTop'
  | 'addLabel'
  | 'removeLabel'
  | 'setStartDate'
  | 'setDueDate'
  | 'clearDates'
  | 'addComment'
  | 'markComplete'
  | 'reopenCard';

export interface RuleAction {
  type: RuleActionType;
  listId?: string;
  labelId?: string;
  labelName?: string;
  /**
   * Dias somados à data do disparo nas ações `setStartDate` e `setDueDate`.
   * `0` significa hoje; valores negativos voltam no calendário.
   */
  days?: number;
  /**
   * Texto do comentário (`addComment`). Aceita os marcadores
   * `{processo}`, `{cartao}`, `{data}`, `{hora}`, `{lista}`, `{quadro}` e `{regra}`.
   */
  text?: string;
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
  created: 'Ao criar o cartão',
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
  setStartDate: 'Definir data de início',
  setDueDate: 'Definir data de término',
  clearDates: 'Limpar início e término',
  addComment: 'Adicionar comentário',
  markComplete: 'Marcar como concluído',
  reopenCard: 'Reabrir cartão',
};

/** Ações que não precisam de configuração extra na interface. */
export const RULE_ACTION_WITHOUT_OPTIONS: ReadonlySet<RuleActionType> = new Set([
  'moveToTop',
  'clearDates',
  'markComplete',
  'reopenCard',
]);

/** Limite de deslocamento aceito nas ações de data, em dias. */
export const MAX_DATE_OFFSET_DAYS = 3650;

export const RULE_COMMENT_PLACEHOLDERS = [
  '{processo}',
  '{cartao}',
  '{data}',
  '{hora}',
  '{lista}',
  '{quadro}',
  '{regra}',
] as const;

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
      id: 'rule_default_created_dates',
      name: 'Ao criar, define início hoje e término em 7 dias',
      trigger: { type: 'created' },
      actions: [
        { type: 'setStartDate', days: 0 },
        { type: 'setDueDate', days: 7 },
      ],
    }),
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
    createRule({
      id: 'rule_default_comment',
      name: 'Ao concluir, registra um comentário',
      trigger: { type: 'completed' },
      actions: [{ type: 'addComment', text: 'Cartão concluído em {data} às {hora}.' }],
    }),
  ];
}

function normalizeDays(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.trunc(value as number);
}

function daysAreValid(value: number | undefined): boolean {
  return (
    value === undefined || (Number.isFinite(value) && Math.abs(Math.trunc(value)) <= MAX_DATE_OFFSET_DAYS)
  );
}

function findAction(rule: Rule, type: RuleActionType): RuleAction | undefined {
  return rule.actions.find((action) => action.type === type);
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

  const labels = rule.actions.filter((action) => action.type === 'addLabel' || action.type === 'removeLabel');
  if (labels.some((action) => !action.labelId)) return 'Escolha a etiqueta da ação.';

  if (rule.trigger.type === 'enterList' && !rule.trigger.listId) {
    return 'Escolha a lista que dispara a regra.';
  }

  const start = findAction(rule, 'setStartDate');
  const due = findAction(rule, 'setDueDate');
  if (!daysAreValid(start?.days) || !daysAreValid(due?.days)) {
    return `Use um número de dias entre -${MAX_DATE_OFFSET_DAYS} e ${MAX_DATE_OFFSET_DAYS}.`;
  }
  if (start && due && normalizeDays(start.days) > normalizeDays(due.days)) {
    return 'A data de início não pode ser posterior à data de término.';
  }
  if (findAction(rule, 'clearDates') && (start || due)) {
    return 'Use “Limpar início e término” sozinho, sem definir datas na mesma regra.';
  }

  const comments = rule.actions.filter((action) => action.type === 'addComment');
  if (comments.length > 1) return 'Use apenas um comentário por regra.';
  if (comments.some((action) => !action.text?.trim())) return 'Escreva o texto do comentário.';

  const completes = rule.actions.filter(
    (action) => action.type === 'markComplete' || action.type === 'reopenCard',
  );
  if (completes.length > 1) {
    return 'Escolha apenas uma ação de conclusão por regra.';
  }

  return null;
}

export function ruleIsConfigured(rule: Rule): boolean {
  return ruleIssue(rule) === null;
}

export interface RuleEvent {
  kind: 'created' | 'completed' | 'moved' | 'seiUpdated';
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

export interface RuleRunDate {
  cardId: string;
  cardName: string;
  previousStart: string | null;
  previousDue: string | null;
  start: string | null;
  due: string | null;
}

export interface RuleRunComment {
  cardId: string;
  cardName: string;
  /** Id da ação de comentário no Trello, quando a API devolve. */
  actionId?: string;
  text: string;
}

export interface RuleRunComplete {
  cardId: string;
  cardName: string;
  previous: boolean;
  value: boolean;
}

export interface RuleRun {
  id: string;
  at: number;
  ruleId: string;
  ruleName: string;
  moves: RuleRunMove[];
  labels: RuleRunLabel[];
  dates: RuleRunDate[];
  comments: RuleRunComment[];
  completes: RuleRunComplete[];
}

export function ruleRunCardCount(run: RuleRun): number {
  const ids = new Set<string>();
  for (const move of run.moves ?? []) ids.add(move.cardId);
  for (const label of run.labels ?? []) ids.add(label.cardId);
  for (const date of run.dates ?? []) ids.add(date.cardId);
  for (const comment of run.comments ?? []) ids.add(comment.cardId);
  for (const complete of run.completes ?? []) ids.add(complete.cardId);
  return ids.size;
}

/** Quantidade de alterações registradas na execução, usada no desfazer. */
export function ruleRunChangeCount(run: RuleRun): number {
  return (
    (run.moves?.length ?? 0) +
    (run.labels?.length ?? 0) +
    (run.dates?.length ?? 0) +
    (run.comments?.length ?? 0) +
    (run.completes?.length ?? 0)
  );
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
    case 'created':
      return event.kind === 'created';
    case 'completed':
      return event.kind === 'completed';
    case 'enterList':
      return (event.kind === 'moved' || event.kind === 'created') && event.toListId === rule.trigger.listId;
    case 'enterAnyList':
      return (event.kind === 'moved' || event.kind === 'created') && Boolean(event.toListId);
    case 'seiUpdated':
      if (event.kind !== 'seiUpdated') return false;
      return rule.trigger.listId ? card.idList === rule.trigger.listId : true;
    default:
      return false;
  }
}

/** Data (ISO) usada pelas ações de início/término, ao meio-dia local. */
export function ruleDate(days = 0, base = new Date()): string {
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12, 0, 0, 0);
  date.setDate(date.getDate() + normalizeDays(days));
  return date.toISOString();
}

export function ruleDateLabel(days = 0): string {
  const value = normalizeDays(days);
  if (value === 0) return 'hoje';
  if (value === 1) return 'amanhã';
  if (value === -1) return 'ontem';
  return value > 0 ? `em ${value} dias` : `há ${Math.abs(value)} dias`;
}

/** Mesmo dia do calendário local? Usado para não repetir a ação de data. */
export function ruleDateMatches(value: string | null | undefined, days = 0, base = new Date()): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const target = new Date(base.getFullYear(), base.getMonth(), base.getDate() + normalizeDays(days));
  return (
    date.getFullYear() === target.getFullYear() &&
    date.getMonth() === target.getMonth() &&
    date.getDate() === target.getDate()
  );
}

export interface RuleCommentContext {
  processNumber?: string | null;
  cardName?: string;
  boardName?: string;
  listName?: string;
  ruleName?: string;
  now?: Date;
}

/** Troca os marcadores do comentário pelos dados do cartão. */
export function renderRuleComment(text: string, context: RuleCommentContext = {}): string {
  const now = context.now ?? new Date();
  const values: Record<string, string> = {
    processo: context.processNumber ?? '',
    cartao: context.cardName ?? '',
    quadro: context.boardName ?? '',
    lista: context.listName ?? '',
    regra: context.ruleName ?? '',
    data: now.toLocaleDateString('pt-BR'),
    hora: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  };
  return text
    .replace(
      /\{(processo|cartao|quadro|lista|regra|data|hora)\}/gi,
      (_match, key: string) => values[key.toLowerCase()] ?? '',
    )
    .trim();
}

export interface RuleCardState {
  idList: string;
  labels: Array<{ id: string }>;
  start?: string | null;
  due?: string | null;
  dueComplete?: boolean;
}

/**
 * Verifica se a regra ainda mudaria algo no cartão. Usado para ignorar, no
 * "Aplicar agora", cartões que já estão com a regra aplicada.
 */
export function ruleWouldChange(rule: Rule, card: RuleCardState): boolean {
  for (const action of rule.actions) {
    if (action.type === 'moveToList' && action.listId) {
      if (card.idList !== action.listId) return true;
      continue;
    }
    if (action.type === 'addLabel' && action.labelId) {
      if (!card.labels.some((label) => label.id === action.labelId)) return true;
      continue;
    }
    if (action.type === 'removeLabel' && action.labelId) {
      if (card.labels.some((label) => label.id === action.labelId)) return true;
      continue;
    }
    if (action.type === 'setStartDate') {
      if (!ruleDateMatches(card.start, action.days)) return true;
      continue;
    }
    if (action.type === 'setDueDate') {
      if (!ruleDateMatches(card.due, action.days)) return true;
      continue;
    }
    if (action.type === 'clearDates') {
      if (card.start || card.due) return true;
      continue;
    }
    if (action.type === 'addComment') {
      // Comentários são cumulativos: sempre há o que registrar.
      return true;
    }
    if (action.type === 'markComplete') {
      if (!card.dueComplete) return true;
      continue;
    }
    if (action.type === 'reopenCard') {
      if (card.dueComplete) return true;
      continue;
    }
    if (action.type === 'moveToTop') {
      // A posição não vem no cartão; mover para o topo sempre conta como ação.
      return true;
    }
  }
  return false;
}

/**
 * Usado pelo "Aplicar agora": a regra só age nos cartões que já estão na
 * condição do gatilho neste momento. Nunca aplica a ação em massa sem isso.
 * Regras de criação não têm condição retroativa, então nunca entram aqui.
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
    case 'created':
      return false;
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
