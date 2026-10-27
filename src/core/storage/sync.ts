import { browser } from 'wxt/browser';
import type { TrelloCard } from '../domain/types';

const SYNC_KEY = 'sei-flow:sync:v1';

export interface CardSnapshot {
  idList: string;
  dueComplete: boolean;
  name: string;
  description: string;
  due: string | null;
  labelIds: string[];
}

export type SyncSnapshot = Record<string, CardSnapshot>;

let memory: SyncSnapshot | null = null;

export function snapshotOf(card: TrelloCard): CardSnapshot {
  return {
    idList: card.idList,
    dueComplete: card.dueComplete,
    name: card.name,
    description: card.description,
    due: card.due,
    labelIds: card.labels.map((label) => label.id).sort(),
  };
}

function sanitize(value: unknown): SyncSnapshot {
  if (!value || typeof value !== 'object') return {};
  const result: SyncSnapshot = {};
  for (const [id, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    if (typeof item.idList !== 'string') continue;
    result[id] = {
      idList: item.idList,
      dueComplete: Boolean(item.dueComplete),
      name: typeof item.name === 'string' ? item.name : '',
      description: typeof item.description === 'string' ? item.description : '',
      due: typeof item.due === 'string' ? item.due : null,
      labelIds: Array.isArray(item.labelIds)
        ? item.labelIds.filter((label): label is string => typeof label === 'string').sort()
        : [],
    };
  }
  return result;
}

export async function getSyncSnapshot(): Promise<SyncSnapshot> {
  if (memory) return { ...memory };
  try {
    const stored = await browser.storage.local.get(SYNC_KEY);
    memory = sanitize(stored[SYNC_KEY]);
  } catch {
    memory = {};
  }
  return { ...memory };
}

async function persist(next: SyncSnapshot): Promise<void> {
  memory = next;
  try {
    await browser.storage.local.set({ [SYNC_KEY]: next });
  } catch {
    // snapshot é otimização; falhas não devem quebrar a sincronização
  }
}

/** Guarda o estado atual dos cartões para comparar na próxima atualização. */
export async function mergeSyncSnapshot(cards: TrelloCard[]): Promise<void> {
  const current = await getSyncSnapshot();
  for (const card of cards) current[card.id] = snapshotOf(card);
  await persist(current);
}

/** Substitui o snapshot inteiro, removendo cartões que saíram do escopo. */
export async function replaceSyncSnapshot(cards: TrelloCard[]): Promise<void> {
  const next: SyncSnapshot = {};
  for (const card of cards) next[card.id] = snapshotOf(card);
  await persist(next);
}

export async function forgetCards(cardIds: string[]): Promise<void> {
  const current = await getSyncSnapshot();
  let changed = false;
  for (const id of cardIds) {
    if (id in current) {
      delete current[id];
      changed = true;
    }
  }
  if (changed) await persist(current);
}

export async function clearSyncSnapshot(): Promise<void> {
  memory = {};
  try {
    await browser.storage.local.remove(SYNC_KEY);
  } catch {
    // ignora
  }
}
