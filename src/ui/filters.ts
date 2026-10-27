import type { TrelloCard } from '../core/domain/types';
import { isOverdue, locationKey } from './utils';

export type DueFilter = 'any' | 'overdue' | 'withDue';

export interface ListFilters {
  search: string;
  noCard: boolean;
  due: DueFilter;
  labelIds: string[];
  locations: string[];
}

export const EMPTY_FILTERS: ListFilters = {
  search: '',
  noCard: false,
  due: 'any',
  labelIds: [],
  locations: [],
};

export function activeFilterCount(filters: ListFilters): number {
  return (
    (filters.noCard ? 1 : 0) +
    (filters.due !== 'any' ? 1 : 0) +
    filters.labelIds.length +
    filters.locations.length
  );
}

export function matchesProcess(
  input: { processNumber: string; specification: string; cards: TrelloCard[] },
  filters: ListFilters,
): boolean {
  const { processNumber, specification, cards } = input;

  if (filters.noCard && cards.length > 0) return false;
  if (filters.search.trim()) {
    const needle = filters.search.trim().toLowerCase();
    const haystack = [processNumber, specification, ...cards.map((card) => card.name)]
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  if (filters.due === 'overdue' && !cards.some((card) => isOverdue(card))) return false;
  if (filters.due === 'withDue' && !cards.some((card) => Boolean(card.due))) return false;

  if (filters.labelIds.length > 0) {
    const hasLabel = cards.some((card) =>
      card.labels.some((label) => filters.labelIds.includes(label.id)),
    );
    if (!hasLabel) return false;
  }

  if (filters.locations.length > 0) {
    const hasLocation = cards.some((card) => filters.locations.includes(locationKey(card)));
    if (!hasLocation) return false;
  }

  return true;
}
