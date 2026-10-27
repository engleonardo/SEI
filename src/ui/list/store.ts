import type { Settings, TrelloCard } from '../../core/domain/types';
import { callRpc, errorMessage } from '../../core/messaging/client';
import { EMPTY_FILTERS, type ListFilters } from '../filters';
import { Store } from '../store';

export interface ListState {
  loading: boolean;
  error: string | null;
  cards: TrelloCard[];
  settings: Settings | null;
  filters: ListFilters;
  lastUpdated: number | null;
}

export const listStore = new Store<ListState>({
  loading: false,
  error: null,
  cards: [],
  settings: null,
  filters: { ...EMPTY_FILTERS },
  lastUpdated: null,
});

let pending: Promise<void> | null = null;

export async function loadList(): Promise<void> {
  if (pending) return pending;
  listStore.set((previous) => ({ ...previous, loading: true, error: null }));

  pending = (async () => {
    try {
      const [cards, settings] = await Promise.all([
        callRpc('trello:all-linked-cards', undefined),
        callRpc('settings:get', undefined),
      ]);
      listStore.set((previous) => ({
        ...previous,
        loading: false,
        error: null,
        cards,
        settings,
        lastUpdated: Date.now(),
      }));
    } catch (cause) {
      listStore.set((previous) => ({
        ...previous,
        loading: false,
        error: errorMessage(cause),
      }));
    } finally {
      pending = null;
    }
  })();

  return pending;
}

export function cardsForProcess(processNumber: string): TrelloCard[] {
  return listStore.get().cards.filter((card) => card.links.includes(processNumber));
}

export function setFilters(patch: Partial<ListFilters>): void {
  listStore.set((previous) => ({
    ...previous,
    filters: { ...previous.filters, ...patch },
  }));
}

export function updateCard(updated: TrelloCard): void {
  listStore.set((previous) => {
    const exists = previous.cards.some((card) => card.id === updated.id);
    const cards = exists
      ? previous.cards.map((card) => (card.id === updated.id ? updated : card))
      : [...previous.cards, updated];
    return { ...previous, cards: cards.filter((card) => card.links.length > 0) };
  });
}

export function removeCard(cardId: string): void {
  listStore.set((previous) => ({
    ...previous,
    cards: previous.cards.filter((card) => card.id !== cardId),
  }));
}

export function addCards(newCards: TrelloCard[]): void {
  listStore.set((previous) => {
    const map = new Map(previous.cards.map((card) => [card.id, card]));
    for (const card of newCards) {
      if (card.links.length > 0) map.set(card.id, card);
    }
    return { ...previous, cards: Array.from(map.values()) };
  });
}
