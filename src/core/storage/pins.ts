import { browser } from 'wxt/browser';

const PINS_KEY = 'sei-flow:pinned-cards:v1';

type Listener = (ids: string[]) => void;

let cache: Set<string> | null = null;
let loadPromise: Promise<Set<string>> | null = null;
let listening = false;
const listeners = new Set<Listener>();

function notify(): void {
  const values = Array.from(cache ?? []);
  for (const listener of listeners) listener(values);
}

function attachStorageListener(): void {
  if (listening) return;
  listening = true;
  try {
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const change = changes[PINS_KEY];
      if (!change) return;
      const value = change.newValue;
      cache = new Set(
        Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [],
      );
      notify();
    });
  } catch {
    // storage.onChanged não existe em alguns ambientes de teste.
  }
}

async function load(): Promise<Set<string>> {
  if (cache) return cache;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const stored = await browser.storage.local.get(PINS_KEY);
      const value = stored[PINS_KEY];
      cache = new Set(
        Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [],
      );
    } catch {
      cache = new Set();
    }
    return cache;
  })().finally(() => {
    loadPromise = null;
  });
  return loadPromise;
}

async function save(next: Set<string>): Promise<string[]> {
  cache = next;
  const values = Array.from(next);
  try {
    await browser.storage.local.set({ [PINS_KEY]: values });
  } catch {
    // favorito é otimização local; mantém em memória
  }
  notify();
  return values;
}

export async function getPinnedCards(): Promise<string[]> {
  return Array.from(await load());
}

export async function isCardPinned(cardId: string): Promise<boolean> {
  return (await load()).has(cardId);
}

export async function setCardPinned(cardId: string, pinned: boolean): Promise<string[]> {
  const current = new Set(await load());
  if (pinned) current.add(cardId);
  else current.delete(cardId);
  return save(current);
}

export async function toggleCardPinned(cardId: string): Promise<string[]> {
  const current = new Set(await load());
  if (current.has(cardId)) current.delete(cardId);
  else current.add(cardId);
  return save(current);
}

export function watchPinnedCards(listener: Listener): () => void {
  attachStorageListener();
  listeners.add(listener);
  void load().then((ids) => listener(Array.from(ids)));
  return () => listeners.delete(listener);
}
