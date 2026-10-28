import { browser } from 'wxt/browser';

const STATS_KEY = 'sei-flow:rule-stats:v1';

export type RuleRunSource = 'auto' | 'manual';

export interface RuleStat {
  applied: number;
  lastAt: number;
  lastSource: RuleRunSource;
}

export type RuleStats = Record<string, RuleStat>;

export async function getRuleStats(): Promise<RuleStats> {
  try {
    const stored = await browser.storage.local.get(STATS_KEY);
    const value = stored[STATS_KEY];
    if (!value || typeof value !== 'object') return {};
    const result: RuleStats = {};
    for (const [id, entry] of Object.entries(value as Record<string, unknown>)) {
      if (!entry || typeof entry !== 'object') continue;
      const item = entry as Record<string, unknown>;
      if (typeof item.applied !== 'number' || item.applied <= 0) continue;
      result[id] = {
        applied: Math.floor(item.applied),
        lastAt: typeof item.lastAt === 'number' ? item.lastAt : 0,
        lastSource: item.lastSource === 'manual' ? 'manual' : 'auto',
      };
    }
    return result;
  } catch {
    return {};
  }
}

export async function recordRuleApplications(
  counts: Map<string, number>,
  source: RuleRunSource,
): Promise<void> {
  if (counts.size === 0) return;
  const stats = await getRuleStats();
  const now = Date.now();
  for (const [ruleId, count] of counts) {
    if (count <= 0) continue;
    const previous = stats[ruleId];
    stats[ruleId] = {
      applied: (previous?.applied ?? 0) + count,
      lastAt: now,
      lastSource: source,
    };
  }
  try {
    await browser.storage.local.set({ [STATS_KEY]: stats });
  } catch {
    // contador é informativo; falhas não interrompem as regras
  }
}

export async function clearRuleStats(): Promise<void> {
  try {
    await browser.storage.local.remove(STATS_KEY);
  } catch {
    // ignora
  }
}
