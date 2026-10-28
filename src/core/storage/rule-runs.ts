import { browser } from 'wxt/browser';
import type { RuleRun, RuleRunLabel, RuleRunMove } from '../domain/rules';

const RUNS_KEY = 'sei-flow:rule-runs:v1';
const MAX_RUNS = 5;

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

function sanitizeRun(value: unknown): RuleRun | null {
  if (!value || typeof value !== 'object') return null;
  const run = value as Record<string, unknown>;
  if (typeof run.id !== 'string' || typeof run.ruleId !== 'string') return null;
  const moves = Array.isArray(run.moves)
    ? run.moves.map(sanitizeMove).filter((move): move is RuleRunMove => Boolean(move))
    : [];
  const labels = Array.isArray(run.labels)
    ? run.labels.map(sanitizeLabel).filter((label): label is RuleRunLabel => Boolean(label))
    : [];
  return {
    id: run.id,
    at: typeof run.at === 'number' ? run.at : 0,
    ruleId: run.ruleId,
    ruleName: typeof run.ruleName === 'string' ? run.ruleName : 'Regra',
    moves,
    labels,
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
