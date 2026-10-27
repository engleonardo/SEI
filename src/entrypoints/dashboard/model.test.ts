import { describe, expect, it } from 'vitest';
import type { TrelloCard } from '../../core/domain/types';
import type { ProcessCatalog } from '../../core/storage/processes';
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  cardsToCsv,
  dueBucket,
  groupCards,
  matchesFilters,
  processTypesFor,
  type DashboardFilters,
} from './model';

const PROCESS = '08660.018176/2014-60';
const OTHER = '12345.678901/2025-12';
const now = Date.now();

function card(overrides: Partial<TrelloCard> = {}): TrelloCard {
  return {
    id: 'card-1',
    name: 'Revisar contrato',
    desc: `SEI ${PROCESS}`,
    description: 'Descrição',
    shortUrl: 'https://trello.com/c/1',
    due: new Date(now + 86_400_000).toISOString(),
    dueComplete: false,
    idBoard: 'board-1',
    idList: 'list-1',
    idChecklists: [],
    labels: [{ id: 'label-1', name: 'Urgente', color: 'red' }],
    board: { id: 'board-1', name: 'Contratos' },
    list: { id: 'list-1', name: 'Em análise' },
    links: [PROCESS],
    hasChecklist: false,
    lastActivity: new Date(now - 60_000).toISOString(),
    ...overrides,
  };
}

const catalog: ProcessCatalog = {
  [PROCESS]: {
    number: PROCESS,
    specification: 'Aquisição de material',
    processType: 'Processo Administrativo',
    url: 'http://sei.test/1',
    origin: 'http://sei.test',
    unread: true,
    updatedAt: now,
  },
  [OTHER]: {
    number: OTHER,
    specification: 'Contratação de limpeza',
    processType: 'Processo de Contratação',
    url: 'http://sei.test/2',
    origin: 'http://sei.test',
    unread: false,
    updatedAt: now,
  },
};

function filters(overrides: Partial<DashboardFilters> = {}): DashboardFilters {
  return { ...DEFAULT_FILTERS, ...overrides };
}

describe('modelo do dashboard', () => {
  it('calcula buckets de prazo', () => {
    expect(dueBucket(card())).toBe('soon');
    expect(dueBucket(card({ due: new Date(now - 86_400_000).toISOString() }))).toBe('overdue');
    expect(dueBucket(card({ due: null }))).toBe('none');
    expect(dueBucket(card({ due: new Date(now - 86_400_000).toISOString(), dueComplete: true }))).toBe(
      'done',
    );
  });

  it('filtra por etiqueta, tipo de processo e novidade no SEI', () => {
    const other = card({
      id: 'card-2',
      name: 'Publicar edital',
      links: [OTHER],
      labels: [],
      due: new Date(now - 4 * 86_400_000).toISOString(),
      lastActivity: new Date(now - 10 * 86_400_000).toISOString(),
    });

    expect(matchesFilters(card(), filters({ labelIds: ['label-1'] }), catalog, 0)).toBe(true);
    expect(matchesFilters(other, filters({ labelIds: ['label-1'] }), catalog, 0)).toBe(false);
    expect(
      matchesFilters(other, filters({ processType: 'Processo de Contratação' }), catalog, 0),
    ).toBe(true);
    expect(matchesFilters(card(), filters({ processUpdate: 'unread' }), catalog, 0)).toBe(true);
    expect(matchesFilters(other, filters({ processUpdate: 'unread' }), catalog, 0)).toBe(false);
    expect(matchesFilters(other, filters({ activity: '7d' }), catalog, 0)).toBe(false);
    expect(matchesFilters(card(), filters({ activity: 'sinceVisit' }), catalog, now - 120_000)).toBe(
      true,
    );
  });

  it('agrupa por tipo de processo e etiqueta', () => {
    const other = card({ id: 'card-2', links: [OTHER], labels: [], name: 'Publicar edital' });
    const byType = groupCards([card(), other], 'type', 'name', catalog);
    expect(byType.map((group) => group.title)).toEqual([
      'Processo Administrativo',
      'Processo de Contratação',
    ]);
    expect(byType[0]?.cards[0]?.name).toBe('Revisar contrato');

    const byLabel = groupCards([card(), other], 'label', 'name', catalog);
    expect(byLabel.map((group) => group.title)).toEqual(['Sem etiqueta', 'Urgente']);
  });

  it('conta filtros ativos e exporta CSV', () => {
    expect(activeFilterCount(filters())).toBe(0);
    expect(
      activeFilterCount(
        filters({ labelIds: ['label-1'], due: 'overdue', activity: '7d', processType: 'X' }),
      ),
    ).toBe(4);

    const csv = cardsToCsv([card()], catalog);
    expect(csv).toContain('"Cartão";"Descrição"');
    expect(csv).toContain('"Revisar contrato"');
    expect(csv).toContain(`"${PROCESS}"`);
    expect(csv).toContain('"Processo Administrativo"');
  });

  it('extrai tipos de processo do catálogo', () => {
    expect(processTypesFor(card(), catalog)).toEqual(['Processo Administrativo']);
    expect(processTypesFor(card({ links: [] }), catalog)).toEqual([]);
  });
});
