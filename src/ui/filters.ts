import type { TrelloCard } from '../core/domain/types';
import { isOverdue } from './utils';

export type DueFilter = 'any' | 'overdue' | 'open' | 'complete' | 'none';

export interface ListFilters {
  search: string;
  noCard: boolean;
  withCard: boolean;
  due: DueFilter;
  labelIds: string[];
  boardId: string;
  listIds: string[];
}

export const EMPTY_FILTERS: ListFilters = {
  search: '',
  noCard: false,
  withCard: false,
  due: 'any',
  labelIds: [],
  boardId: '',
  listIds: [],
};

export function activeFilterCount(filters: ListFilters): number {
  return (
    (filters.noCard || filters.withCard ? 1 : 0) +
    (filters.due !== 'any' ? 1 : 0) +
    filters.labelIds.length +
    (filters.boardId ? 1 : 0) +
    filters.listIds.length
  );
}

export function matchesProcess(
  input: { processNumber: string; specification: string; cards: TrelloCard[] },
  filters: ListFilters,
): boolean {
  const { processNumber, specification, cards } = input;

  if (filters.noCard && cards.length > 0) return false;
  if (filters.withCard && cards.length === 0) return false;

  if (filters.search.trim()) {
    const needle = filters.search.trim().toLowerCase();
    const haystack = [processNumber, specification, ...cards.map((card) => card.name)]
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  if (filters.due === 'overdue' && !cards.some((card) => isOverdue(card))) return false;
  if (filters.due === 'open' && !cards.some((card) => Boolean(card.due) && !card.dueComplete)) {
    return false;
  }
  if (filters.due === 'complete' && !cards.some((card) => Boolean(card.due) && card.dueComplete)) {
    return false;
  }
  if (filters.due === 'none' && !(cards.length > 0 && cards.every((card) => !card.due))) {
    return false;
  }

  if (filters.labelIds.length > 0) {
    const hasLabel = cards.some((card) =>
      card.labels.some((label) => filters.labelIds.includes(label.id)),
    );
    if (!hasLabel) return false;
  }

  if (filters.boardId || filters.listIds.length > 0) {
    const hasLocation = cards.some(
      (card) =>
        (!filters.boardId || card.idBoard === filters.boardId) &&
        (filters.listIds.length === 0 || filters.listIds.includes(card.idList)),
    );
    if (!hasLocation) return false;
  }

  return true;
}
