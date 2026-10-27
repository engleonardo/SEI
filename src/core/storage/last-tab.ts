import { browser } from 'wxt/browser';

const LAST_TAB_KEY = 'sei-flow:last-action-tab';

export interface LastActionTab {
  id?: number;
  url: string;
  title: string;
  capturedAt: number;
}

type SessionArea = {
  get: (keys: string | string[]) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
};

function sessionArea(): SessionArea | null {
  try {
    const storage = browser.storage as unknown as { session?: SessionArea };
    return storage.session ?? null;
  } catch {
    return null;
  }
}

export async function saveLastActionTab(tab: {
  id?: number;
  url?: string;
  title?: string;
}): Promise<void> {
  if (!tab.url) return;
  const value: LastActionTab = {
    id: tab.id,
    url: tab.url,
    title: tab.title ?? '',
    capturedAt: Date.now(),
  };
  const session = sessionArea();
  try {
    if (session) await session.set({ [LAST_TAB_KEY]: value });
    else await browser.storage.local.set({ [LAST_TAB_KEY]: value });
  } catch {
    // contexto pode não permitir session storage; o dashboard continua abrindo
  }
}

export async function getLastActionTab(): Promise<LastActionTab | null> {
  const read = async (area: { get: SessionArea['get'] } | null) => {
    if (!area) return null;
    try {
      const stored = await area.get(LAST_TAB_KEY);
      const value = stored[LAST_TAB_KEY];
      if (!value || typeof value !== 'object') return null;
      const raw = value as Partial<LastActionTab>;
      if (typeof raw.url !== 'string' || !raw.url) return null;
      return {
        id: typeof raw.id === 'number' ? raw.id : undefined,
        url: raw.url,
        title: typeof raw.title === 'string' ? raw.title : '',
        capturedAt:
          typeof raw.capturedAt === 'number' && Number.isFinite(raw.capturedAt)
            ? raw.capturedAt
            : 0,
      } satisfies LastActionTab;
    } catch {
      return null;
    }
  };

  const fromSession = await read(sessionArea());
  if (fromSession) return fromSession;
  return read(browser.storage.local);
}
