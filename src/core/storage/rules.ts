import { browser } from 'wxt/browser';
import {
  MAX_DATE_OFFSET_DAYS,
  defaultRules,
  newRuleId,
  type Rule,
  type RuleAction,
  type RuleActionType,
  type RuleTriggerType,
} from '../domain/rules';

const RULES_KEY = 'sei-flow:rules:v1';
const MAX_COMMENT_LENGTH = 4000;

const ACTION_TYPES: ReadonlySet<RuleActionType> = new Set([
  'moveToList',
  'moveToTop',
  'addLabel',
  'removeLabel',
  'setStartDate',
  'setDueDate',
  'clearDates',
  'addComment',
  'markComplete',
  'reopenCard',
]);

const TRIGGER_TYPES: ReadonlySet<RuleTriggerType> = new Set([
  'created',
  'completed',
  'enterList',
  'enterAnyList',
  'seiUpdated',
]);

function sanitizeDays(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const days = Math.trunc(value);
  return Math.max(-MAX_DATE_OFFSET_DAYS, Math.min(MAX_DATE_OFFSET_DAYS, days));
}

function sanitizeAction(value: unknown): RuleAction | null {
  if (!value || typeof value !== 'object') return null;
  const action = value as Record<string, unknown>;
  const type = action.type;
  if (typeof type !== 'string' || !ACTION_TYPES.has(type as RuleActionType)) {
    return null;
  }
  return {
    type: type as RuleActionType,
    listId: typeof action.listId === 'string' ? action.listId : undefined,
    labelId: typeof action.labelId === 'string' ? action.labelId : undefined,
    labelName: typeof action.labelName === 'string' ? action.labelName : undefined,
    days: sanitizeDays(action.days),
    text:
      typeof action.text === 'string' && action.text.trim()
        ? action.text.trim().slice(0, MAX_COMMENT_LENGTH)
        : undefined,
  };
}

/** Migra regras antigas (sem quadro fixo) aproveitando o quadro que estiver salvo. */
function legacyBoardId(rule: Record<string, unknown>, actions: RuleAction[]): string {
  if (typeof rule.boardId === 'string' && rule.boardId) return rule.boardId;
  const trigger = (rule.trigger ?? {}) as Record<string, unknown>;
  if (typeof trigger.boardId === 'string' && trigger.boardId) return trigger.boardId;
  for (const action of actions) {
    const raw = action as unknown as Record<string, unknown>;
    if (typeof raw.boardId === 'string' && raw.boardId) return raw.boardId;
  }
  return '';
}

function sanitizeRule(value: unknown): Rule | null {
  if (!value || typeof value !== 'object') return null;
  const rule = value as Record<string, unknown>;
  const trigger = (rule.trigger ?? {}) as Record<string, unknown>;
  const rawTriggerType = trigger.type;
  // Regras antigas usavam "updated" para edição do cartão; agora o gatilho é a novidade do SEI.
  const triggerType = rawTriggerType === 'updated' ? 'seiUpdated' : rawTriggerType;
  if (typeof triggerType !== 'string' || !TRIGGER_TYPES.has(triggerType as RuleTriggerType)) {
    return null;
  }
  const actions = Array.isArray(rule.actions)
    ? rule.actions.map(sanitizeAction).filter((action): action is RuleAction => Boolean(action))
    : [];

  return {
    id: typeof rule.id === 'string' && rule.id ? rule.id : newRuleId(),
    name: typeof rule.name === 'string' && rule.name.trim() ? rule.name.trim() : 'Regra',
    enabled: Boolean(rule.enabled),
    boardId: legacyBoardId(rule, actions),
    trigger: {
      type: triggerType as RuleTriggerType,
      listId: typeof trigger.listId === 'string' ? trigger.listId : undefined,
    },
    actions,
  };
}

export async function getRules(): Promise<Rule[]> {
  const stored = await browser.storage.local.get(RULES_KEY);
  const current = stored[RULES_KEY];
  if (!Array.isArray(current)) {
    const seeded = defaultRules();
    await browser.storage.local.set({ [RULES_KEY]: seeded });
    return seeded;
  }
  const rules = current.map(sanitizeRule).filter((rule): rule is Rule => Boolean(rule));
  return rules;
}

export async function saveRules(rules: Rule[]): Promise<Rule[]> {
  const sanitized = rules.map(sanitizeRule).filter((rule): rule is Rule => Boolean(rule));
  await browser.storage.local.set({ [RULES_KEY]: sanitized });
  return sanitized;
}

export async function clearRules(): Promise<void> {
  await browser.storage.local.remove(RULES_KEY);
}
