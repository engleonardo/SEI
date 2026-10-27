import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrelloCard } from '../core/domain/types';
import { activeFilterCount, EMPTY_FILTERS, matchesProcess } from './filters';
import { formatDue, fromDateInputValue, isOverdue, labelColorHex, toDateInputValue } from './utils';

function card(overrides: Partial<TrelloCard> = {}): TrelloCard {
  return {
    id: 'card-1',
    name: 'Cartão de teste',
    desc: '',
    description: '',
    shortUrl: 'https://trello.com/c/1',
    due: null,
    dueComplete: false,
    idBoard: 'board-1',
    idList: 'list-1',
    idChecklists: [],
    labels: [],
    board: { id: 'board-1', name: 'Quadro' },
    list: { id: 'list-1', name: 'Lista' },
    links: ['08660.018176/2014-60'],
    hasChecklist: false,
    lastActivity: null,
    ...overrides,
  };
}

describe('list filters', () => {
  it('filtra por busca no processo, especificação ou cartão', () => {
    const base = { processNumber: '08660.018176/2014-60', specification: 'Compras', cards: [card()] };
    expect(matchesProcess(base, { ...EMPTY_FILTERS, search: '08660' })).toBe(true);
    expect(matchesProcess(base, { ...EMPTY_FILTERS, search: 'compras' })).toBe(true);
    expect(matchesProcess(base, { ...EMPTY_FILTERS, search: 'teste' })).toBe(true);
    expect(matchesProcess(base, { ...EMPTY_FILTERS, search: 'inexistente' })).toBe(false);
  });

  it('filtra processos sem cartão', () => {
    const base = { processNumber: '1', specification: '', cards: [] };
    expect(matchesProcess(base, { ...EMPTY_FILTERS, noCard: true })).toBe(true);
    expect(matchesProcess({ ...base, cards: [card()] }, { ...EMPTY_FILTERS, noCard: true })).toBe(false);
  });

  it('filtra atrasados, em aberto, concluídos e sem prazo', () => {
    const overdue = card({ due: '2020-01-01T12:00:00.000Z' });
    const future = card({ due: '2030-01-01T12:00:00.000Z' });
    const complete = card({ due: '2020-01-01T12:00:00.000Z', dueComplete: true });
    const withoutDue = card({ due: null });
    const base = { processNumber: '1', specification: '', cards: [overdue] };
    expect(matchesProcess(base, { ...EMPTY_FILTERS, due: 'overdue' })).toBe(true);
    expect(matchesProcess(base, { ...EMPTY_FILTERS, due: 'open' })).toBe(true);
    expect(matchesProcess({ ...base, cards: [future] }, { ...EMPTY_FILTERS, due: 'overdue' })).toBe(false);
    expect(matchesProcess({ ...base, cards: [complete] }, { ...EMPTY_FILTERS, due: 'complete' })).toBe(true);
    expect(matchesProcess({ ...base, cards: [withoutDue] }, { ...EMPTY_FILTERS, due: 'none' })).toBe(true);
  });

  it('filtra por etiqueta, quadro e lista', () => {
    const labelled = card({
      labels: [{ id: 'label-1', name: 'Urgente', color: 'red' }],
    });
    const base = { processNumber: '1', specification: '', cards: [labelled] };
    expect(matchesProcess(base, { ...EMPTY_FILTERS, labelIds: ['label-1'] })).toBe(true);
    expect(matchesProcess(base, { ...EMPTY_FILTERS, labelIds: ['label-2'] })).toBe(false);
    expect(matchesProcess(base, { ...EMPTY_FILTERS, boardId: 'board-1' })).toBe(true);
    expect(matchesProcess(base, { ...EMPTY_FILTERS, boardId: 'board-2' })).toBe(false);
    expect(matchesProcess(base, { ...EMPTY_FILTERS, listIds: ['list-1'] })).toBe(true);
    expect(matchesProcess(base, { ...EMPTY_FILTERS, listIds: ['list-2'] })).toBe(false);
  });

  it('conta filtros ativos', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(
      activeFilterCount({
        ...EMPTY_FILTERS,
        noCard: true,
        due: 'overdue',
        labelIds: ['1', '2'],
        boardId: 'board-1',
        listIds: ['list-1'],
      }),
    ).toBe(6);
  });
});

describe('date and label helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 26, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calcula prazo atrasado, hoje, amanhã e futuro', () => {
    expect(formatDue('2026-10-25T12:00:00.000Z')?.tone).toBe('danger');
    expect(formatDue('2026-10-26T12:00:00.000Z')?.label).toBe('Vence hoje');
    expect(formatDue('2026-10-27T12:00:00.000Z')?.label).toBe('Vence amanhã');
    expect(formatDue('2026-11-10T12:00:00.000Z')?.tone).toBe('neutral');
  });

  it('considera concluído e sem prazo', () => {
    expect(formatDue('2020-01-01T12:00:00.000Z', true)?.tone).toBe('success');
    expect(formatDue(null)).toBeNull();
    expect(isOverdue({ due: '2020-01-01T12:00:00.000Z', dueComplete: true })).toBe(false);
  });

  it('converte date input sem perder o dia', () => {
    const iso = fromDateInputValue('2026-10-26');
    expect(iso).not.toBeNull();
    expect(new Date(iso as string).getDate()).toBe(26);
    expect(toDateInputValue(iso)).toBe('2026-10-26');
  });

  it('mapeia as 30 cores oficiais do Trello', () => {
    expect(labelColorHex('red')).toBe('#f87168');
    expect(labelColorHex('red_dark')).toBe('#c9372c');
    expect(labelColorHex('red_light')).toBe('#ffd5d2');
    expect(labelColorHex('green_light')).toBe('#baf3db');
    expect(labelColorHex('black_dark')).toBe('#626f86');
    expect(labelColorHex(null)).toBe('#b6c2cf');
  });
});
