import { browser } from 'wxt/browser';

const LOG_KEY = 'sei-flow:rule-log:v1';
const MAX_ENTRIES = 30;

export interface RuleLogEntry {
  at: number;
  ruleId: string;
  ruleName: string;
  cardId: string;
  cardName: string;
  source: 'auto' | 'manual';
  actions: string[];
}

function sanitize(value: unknown): RuleLogEntry | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.ruleId !== 'string' || typeof entry.cardId !== 'string') return null;
  return {
    at: typeof entry.at === 'number' ? entry.at : 0,
    ruleId: entry.ruleId,
    ruleName: typeof entry.ruleName === 'string' ? entry.ruleName : 'Regra',
    cardId: entry.cardId,
    cardName: typeof entry.cardName === 'string' ? entry.cardName : '',
    source: entry.source === 'manual' ? 'manual' : 'auto',
    actions: Array.isArray(entry.actions)
      ? entry.actions.filter((action): action is string => typeof action === 'string')
      : [],
  };
}

export async function getRuleLog(): Promise<RuleLogEntry[]> {
  try {
    const stored = await browser.storage.local.get(LOG_KEY);
    const value = stored[LOG_KEY];
    if (!Array.isArray(value)) return [];
    return value.map(sanitize).filter((entry): entry is RuleLogEntry => Boolean(entry));
  } catch {
    return [];
  }
}

export async function pushRuleLog(entries: RuleLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const current = await getRuleLog();
  const next = [...entries, ...current].slice(0, MAX_ENTRIES);
  try {
    await browser.storage.local.set({ [LOG_KEY]: next });
  } catch {
    // histórico é apoio; falhas não interrompem as regras
  }
}

export async function clearRuleLog(): Promise<void> {
  try {
    await browser.storage.local.remove(LOG_KEY);
  } catch {
    // ignora
  }
}
