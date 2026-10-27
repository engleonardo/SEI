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
    const next: ProcessRecord = {
      ...previous,
      ...sanitized,
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
      previous.unread === next.unread
    ) {
      continue;
    }
    // Só conta como novidade quando o processo já era conhecido e passou a ter atualização.
    if (previous && !previous.unread && next.unread) {
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
