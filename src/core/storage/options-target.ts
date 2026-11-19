import { browser } from 'wxt/browser';

const KEY = 'sei-flow:options-target';
const TTL_MS = 60_000;

interface OptionsTarget {
  tab: string;
  at: number;
}

type SessionArea = {
  get: (keys: string | string[]) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

function sessionArea(): SessionArea | null {
  try {
    const storage = browser.storage as unknown as { session?: SessionArea };
    return storage.session ?? null;
  } catch {
    return null;
  }
}

function valid(target: Partial<OptionsTarget> | undefined): string | null {
  if (!target || typeof target.tab !== 'string' || !target.tab) return null;
  if (typeof target.at !== 'number' || Date.now() - target.at > TTL_MS) return null;
  return target.tab;
}

export async function setOptionsTarget(tab: string): Promise<void> {
  const value: OptionsTarget = { tab, at: Date.now() };
  const session = sessionArea();
  if (session) await session.set({ [KEY]: value });
  else await browser.storage.local.set({ [KEY]: value });
}

/** Lê e remove o alvo (para a página recém-aberta). */
export async function takeOptionsTarget(): Promise<string | null> {
  const session = sessionArea();
  const stored = session ? await session.get(KEY) : await browser.storage.local.get(KEY);
  if (session) await session.remove(KEY);
  else await browser.storage.local.remove(KEY);
  return valid(stored?.[KEY] as Partial<OptionsTarget> | undefined);
}

/** Avisa uma aba de opções já aberta para trocar de seção. */
export function watchOptionsTarget(listener: (tab: string) => void): () => void {
  const onChanged = browser.storage?.onChanged;
  if (!onChanged?.addListener) return () => undefined;
  const handler = (changes: Record<string, { newValue?: unknown }>, area: string): void => {
    if (area !== 'session' && area !== 'local') return;
    const value = valid(changes[KEY]?.newValue as Partial<OptionsTarget> | undefined);
    if (value) listener(value);
  };
  onChanged.addListener(handler);
  return () => onChanged.removeListener(handler);
}
