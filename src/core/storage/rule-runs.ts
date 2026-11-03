import { browser } from 'wxt/browser';
import type {
  RuleRun,
  RuleRunComment,
  RuleRunComplete,
  RuleRunDate,
  RuleRunLabel,
  RuleRunMove,
} from '../domain/rules';

const RUNS_KEY = 'sei-flow:rule-runs:v1';
const MAX_RUNS = 5;

function asDate(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function sanitizeMove(value: unknown): RuleRunMove | null {
  if (!value || typeof value !== 'object') return null;
  const move = value as Record<string, unknown>;
  if (typeof move.cardId !== 'string' || typeof move.fromListId !== 'string') return null;
  if (typeof move.toListId !== 'string') return null;
  return {
    cardId: move.cardId,
    cardName: typeof move.cardName === 'string' ? move.cardName : '',
    fromListId: move.fromListId,
    toListId: move.toListId,
  };
}

function sanitizeLabel(value: unknown): RuleRunLabel | null {
  if (!value || typeof value !== 'object') return null;
  const label = value as Record<string, unknown>;
  if (typeof label.cardId !== 'string' || typeof label.labelId !== 'string') return null;
  return {
    cardId: label.cardId,
    cardName: typeof label.cardName === 'string' ? label.cardName : '',
    labelId: label.labelId,
    added: Boolean(label.added),
  };
}

function sanitizeDate(value: unknown): RuleRunDate | null {
  if (!value || typeof value !== 'object') return null;
  const date = value as Record<string, unknown>;
  if (typeof date.cardId !== 'string') return null;
  return {
    cardId: date.cardId,
    cardName: typeof date.cardName === 'string' ? date.cardName : '',
    previousStart: asDate(date.previousStart),
    previousDue: asDate(date.previousDue),
    start: asDate(date.start),
    due: asDate(date.due),
  };
}

function sanitizeComment(value: unknown): RuleRunComment | null {
  if (!value || typeof value !== 'object') return null;
  const comment = value as Record<string, unknown>;
  if (typeof comment.cardId !== 'string' || typeof comment.text !== 'string') return null;
  return {
    cardId: comment.cardId,
    cardName: typeof comment.cardName === 'string' ? comment.cardName : '',
    actionId: typeof comment.actionId === 'string' ? comment.actionId : undefined,
    text: comment.text,
  };
}

function sanitizeComplete(value: unknown): RuleRunComplete | null {
  if (!value || typeof value !== 'object') return null;
  const complete = value as Record<string, unknown>;
  if (typeof complete.cardId !== 'string') return null;
  return {
    cardId: complete.cardId,
    cardName: typeof complete.cardName === 'string' ? complete.cardName : '',
    previous: Boolean(complete.previous),
    value: Boolean(complete.value),
  };
}

function sanitizeList<T>(value: unknown, sanitize: (item: unknown) => T | null): T[] {
  return Array.isArray(value) ? value.map(sanitize).filter((item): item is T => Boolean(item)) : [];
}

function sanitizeRun(value: unknown): RuleRun | null {
  if (!value || typeof value !== 'object') return null;
  const run = value as Record<string, unknown>;
  if (typeof run.id !== 'string' || typeof run.ruleId !== 'string') return null;
  return {
    id: run.id,
    at: typeof run.at === 'number' ? run.at : 0,
    ruleId: run.ruleId,
    ruleName: typeof run.ruleName === 'string' ? run.ruleName : 'Regra',
    moves: sanitizeList(run.moves, sanitizeMove),
    labels: sanitizeList(run.labels, sanitizeLabel),
    dates: sanitizeList(run.dates, sanitizeDate),
    comments: sanitizeList(run.comments, sanitizeComment),
    completes: sanitizeList(run.completes, sanitizeComplete),
  };
}

export async function getRuleRuns(): Promise<RuleRun[]> {
  try {
    const stored = await browser.storage.local.get(RUNS_KEY);
    const value = stored[RUNS_KEY];
    if (!Array.isArray(value)) return [];
    return value.map(sanitizeRun).filter((run): run is RuleRun => Boolean(run));
  } catch {
    return [];
  }
}

export async function getLastRuleRun(): Promise<RuleRun | null> {
  const runs = await getRuleRuns();
  return runs[0] ?? null;
}

export async function pushRuleRun(run: RuleRun): Promise<void> {
  const runs = await getRuleRuns();
  const next = [run, ...runs].slice(0, MAX_RUNS);
  try {
    await browser.storage.local.set({ [RUNS_KEY]: next });
  } catch {
    // histórico é apoio; falhas não interrompem a aplicação das regras
  }
}

export async function dropLastRuleRun(): Promise<void> {
  const runs = await getRuleRuns();
  try {
    await browser.storage.local.set({ [RUNS_KEY]: runs.slice(1) });
  } catch {
    // ignora
  }
}

export async function clearRuleRuns(): Promise<void> {
  try {
    await browser.storage.local.remove(RUNS_KEY);
  } catch {
    // ignora
  }
}
