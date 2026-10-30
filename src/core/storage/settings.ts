import { browser } from 'wxt/browser';
import type { Settings } from '../domain/types';

const SETTINGS_KEY = 'sei-flow:settings:v1';
export const DEFAULT_SETTINGS: Settings = {
  appKey: '',
  appToken: '',
  defaultBoardId: '',
  defaultBoardName: '',
  defaultListId: '',
  defaultListName: '',
  activatedOrigins: [],
  allSites: false,
  autoSeiHosts: false,
  theme: 'light',
  compact: true,
  notificationsEnabled: true,
  autoRefreshMinutes: 0,
};

function sanitize(value: Partial<Settings> | null | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...(value ?? {}),
    theme: value?.theme === 'dark' ? 'dark' : 'light',
    notificationsEnabled:
      typeof value?.notificationsEnabled === 'boolean' ? value.notificationsEnabled : true,
    activatedOrigins: Array.isArray(value?.activatedOrigins)
      ? [...new Set(value.activatedOrigins.filter((origin) => typeof origin === 'string' && origin.length > 0))]
      : [],
    autoSeiHosts: value?.autoSeiHosts === true,
    autoRefreshMinutes:
      typeof value?.autoRefreshMinutes === 'number' && value.autoRefreshMinutes >= 0
        ? value.autoRefreshMinutes
        : 0,
  };
}

async function migrateLegacySettings(): Promise<Partial<Settings> | null> {
  try {
    const legacy = await browser.storage.sync.get(['appKey', 'appToken', 'defaultBoard', 'defaultList']);
    if (!legacy?.appKey && !legacy?.appToken) return null;
    return {
      appKey: typeof legacy.appKey === 'string' ? legacy.appKey : '',
      appToken: typeof legacy.appToken === 'string' ? legacy.appToken : '',
      defaultBoardName: typeof legacy.defaultBoard === 'string' ? legacy.defaultBoard : '',
      defaultListName: typeof legacy.defaultList === 'string' ? legacy.defaultList : '',
    };
  } catch {
    return null;
  }
}

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  const current = stored[SETTINGS_KEY] as Partial<Settings> | undefined;
  if (current) return sanitize(current);

  const legacy = await migrateLegacySettings();
  const settings = sanitize(legacy);
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
  return settings;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = sanitize({ ...current, ...patch });
  await browser.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function clearSettings(): Promise<void> {
  await browser.storage.local.remove(SETTINGS_KEY);
}

export function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function originPermissionPattern(origin: string): string {
  return `${origin}/*`;
}

export function isOriginActivated(url: string, settings: Settings): boolean {
  const origin = normalizeOrigin(url);
  if (!origin) return false;
  if (settings.allSites) return true;
  if (settings.autoSeiHosts && isSeiHost(origin)) return true;
  return settings.activatedOrigins.includes(origin);
}

/** Sites cujo host começa com "sei" (ex.: sei.ufsc.br, seiprocesos...). */
export function isSeiHost(url: string): boolean {
  const origin = normalizeOrigin(url);
  if (!origin) return false;
  try {
    return new URL(origin).hostname.toLowerCase().startsWith('sei');
  } catch {
    return false;
  }
}

export function addActivatedOrigin(settings: Settings, origin: string): Settings {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return settings;
  if (settings.activatedOrigins.includes(normalized)) return settings;
  return { ...settings, activatedOrigins: [...settings.activatedOrigins, normalized] };
}

export function removeActivatedOrigin(settings: Settings, origin: string): Settings {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return settings;
  return { ...settings, activatedOrigins: settings.activatedOrigins.filter((item) => item !== normalized) };
}

/**
 * Avisa quando as configurações mudam em outra página (ex.: tema alterado no painel
 * ou nas opções) para atualizar a interface já aberta.
 */
export function watchSettings(listener: (settings: Settings) => void): () => void {
  const onChanged = browser.storage?.onChanged;
  if (!onChanged?.addListener) return () => undefined;
  const handler = (
    changes: Record<string, { newValue?: unknown }>,
    area: string,
  ): void => {
    if (area !== 'local') return;
    const next = changes[SETTINGS_KEY]?.newValue;
    if (!next) return;
    listener(sanitize(next as Partial<Settings>));
  };
  onChanged.addListener(handler);
  return () => onChanged.removeListener(handler);
}
