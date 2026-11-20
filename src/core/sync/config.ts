import { browser } from 'wxt/browser';
import { loadTrelloCredentials } from '../auth/credentials';
import type { Settings } from '../domain/types';
import { getRules, saveRules } from '../storage/rules';
import { getSettings, saveSettings } from '../storage/settings';
import { TrelloClient } from '../trello/client';

/**
 * Sincronização de configurações entre navegadores usando o próprio Trello.
 *
 * O JSON fica em um quadro privado chamado "SEI Flow - Configurações", em
 * cartões `config:0`, `config:1`... (descrição em chunks). Assim o mesmo
 * usuário vê as mesmas regras e destino em Chrome, Edge e Firefox, sem backend.
 * Nenhum token é sincronizado.
 */

export const CONFIG_BOARD_NAME = 'SEI Flow - Configurações (não excluir)';

const EM_DASH = String.fromCharCode(0x2014);

const LEGACY_CONFIG_BOARD_NAMES = [
  `SEI Flow ${EM_DASH} Configurações`,
  `SEI Flow ${EM_DASH} Configurações (não excluir)`,
];
export const CONFIG_LIST_NAME = 'config';

const CARD_PREFIX = 'config:';
const CHUNK_SIZE = 10_000;
const META_KEY = 'sei-flow:sync:config:v1';
const DIRTY_KEY = 'sei-flow:sync:config-dirty:v1';
const BACKUP_KEY = 'sei-flow:sync:config-backup:v1';
const MIN_INTERVAL_MS = 60_000;

interface SyncMeta {
  boardId?: string;
  listId?: string;
  updatedAt: number;
  lastAttemptAt: number;
}

interface BoardLite {
  id: string;
  name: string;
}

interface ListLite {
  id: string;
  name: string;
}

interface CardLite {
  id: string;
  name: string;
  desc: string;
  idList: string;
}

interface RemoteConfig {
  v: number;
  updatedAt: number;
  rules: unknown;
  settings?: Partial<Settings>;
}

export interface SyncResult {
  pulled: boolean;
  pushed: boolean;
  skipped?: boolean;
  updatedAt: number;
}

const DESTINATION_KEYS = [
  'defaultBoardId',
  'defaultBoardName',
  'defaultListId',
  'defaultListName',
] as const;

export function isConfigBoardName(name: string | undefined | null): boolean {
  const value = (name ?? '').trim();
  return value === CONFIG_BOARD_NAME || LEGACY_CONFIG_BOARD_NAMES.includes(value);
}

async function readMeta(): Promise<SyncMeta> {
  const stored = await browser.storage.local.get(META_KEY);
  const value = stored?.[META_KEY] as Partial<SyncMeta> | undefined;
  return {
    boardId: typeof value?.boardId === 'string' ? value.boardId : undefined,
    listId: typeof value?.listId === 'string' ? value.listId : undefined,
    updatedAt:
      typeof value?.updatedAt === 'number' && Number.isFinite(value.updatedAt)
        ? value.updatedAt
        : 0,
    lastAttemptAt:
      typeof value?.lastAttemptAt === 'number' && Number.isFinite(value.lastAttemptAt)
        ? value.lastAttemptAt
        : 0,
  };
}

async function writeMeta(meta: SyncMeta): Promise<void> {
  await browser.storage.local.set({ [META_KEY]: meta });
}

async function readDirty(): Promise<boolean> {
  const stored = await browser.storage.local.get(DIRTY_KEY);
  return stored?.[DIRTY_KEY] === true;
}

async function markDirty(): Promise<void> {
  await browser.storage.local.set({ [DIRTY_KEY]: true });
}

async function clearDirty(): Promise<void> {
  await browser.storage.local.remove(DIRTY_KEY);
}

async function findBoard(client: TrelloClient): Promise<BoardLite | null> {
  const boards = await client.get<BoardLite[]>('/members/me/boards', {
    filter: 'all',
    fields: 'id,name',
  });
  const found = (boards ?? []).find((board) => isConfigBoardName(board.name));
  if (!found) return null;
  if (found.name !== CONFIG_BOARD_NAME) {
    // Migra o nome antigo (com travessão) para o novo padrão.
    await client.put(`/boards/${found.id}`, { name: CONFIG_BOARD_NAME });
    found.name = CONFIG_BOARD_NAME;
  }
  return found;
}

async function findList(client: TrelloClient, boardId: string): Promise<ListLite | null> {
  const lists = await client.get<ListLite[]>(`/boards/${boardId}/lists`, {
    fields: 'id,name',
  });
  return (lists ?? []).find((list) => list.name === CONFIG_LIST_NAME) ?? null;
}

async function ensureBoard(client: TrelloClient): Promise<BoardLite> {
  const found = await findBoard(client);
  if (found) return found;
  return client.post<BoardLite>('/boards', {
    name: CONFIG_BOARD_NAME,
    prefs_permissionLevel: 'private',
  });
}

async function ensureList(client: TrelloClient, boardId: string): Promise<ListLite> {
  const found = await findList(client, boardId);
  if (found) return found;
  return client.post<ListLite>(`/boards/${boardId}/lists`, { name: CONFIG_LIST_NAME });
}

function parseRemote(json: string): RemoteConfig | null {
  try {
    const parsed = JSON.parse(json) as Partial<RemoteConfig>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.updatedAt !== 'number' || !Number.isFinite(parsed.updatedAt)) return null;
    return {
      v: typeof parsed.v === 'number' ? parsed.v : 1,
      updatedAt: parsed.updatedAt,
      rules: Array.isArray(parsed.rules) ? parsed.rules : [],
      settings: parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {},
    };
  } catch {
    return null;
  }
}

async function readRemote(
  client: TrelloClient,
): Promise<{ config: RemoteConfig; boardId: string; listId: string } | null> {
  const board = await findBoard(client);
  if (!board) return null;
  const list = await findList(client, board.id);
  if (!list) return null;

  const cards = await client.get<CardLite[]>(`/boards/${board.id}/cards`, {
    fields: 'id,name,desc,idList',
  });
  const chunks = (cards ?? [])
    .filter((card) => card.idList === list.id && card.name.startsWith(CARD_PREFIX))
    .sort(
      (a, b) => Number(a.name.slice(CARD_PREFIX.length)) - Number(b.name.slice(CARD_PREFIX.length)),
    );
  if (chunks.length === 0) return null;

  const config = parseRemote(chunks.map((card) => card.desc).join(''));
  if (!config) return null;
  return { config, boardId: board.id, listId: list.id };
}

async function writeRemote(
  client: TrelloClient,
  config: RemoteConfig,
): Promise<{ boardId: string; listId: string }> {
  const board = await ensureBoard(client);
  const list = await ensureList(client, board.id);

  const cards = await client.get<CardLite[]>(`/boards/${board.id}/cards`, {
    fields: 'id,name,desc,idList',
  });
  const existing = (cards ?? []).filter(
    (card) => card.idList === list.id && card.name.startsWith(CARD_PREFIX),
  );
  for (const card of existing) {
    await client.delete(`/cards/${card.id}`);
  }

  const json = JSON.stringify(config);
  const chunks: string[] = [];
  for (let index = 0; index < json.length; index += CHUNK_SIZE) {
    chunks.push(json.slice(index, index + CHUNK_SIZE));
  }
  for (const [index, chunk] of chunks.entries()) {
    await client.post('/cards', {
      name: `${CARD_PREFIX}${index}`,
      desc: chunk,
      idList: list.id,
    });
  }

  return { boardId: board.id, listId: list.id };
}

async function localSnapshot(): Promise<RemoteConfig> {
  const [rules, settings] = await Promise.all([getRules(), getSettings()]);
  const destination: Partial<Settings> = {};
  for (const key of DESTINATION_KEYS) {
    if (typeof settings[key] === 'string') destination[key] = settings[key] as string;
  }
  return { v: 1, updatedAt: Date.now(), rules, settings: destination };
}

function isDefaultSeed(rules: RemoteConfig['rules']): boolean {
  if (!Array.isArray(rules) || rules.length !== 1) return false;
  const rule = rules[0] as Record<string, unknown>;
  return rule.name === 'Nova regra' && !rule.enabled && !rule.boardId;
}

interface ConfigBackup {
  owner?: string;
  at: number;
  rules: unknown;
  settings: Partial<Settings>;
}

/**
 * Salva uma cópia local antes do logout, caso o push final falhe (offline).
 * Fica fora das chaves ativas, então a interface não mostra resquício.
 */
export async function backupLocalConfig(owner?: string): Promise<void> {
  const snapshot = await localSnapshot();
  const backup: ConfigBackup = {
    owner,
    at: Date.now(),
    rules: snapshot.rules,
    settings: snapshot.settings ?? {},
  };
  await browser.storage.local.set({ [BACKUP_KEY]: backup });
}

/**
 * Restaura a cópia local apenas para o mesmo dono. Se for de outra conta,
 * descarta para não vazar configuração entre usuários.
 */
export async function restoreLocalConfig(owner?: string): Promise<boolean> {
  const stored = await browser.storage.local.get(BACKUP_KEY);
  const backup = stored?.[BACKUP_KEY] as Partial<ConfigBackup> | undefined;
  if (!backup) return false;
  if (!owner) return false;
  if (backup.owner !== owner) {
    await browser.storage.local.remove(BACKUP_KEY);
    return false;
  }
  await saveRules(Array.isArray(backup.rules) ? backup.rules : []);
  const patch: Partial<Settings> = {};
  for (const key of DESTINATION_KEYS) {
    const value = backup.settings?.[key];
    if (typeof value === 'string') patch[key] = value;
  }
  if (Object.keys(patch).length > 0) await saveSettings(patch);
  await browser.storage.local.remove(BACKUP_KEY);
  await markDirty();
  return true;
}

export async function clearLocalConfigBackup(): Promise<void> {
  await browser.storage.local.remove(BACKUP_KEY);
}

function isMeaningful(config: RemoteConfig): boolean {
  if (isDefaultSeed(config.rules)) return false;
  if (Array.isArray(config.rules) && config.rules.length > 0) return true;
  const settings = config.settings ?? {};
  return Boolean(settings.defaultBoardId && settings.defaultListId);
}

async function applyRemote(config: RemoteConfig): Promise<void> {
  await saveRules(Array.isArray(config.rules) ? config.rules : []);
  const patch: Partial<Settings> = {};
  for (const key of DESTINATION_KEYS) {
    const value = config.settings?.[key];
    if (typeof value === 'string') patch[key] = value;
  }
  if (Object.keys(patch).length > 0) await saveSettings(patch);
}

async function pushConfig(client: TrelloClient): Promise<SyncResult> {
  const snapshot = await localSnapshot();
  const info = await writeRemote(client, snapshot);
  await writeMeta({
    ...info,
    updatedAt: snapshot.updatedAt,
    lastAttemptAt: Date.now(),
  });
  pendingPush = false;
  await clearDirty();
  return { pulled: false, pushed: true, updatedAt: snapshot.updatedAt };
}

let syncChain: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = syncChain.then(task, task);
  syncChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Envia o estado local agora (usado após salvar regras/destino). */
export function pushConfigNow(): Promise<SyncResult> {
  return enqueue(async () => {
    const client = new TrelloClient(loadTrelloCredentials);
    return pushConfig(client);
  });
}

/**
 * Pull/push conforme o mais recente. A primeira sincronização de um navegador
 * vazio não sobrescreve o Trello com as regras padrão.
 */
async function runSync(options: { force?: boolean } = {}): Promise<SyncResult> {
  const client = new TrelloClient(loadTrelloCredentials);
  if (pendingPush) {
    // Mudança local ainda não enviada: envia antes de qualquer pull.
    return pushConfig(client);
  }

  const meta = await readMeta();
  const dirty = await readDirty();
  const now = Date.now();
  if (dirty) return pushConfig(client);
  if (!options.force && meta.lastAttemptAt && now - meta.lastAttemptAt < MIN_INTERVAL_MS) {
    return { pulled: false, pushed: false, skipped: true, updatedAt: meta.updatedAt };
  }

  const remote = await readRemote(client);

  if (!remote) {
    const snapshot = await localSnapshot();
    if (!isMeaningful(snapshot)) {
      await writeMeta({ ...meta, lastAttemptAt: now });
      return { pulled: false, pushed: false, skipped: true, updatedAt: meta.updatedAt };
    }
    const result = await pushConfig(client);
    return result;
  }

  const { config, boardId, listId } = remote;

  if (config.updatedAt > meta.updatedAt) {
    await applyRemote(config);
    await writeMeta({ boardId, listId, updatedAt: config.updatedAt, lastAttemptAt: now });
    return { pulled: true, pushed: false, updatedAt: config.updatedAt };
  }

  if (meta.updatedAt > config.updatedAt) {
    return pushConfig(client);
  }

  await writeMeta({ boardId, listId, updatedAt: config.updatedAt, lastAttemptAt: now });
  return { pulled: false, pushed: false, updatedAt: config.updatedAt };
}

/** Serializa sync/push (login, painel, alarme e logout) para não corromper o quadro. */
export function syncConfig(options: { force?: boolean } = {}): Promise<SyncResult> {
  return enqueue(() => runSync(options));
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPush = false;

/** Agenda um push depois de mudanças em regras/destino (debounce). */
export function queueConfigSync(): void {
  pendingPush = true;
  void markDirty().catch(() => undefined);
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushConfigNow().catch(() => undefined);
  }, 1_500);
}

/** Cancela um push pendente (usado no logout, antes de limpar os dados). */
export function cancelConfigSync(): void {
  pendingPush = false;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
}

/** Esquece a última sincronização para o próximo login puxar do Trello. */
export async function clearConfigSyncMeta(): Promise<void> {
  await browser.storage.local.remove([META_KEY, DIRTY_KEY]);
}
