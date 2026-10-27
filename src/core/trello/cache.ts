import { browser } from 'wxt/browser';

const CACHE_PREFIX = 'sei-flow:cache:v2:';
const memory = new Map<string, { at: number; value: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();

export const CACHE_TTL = {
  boards: 10 * 60_000,
  boardLists: 10 * 60_000,
  boardCards: 60_000,
  boardLabels: 10 * 60_000,
  processCards: 60_000,
  allLinkedCards: 60_000,
} as const;

function storageKey(key: string): string {
  return `${CACHE_PREFIX}${key}`;
}

export async function cacheGet<T>(key: string, ttlMs: number): Promise<T | null> {
  const mem = memory.get(key);
  if (mem && Date.now() - mem.at < ttlMs) return mem.value as T;

  try {
    const stored = await browser.storage.local.get(storageKey(key));
    const entry = stored[storageKey(key)] as { at: number; value: T } | undefined;
    if (entry && Date.now() - entry.at < ttlMs) {
      memory.set(key, { at: entry.at, value: entry.value });
      return entry.value;
    }
  } catch {
    // cache é otimização; falhas não devem quebrar a extensão
  }
  return null;
}

export async function cacheSet<T>(key: string, value: T): Promise<void> {
  const entry = { at: Date.now(), value };
  memory.set(key, entry);
  try {
    await browser.storage.local.set({ [storageKey(key)]: entry });
  } catch {
    // ignora quota
  }
}

export async function cacheGetOrSet<T>(key: string, ttlMs: number, factory: () => Promise<T>): Promise<T> {
  const cached = await cacheGet<T>(key, ttlMs);
  if (cached !== null) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = factory()
    .then(async (value) => {
      await cacheSet(key, value);
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

export async function cacheDelete(key: string): Promise<void> {
  memory.delete(key);
  try {
    await browser.storage.local.remove(storageKey(key));
  } catch {
    // ignora
  }
}

export async function cacheDeleteByPrefix(prefix: string): Promise<void> {
  for (const key of Array.from(memory.keys())) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
  try {
    const all = await browser.storage.local.get(null);
    const keys = Object.keys(all).filter((key) => key.startsWith(`${CACHE_PREFIX}${prefix}`));
    if (keys.length > 0) await browser.storage.local.remove(keys);
  } catch {
    // ignora
  }
}

export async function cacheClear(): Promise<void> {
  memory.clear();
  inFlight.clear();
  try {
    const all = await browser.storage.local.get(null);
    const keys = Object.keys(all).filter((key) => key.startsWith(CACHE_PREFIX));
    if (keys.length > 0) await browser.storage.local.remove(keys);
  } catch {
    // ignora
  }
}

export function cacheStats(): { entries: number } {
  return { entries: memory.size };
}
