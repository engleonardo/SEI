import { browser } from 'wxt/browser';
import { normalizeProcessNumber } from '../domain/process';
import { normalizeOrigin } from './settings';

const PROCESSES_KEY = 'sei-flow:processes:v1';
const MAX_PROCESSES = 4000;

export interface ProcessRecord {
  number: string;
  specification: string;
  processType: string;
  url: string;
  origin: string;
  unread: boolean;
  /** Usuário já viu/dispensou a novidade sem que o SEI tenha marcado como lido. */
  acknowledged?: boolean;
  updatedAt: number;
}

export type ProcessCatalog = Record<string, ProcessRecord>;

function sanitizeRecord(value: unknown, fallbackNumber?: string): ProcessRecord | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<ProcessRecord>;
  const number = normalizeProcessNumber(raw.number ?? fallbackNumber) ?? '';
  if (!number) return null;

  let url = typeof raw.url === 'string' ? raw.url.trim() : '';
  if (url && !/^https?:\/\//i.test(url)) url = '';
  const origin =
    (typeof raw.origin === 'string' ? normalizeOrigin(raw.origin) : null) ??
    (url ? normalizeOrigin(url) : null) ??
    '';

  return {
    number,
    specification: typeof raw.specification === 'string' ? raw.specification.trim() : '',
    processType: typeof raw.processType === 'string' ? raw.processType.trim() : '',
    url,
    origin,
    unread: Boolean(raw.unread),
    acknowledged: Boolean(raw.acknowledged),
    updatedAt:
      typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt)
        ? raw.updatedAt
        : Date.now(),
  };
}

export async function getProcessCatalog(): Promise<ProcessCatalog> {
  try {
    const stored = await browser.storage.local.get(PROCESSES_KEY);
    const value = stored[PROCESSES_KEY];
    if (!value || typeof value !== 'object') return {};
    const catalog: ProcessCatalog = {};
    for (const [key, record] of Object.entries(value as Record<string, unknown>)) {
      const sanitized = sanitizeRecord(record, key);
      if (sanitized) catalog[sanitized.number] = sanitized;
    }
    return catalog;
  } catch {
    return {};
  }
}

export async function listProcessRecords(): Promise<ProcessRecord[]> {
  const catalog = await getProcessCatalog();
  return Object.values(catalog).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function upsertProcessRecords(
  records: Array<Partial<ProcessRecord> & { number: string }>,
): Promise<{ updated: number; total: number; unread: string[] }> {
  const catalog = await getProcessCatalog();
  let updated = 0;
  const now = Date.now();
  const unread: string[] = [];

  for (const input of records) {
    const sanitized = sanitizeRecord({ ...input, updatedAt: now }, input.number);
    if (!sanitized) continue;
    const previous = catalog[sanitized.number];
    const sourceUnread =
      input.unread === undefined ? (previous?.unread ?? false) : sanitized.unread;
    // Uma novidade nova no SEI sempre volta a aparecer, mesmo que a anterior
    // tenha sido dispensada pelo usuário.
    const sourceTransition = Boolean(previous && !previous.unread && sourceUnread);
    const acknowledged = sourceTransition
      ? false
      : input.acknowledged === true
        ? true
        : input.unread === false
          ? false
          : (previous?.acknowledged ?? false);

    const next: ProcessRecord = {
      ...previous,
      ...sanitized,
      // `unread` é o estado da fonte (SEI); `acknowledged` é só a ciência do usuário.
      unread: sourceUnread,
      acknowledged,
      specification: sanitized.specification || previous?.specification || '',
      processType: sanitized.processType || previous?.processType || '',
      url: sanitized.url || previous?.url || '',
      origin: sanitized.origin || previous?.origin || '',
    };
    if (
      previous &&
      previous.specification === next.specification &&
      previous.processType === next.processType &&
      previous.url === next.url &&
      previous.origin === next.origin &&
      previous.unread === next.unread &&
      Boolean(previous.acknowledged) === Boolean(next.acknowledged)
    ) {
      continue;
    }
    // Só conta como novidade quando o processo já era conhecido e passou a ter atualização.
    if (sourceTransition) {
      unread.push(next.number);
    }
    catalog[sanitized.number] = next;
    updated += 1;
  }

  if (updated > 0) {
    const entries = Object.values(catalog)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_PROCESSES);
    const trimmed: ProcessCatalog = {};
    for (const entry of entries) trimmed[entry.number] = entry;
    try {
      await browser.storage.local.set({ [PROCESSES_KEY]: trimmed });
    } catch {
      return { updated: 0, total: Object.keys(catalog).length, unread: [] };
    }
  }

  return { updated, total: Object.keys(catalog).length, unread };
}
