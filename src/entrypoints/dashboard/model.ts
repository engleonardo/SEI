import type { TrelloCard } from '../../core/domain/types';
import type { ProcessCatalog, ProcessRecord } from '../../core/storage/processes';

export type DueFilter = 'any' | 'open' | 'overdue' | 'today' | 'soon' | 'complete' | 'none';
export type ActivityFilter = 'any' | 'today' | '7d' | '30d' | 'sinceVisit';
export type ProcessUpdateFilter = 'any' | 'unread' | 'read';
export type GroupMode = 'due' | 'board' | 'list' | 'type' | 'label' | 'none';
export type SortMode = 'due' | 'activity' | 'name' | 'list' | 'board' | 'label' | 'type';
export type LinkFilter = 'linked' | 'unlinked';

export interface DashboardFilters {
  search: string;
  boardId: string;
  listId: string;
  processType: string;
  labelIds: string[];
  withoutLabels: boolean;
  due: DueFilter;
  activity: ActivityFilter;
  processUpdate: ProcessUpdateFilter;
  sort: SortMode;
  group: GroupMode;
  link: LinkFilter;
}

export const DEFAULT_FILTERS: DashboardFilters = {
  search: '',
  boardId: '',
  listId: '',
  processType: '',
  labelIds: [],
  withoutLabels: false,
  due: 'any',
  activity: 'any',
  processUpdate: 'any',
  sort: 'due',
  group: 'due',
  link: 'linked',
};

export type DueBucket = 'overdue' | 'today' | 'soon' | 'later' | 'none' | 'done';

export const DUE_BUCKETS: Array<{ key: DueBucket; title: string; tone: string }> = [
  { key: 'overdue', title: 'Atrasados', tone: 'danger' },
  { key: 'today', title: 'Vencem hoje', tone: 'warning' },
  { key: 'soon', title: 'Próximos 7 dias', tone: 'accent' },
  { key: 'later', title: 'Mais adiante', tone: 'neutral' },
  { key: 'none', title: 'Sem prazo', tone: 'neutral' },
  { key: 'done', title: 'Concluídos', tone: 'success' },
];

export const DUE_FILTER_OPTIONS: Array<{ value: DueFilter; label: string }> = [
  { value: 'any', label: 'Todos os prazos' },
  { value: 'open', label: 'Em aberto (com prazo)' },
  { value: 'overdue', label: 'Atrasados' },
  { value: 'today', label: 'Vencem hoje' },
  { value: 'soon', label: 'Próximos 7 dias' },
  { value: 'complete', label: 'Concluídos' },
  { value: 'none', label: 'Sem prazo' },
];

export const ACTIVITY_FILTER_OPTIONS: Array<{ value: ActivityFilter; label: string }> = [
  { value: 'any', label: 'Qualquer atualização' },
  { value: 'today', label: 'Atualizados hoje' },
  { value: '7d', label: 'Atualizados nos últimos 7 dias' },
  { value: '30d', label: 'Atualizados nos últimos 30 dias' },
  { value: 'sinceVisit', label: 'Atualizados desde a última visita' },
];

export const PROCESS_UPDATE_OPTIONS: Array<{ value: ProcessUpdateFilter; label: string }> = [
  { value: 'any', label: 'Qualquer situação no SEI' },
  { value: 'unread', label: 'Processos atualizados (não lidos)' },
  { value: 'read', label: 'Processos sem atualização' },
];

export const GROUP_OPTIONS: Array<{ value: GroupMode; label: string }> = [
  { value: 'due', label: 'Por prazo' },
  { value: 'board', label: 'Por quadro' },
  { value: 'list', label: 'Por lista' },
  { value: 'type', label: 'Por tipo de processo' },
  { value: 'label', label: 'Por etiqueta' },
  { value: 'none', label: 'Lista única' },
];

/** Cada ordenação define também como os cartões são agrupados na tela. */
export const SORT_GROUPS: Record<SortMode, GroupMode> = {
  due: 'due',
  activity: 'none',
  name: 'none',
  list: 'list',
  board: 'board',
  label: 'label',
  type: 'type',
};

export const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: 'due', label: 'Prazo (mais próximo primeiro)' },
  { value: 'activity', label: 'Atualização mais recente' },
  { value: 'name', label: 'Nome (A-Z)' },
  { value: 'list', label: 'Lista' },
  { value: 'board', label: 'Quadro e lista' },
  { value: 'label', label: 'Etiqueta' },
  { value: 'type', label: 'Tipo de processo' },
];

const FILTERS_KEY = 'sei-flow:dashboard:filters:v1';
const LAST_VISIT_KEY = 'sei-flow:dashboard:last-visit:v1';

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function dueBucket(card: TrelloCard): DueBucket {
  if (card.dueComplete) return 'done';
  if (!card.due) return 'none';
  const due = startOfDay(new Date(card.due));
  if (Number.isNaN(due.getTime())) return 'none';
  const today = startOfDay(new Date());
  if (due.getTime() < today.getTime()) return 'overdue';
  if (due.getTime() === today.getTime()) return 'today';
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 7);
  if (due.getTime() <= soon.getTime()) return 'soon';
  return 'later';
}

export function activityTime(card: TrelloCard): number {
  if (!card.lastActivity) return 0;
  const time = new Date(card.lastActivity).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function formatActivity(card: TrelloCard): string | null {
  const time = activityTime(card);
  if (!time) return null;
  const diffMinutes = Math.round((time - Date.now()) / 60_000);
  const formatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, 'minute');
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return formatter.format(diffHours, 'hour');
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) return formatter.format(diffDays, 'day');
  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) return formatter.format(diffMonths, 'month');
  return formatter.format(Math.round(diffMonths / 12), 'year');
}

export function processRecordsFor(card: TrelloCard, catalog: ProcessCatalog): ProcessRecord[] {
  return card.links
    .map((number) => catalog[number])
    .filter((record): record is ProcessRecord => Boolean(record));
}

export function processTypesFor(card: TrelloCard, catalog: ProcessCatalog): string[] {
  return Array.from(
    new Set(
      processRecordsFor(card, catalog)
        .map((record) => record.processType)
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function cardHasUnreadProcess(card: TrelloCard, catalog: ProcessCatalog): boolean {
  return processRecordsFor(card, catalog).some((record) => record.unread);
}

function matchesDue(card: TrelloCard, due: DueFilter): boolean {
  if (due === 'any') return true;
  if (due === 'open') return Boolean(card.due) && !card.dueComplete;
  return dueBucket(card) === due;
}

function matchesActivity(card: TrelloCard, activity: ActivityFilter, lastVisit: number): boolean {
  if (activity === 'any') return true;
  const time = activityTime(card);
  if (!time) return false;
  const now = Date.now();
  if (activity === 'today') return time >= startOfDay(new Date()).getTime();
  if (activity === '7d') return time >= now - 7 * 86_400_000;
  if (activity === '30d') return time >= now - 30 * 86_400_000;
  return time > lastVisit;
}

export function matchesFilters(
  card: TrelloCard,
  filters: DashboardFilters,
  catalog: ProcessCatalog,
  lastVisit: number,
): boolean {
  if (filters.link === 'linked' && card.links.length === 0) return false;
  if (filters.link === 'unlinked' && card.links.length > 0) return false;
  if (filters.boardId && card.idBoard !== filters.boardId) return false;
  if (filters.listId && card.idList !== filters.listId) return false;

  if (filters.processType) {
    const types = processTypesFor(card, catalog);
    if (filters.processType === '__none__') {
      if (types.length > 0) return false;
    } else if (!types.includes(filters.processType)) {
      return false;
    }
  }

  if (filters.processUpdate === 'unread' && !cardHasUnreadProcess(card, catalog)) return false;
  if (filters.processUpdate === 'read' && cardHasUnreadProcess(card, catalog)) return false;

  if (!matchesDue(card, filters.due)) return false;
  if (!matchesActivity(card, filters.activity, lastVisit)) return false;

  if (filters.withoutLabels && card.labels.length > 0) return false;
  if (filters.labelIds.length > 0) {
    const cardLabelIds = new Set(card.labels.map((label) => label.id));
    if (!filters.labelIds.some((labelId) => cardLabelIds.has(labelId))) return false;
  }

  const needle = filters.search.trim().toLowerCase();
  if (!needle) return true;
  const records = processRecordsFor(card, catalog);
  const haystack = [
    card.name,
    card.description,
    card.board?.name ?? '',
    card.list?.name ?? '',
    ...card.links,
    ...card.labels.map((label) => label.name),
    ...records.map((record) => record.specification),
    ...records.map((record) => record.processType),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

export function sortCards(
  cards: TrelloCard[],
  sort: SortMode,
  catalog: ProcessCatalog = {},
  listOrder?: Map<string, number>,
): TrelloCard[] {
  const sorted = [...cards];
  const byName = (a: TrelloCard, b: TrelloCard) => a.name.localeCompare(b.name, 'pt-BR');
  const orderOf = (card: TrelloCard) => listOrder?.get(`${card.idBoard}:${card.idList}`);
  const byListOrder = (a: TrelloCard, b: TrelloCard) => {
    const posA = orderOf(a);
    const posB = orderOf(b);
    if (posA !== undefined && posB !== undefined && posA !== posB) return posA - posB;
    if (posA !== undefined && posB === undefined) return -1;
    if (posB !== undefined && posA === undefined) return 1;
    return (a.list?.name ?? '').localeCompare(b.list?.name ?? '', 'pt-BR');
  };

  sorted.sort((a, b) => {
    if (sort === 'activity') return activityTime(b) - activityTime(a);
    if (sort === 'name') return byName(a, b);
    if (sort === 'board') {
      const boardCompare = (a.board?.name ?? '').localeCompare(b.board?.name ?? '', 'pt-BR');
      if (boardCompare !== 0) return boardCompare;
      const listCompare = byListOrder(a, b);
      if (listCompare !== 0) return listCompare;
      return byName(a, b);
    }
    if (sort === 'list') {
      const boardCompare = (a.board?.name ?? '').localeCompare(b.board?.name ?? '', 'pt-BR');
      if (boardCompare !== 0) return boardCompare;
      const listCompare = byListOrder(a, b);
      if (listCompare !== 0) return listCompare;
      return byName(a, b);
    }
    if (sort === 'label') {
      const labelOf = (card: TrelloCard) =>
        [...card.labels]
          .map((label) => label.name || label.color || '')
          .sort((x, y) => x.localeCompare(y, 'pt-BR'))[0] ?? '\uffff';
      const labelCompare = labelOf(a).localeCompare(labelOf(b), 'pt-BR');
      if (labelCompare !== 0) return labelCompare;
      return byName(a, b);
    }
    if (sort === 'type') {
      const typeOf = (card: TrelloCard) => processTypesFor(card, catalog)[0] ?? '\uffff';
      const typeCompare = typeOf(a).localeCompare(typeOf(b), 'pt-BR');
      if (typeCompare !== 0) return typeCompare;
      return byName(a, b);
    }
    if (a.dueComplete !== b.dueComplete) return a.dueComplete ? 1 : -1;
    if (!a.due && !b.due) return byName(a, b);
    if (!a.due) return 1;
    if (!b.due) return -1;
    return new Date(a.due).getTime() - new Date(b.due).getTime();
  });
  return sorted;
}

export interface CardGroup {
  key: string;
  title: string;
  subtitle?: string;
  tone?: string;
  cards: TrelloCard[];
}

export function groupCards(
  cards: TrelloCard[],
  group: GroupMode,
  sort: SortMode,
  catalog: ProcessCatalog,
  listOrder?: Map<string, number>,
): CardGroup[] {
  const sorted = sortCards(cards, sort, catalog, listOrder);

  if (group === 'none') {
    return sorted.length > 0 ? [{ key: 'all', title: '', cards: sorted }] : [];
  }

  if (group === 'due') {
    return DUE_BUCKETS.map((bucket) => ({
      key: bucket.key,
      title: bucket.title,
      tone: bucket.tone,
      cards: sorted.filter((card) => dueBucket(card) === bucket.key),
    })).filter((bucket) => bucket.cards.length > 0);
  }

  const map = new Map<string, CardGroup>();
  const add = (key: string, title: string, card: TrelloCard, subtitle?: string, tone?: string) => {
    const current = map.get(key);
    if (current) {
      current.cards.push(card);
      return;
    }
    map.set(key, { key, title, subtitle, tone, cards: [card] });
  };

  for (const card of sorted) {
    if (group === 'board') {
      add(
        card.idBoard || 'sem-quadro',
        card.board?.name ?? 'Sem quadro',
        card,
        undefined,
        'accent',
      );
      continue;
    }

    if (group === 'list') {
      add(
        `${card.idBoard}:${card.idList}`,
        card.list?.name ?? 'Sem lista',
        card,
        card.board?.name ?? 'Sem quadro',
        'accent',
      );
      continue;
    }

    if (group === 'type') {
      const types = processTypesFor(card, catalog);
      if (types.length === 0) add('sem-tipo', 'Sem tipo de processo', card, undefined, 'neutral');
      else for (const type of types) add(type, type, card, undefined, 'neutral');
      continue;
    }

    // label
    if (card.labels.length === 0) {
      add('sem-etiqueta', 'Sem etiqueta', card, undefined, 'neutral');
    } else {
      for (const label of card.labels) {
        add(
          label.id,
          label.name || `Etiqueta ${label.color ?? 'sem cor'}`,
          card,
          undefined,
          'neutral',
        );
      }
    }
  }

  const groups = Array.from(map.values()).map((bucket) => ({
    ...bucket,
    cards: sortCards(bucket.cards, sort, catalog, listOrder),
  }));

  // Listas seguem a ordem do Trello; os demais grupos ficam em ordem alfabética.
  if (group === 'list') return groups;
  return groups.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
}

export function activeFilterCount(filters: DashboardFilters): number {
  let count = 0;
  if (filters.search.trim()) count += 1;
  if (filters.boardId) count += 1;
  if (filters.listId) count += 1;
  if (filters.processType) count += 1;
  count += filters.labelIds.length;
  if (filters.withoutLabels) count += 1;
  if (filters.due !== 'any') count += 1;
  if (filters.activity !== 'any') count += 1;
  if (filters.processUpdate !== 'any') count += 1;
  if (filters.sort !== 'due') count += 1;
  if (filters.link !== 'linked') count += 1;
  return count;
}

export function loadFilters(): DashboardFilters {
  try {
    const raw = window.localStorage.getItem(FILTERS_KEY);
    if (!raw) return { ...DEFAULT_FILTERS };
    const parsed = JSON.parse(raw) as Partial<DashboardFilters>;
    const sortValues: SortMode[] = ['due', 'activity', 'name', 'list', 'board', 'label', 'type'];
    const groupValues: GroupMode[] = ['due', 'board', 'list', 'type', 'label', 'none'];
    const sort = sortValues.includes(parsed.sort as SortMode)
      ? (parsed.sort as SortMode)
      : DEFAULT_FILTERS.sort;
    const group = groupValues.includes(parsed.group as GroupMode)
      ? (parsed.group as GroupMode)
      : SORT_GROUPS[sort];
    const link: LinkFilter = parsed.link === 'unlinked' ? 'unlinked' : 'linked';
    return {
      ...DEFAULT_FILTERS,
      ...parsed,
      sort,
      group,
      link,
      labelIds: Array.isArray(parsed.labelIds)
        ? parsed.labelIds.filter((value): value is string => typeof value === 'string')
        : [],
      withoutLabels: Boolean(parsed.withoutLabels),
      search: typeof parsed.search === 'string' ? parsed.search : '',
      boardId: typeof parsed.boardId === 'string' ? parsed.boardId : '',
      listId: typeof parsed.listId === 'string' ? parsed.listId : '',
      processType: typeof parsed.processType === 'string' ? parsed.processType : '',
    };
  } catch {
    return { ...DEFAULT_FILTERS };
  }
}

export function saveFilters(filters: DashboardFilters): void {
  try {
    window.localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
  } catch {
    // filtros continuam em memória
  }
}

export function readLastVisit(): number {
  try {
    const raw = window.localStorage.getItem(LAST_VISIT_KEY);
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) && value > 0 ? value : Date.now();
  } catch {
    return Date.now();
  }
}

export function writeLastVisit(value = Date.now()): void {
  try {
    window.localStorage.setItem(LAST_VISIT_KEY, String(value));
  } catch {
    // ignora
  }
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function cardsToCsv(cards: TrelloCard[], catalog: ProcessCatalog): string {
  const header = [
    'Cartão',
    'Descrição',
    'Quadro',
    'Lista',
    'Prazo',
    'Concluído',
    'Etiquetas',
    'Processos',
    'Tipos de processo',
    'Atualizado no Trello',
    'URL do Trello',
  ];
  const rows = cards.map((card) => {
    return [
      card.name,
      card.description.replace(/\s+/g, ' ').trim(),
      card.board?.name ?? '',
      card.list?.name ?? '',
      card.due ? new Date(card.due).toLocaleDateString('pt-BR') : '',
      card.dueComplete ? 'sim' : 'não',
      card.labels.map((label) => label.name || label.color || '').join(' | '),
      card.links.join(' | '),
      processTypesFor(card, catalog).join(' | '),
      card.lastActivity ? new Date(card.lastActivity).toLocaleString('pt-BR') : '',
      card.shortUrl,
    ].map((value) => csvCell(value));
  });
  return [header.map(csvCell).join(';'), ...rows.map((row) => row.join(';'))].join('\r\n');
}
