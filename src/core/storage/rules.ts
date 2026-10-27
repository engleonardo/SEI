import { browser } from 'wxt/browser';
import { defaultRules, newRuleId, type Rule, type RuleAction } from '../domain/rules';

const RULES_KEY = 'sei-flow:rules:v1';

function sanitizeAction(value: unknown): RuleAction | null {
  if (!value || typeof value !== 'object') return null;
  const action = value as Record<string, unknown>;
  const type = action.type;
  if (
    type !== 'moveToList' &&
    type !== 'moveToTop' &&
    type !== 'addLabel' &&
    type !== 'removeLabel'
  ) {
    return null;
  }
  return {
    type,
    listId: typeof action.listId === 'string' ? action.listId : undefined,
    labelId: typeof action.labelId === 'string' ? action.labelId : undefined,
    labelName: typeof action.labelName === 'string' ? action.labelName : undefined,
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
  if (
    triggerType !== 'completed' &&
    triggerType !== 'enterList' &&
    triggerType !== 'enterAnyList' &&
    triggerType !== 'seiUpdated'
  ) {
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
      type: triggerType,
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
  const rules = current
    .map(sanitizeRule)
    .filter((rule): rule is Rule => Boolean(rule));
  return rules;
}

export async function saveRules(rules: Rule[]): Promise<Rule[]> {
  const sanitized = rules
    .map(sanitizeRule)
    .filter((rule): rule is Rule => Boolean(rule));
  await browser.storage.local.set({ [RULES_KEY]: sanitized });
  return sanitized;
}

export async function clearRules(): Promise<void> {
  await browser.storage.local.remove(RULES_KEY);
}
