import { browser } from 'wxt/browser';
import type { Rule } from '../domain/rules';
import type { Settings } from '../domain/types';
import { getRules, saveRules } from './rules';
import { getSettings, normalizeOrigin, originPermissionPattern, saveSettings } from './settings';

export interface SettingsBackup {
  app: 'sei-flow';
  kind: 'settings-backup';
  version: 1;
  exportedAt: number;
  settings: Partial<Settings>;
  rules: Rule[];
}

export interface ImportResult {
  rules: number;
  settings: Settings;
}

function pickSettings(settings: Settings): Partial<Settings> {
  return {
    defaultBoardId: settings.defaultBoardId,
    defaultBoardName: settings.defaultBoardName,
    defaultListId: settings.defaultListId,
    defaultListName: settings.defaultListName,
    activatedOrigins: [...settings.activatedOrigins],
    allSites: settings.allSites,
    theme: settings.theme,
    compact: settings.compact,
    notificationsEnabled: settings.notificationsEnabled,
    autoRefreshMinutes: settings.autoRefreshMinutes,
  };
}

export async function exportBackup(includeCredentials: boolean): Promise<SettingsBackup> {
  const settings = await getSettings();
  const rules = await getRules();
  const payload = pickSettings(settings);
  if (includeCredentials) {
    payload.appKey = settings.appKey;
    payload.appToken = settings.appToken;
  }
  return {
    app: 'sei-flow',
    kind: 'settings-backup',
    version: 1,
    exportedAt: Date.now(),
    settings: payload,
    rules,
  };
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

type PermissionsApi = {
  contains?: (permissions: { origins?: string[] }) => Promise<boolean>;
};

async function hasPermission(origins: string[]): Promise<boolean> {
  try {
    const permissions = (browser as unknown as { permissions?: PermissionsApi }).permissions;
    if (!permissions?.contains) return true;
    return await permissions.contains({ origins });
  } catch {
    return false;
  }
}

/**
 * Só mantém sites que o navegador realmente autoriza. Ao importar em outra
 * máquina, as permissões opcionais precisam ser concedidas de novo.
 */
async function reconcileOrigins(origins: string[]): Promise<string[]> {
  const granted: string[] = [];
  for (const origin of origins) {
    const normalized = normalizeOrigin(origin);
    if (!normalized) continue;
    if (await hasPermission([originPermissionPattern(normalized)])) {
      granted.push(normalized);
    }
  }
  return Array.from(new Set(granted));
}

export async function importBackup(value: unknown): Promise<ImportResult> {
  const data = value as Partial<SettingsBackup> | null;
  if (!data || data.app !== 'sei-flow' || !data.settings || typeof data.settings !== 'object') {
    throw new Error('Backup inválido. Use um arquivo gerado pelo SEI Flow.');
  }

  const current = await getSettings();
  const incoming = data.settings as Partial<Settings>;
  const incomingOrigins = Array.isArray(incoming.activatedOrigins)
    ? incoming.activatedOrigins.filter((origin): origin is string => typeof origin === 'string')
    : current.activatedOrigins;
  const origins = await reconcileOrigins(incomingOrigins);
  const wantsAllSites = asBoolean(incoming.allSites, current.allSites);
  const allSites = wantsAllSites ? await hasPermission(['*://*/*']) : false;

  const patch: Partial<Settings> = {
    defaultBoardId: asString(incoming.defaultBoardId, current.defaultBoardId),
    defaultBoardName: asString(incoming.defaultBoardName, current.defaultBoardName),
    defaultListId: asString(incoming.defaultListId, current.defaultListId),
    defaultListName: asString(incoming.defaultListName, current.defaultListName),
    activatedOrigins: origins,
    allSites,
    theme: incoming.theme === 'dark' ? 'dark' : 'light',
    compact: asBoolean(incoming.compact, current.compact),
    notificationsEnabled: asBoolean(
      incoming.notificationsEnabled,
      current.notificationsEnabled,
    ),
    autoRefreshMinutes:
      typeof incoming.autoRefreshMinutes === 'number' && incoming.autoRefreshMinutes >= 0
        ? incoming.autoRefreshMinutes
        : current.autoRefreshMinutes,
  };

  if (typeof incoming.appKey === 'string' && incoming.appKey.trim()) {
    patch.appKey = incoming.appKey.trim();
  }
  if (typeof incoming.appToken === 'string' && incoming.appToken.trim()) {
    patch.appToken = incoming.appToken.trim();
  }

  const settings = await saveSettings(patch);
  let rules = 0;
  if (Array.isArray(data.rules)) {
    rules = (await saveRules(data.rules)).length;
  }
  return { rules, settings };
}
