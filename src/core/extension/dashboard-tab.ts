import { browser } from 'wxt/browser';

const TAB_KEY = 'sei-flow:dashboard-tab';
const DASHBOARD_PATH = '/dashboard.html';

type SessionArea = {
  get: (keys: string | string[]) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

let memoryTabId: number | null = null;

function sessionArea(): SessionArea | null {
  try {
    const storage = browser.storage as unknown as { session?: SessionArea };
    return storage.session ?? null;
  } catch {
    return null;
  }
}

async function getStoredTabId(): Promise<number | null> {
  if (memoryTabId !== null) return memoryTabId;
  const session = sessionArea();
  if (!session) return null;
  try {
    const stored = await session.get(TAB_KEY);
    const value = stored[TAB_KEY];
    return typeof value === 'number' ? value : null;
  } catch {
    return null;
  }
}

async function storeTabId(tabId: number | null): Promise<void> {
  memoryTabId = tabId;
  const session = sessionArea();
  if (!session) return;
  try {
    if (tabId === null) await session.remove(TAB_KEY);
    else await session.set({ [TAB_KEY]: tabId });
  } catch {
    // sessão indisponível: o id continua em memória enquanto o worker viver
  }
}

async function focusTab(tab: { id?: number; windowId?: number }): Promise<boolean> {
  if (typeof tab.id !== 'number') return false;
  try {
    await browser.tabs.update(tab.id, { active: true });
  } catch {
    return false;
  }
  if (typeof tab.windowId === 'number') {
    await browser.windows.update(tab.windowId, { focused: true }).catch(() => undefined);
  }
  return true;
}

/**
 * Abre o painel reaproveitando a aba já aberta.
 * Ordem: aba do painel encontrada pela URL -> id guardado na sessão -> nova aba.
 */
export async function openDashboardTab(): Promise<void> {
  const url = browser.runtime.getURL(DASHBOARD_PATH);

  try {
    const tabs = await browser.tabs.query({ url });
    const existing = tabs.find((tab) => typeof tab.id === 'number');
    if (existing && (await focusTab(existing))) {
      await storeTabId(existing.id ?? null);
      return;
    }
  } catch {
    // sem permissão de URL: tenta pelo id da sessão
  }

  const stored = await getStoredTabId();
  if (stored !== null) {
    try {
      const tab = await browser.tabs.get(stored);
      if (await focusTab(tab)) return;
    } catch {
      await storeTabId(null);
    }
  }

  const created = await browser.tabs.create({ url });
  if (typeof created.id === 'number') await storeTabId(created.id);
}
