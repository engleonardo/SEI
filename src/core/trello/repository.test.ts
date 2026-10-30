import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrelloCardApi } from '../domain/types';
import type { TrelloClient } from './client';
import { TrelloRepository } from './repository';

const mocks = vi.hoisted(() => ({
  settings: {
    appKey: 'key',
    appToken: 'token',
    defaultBoardId: 'board-1',
    defaultBoardName: 'Quadro',
    defaultListId: 'list-1',
    defaultListName: 'Lista',
    activatedOrigins: [],
    allSites: false,
    autoSeiHosts: false,
    theme: 'auto' as const,
    compact: true,
    autoRefreshMinutes: 0,
  },
  rules: [] as Array<Record<string, unknown>>,
}));

vi.mock('../storage/settings', () => ({
  getSettings: async () => mocks.settings,
}));

vi.mock('../storage/rules', () => ({
  getRules: async () => mocks.rules,
}));

const runState = vi.hoisted(() => ({ runs: [] as Array<Record<string, unknown>> }));

vi.mock('../storage/rule-runs', () => ({
  getLastRuleRun: async () => runState.runs[0] ?? null,
  getRuleRuns: async () => [...runState.runs],
  pushRuleRun: async (run: Record<string, unknown>) => {
    runState.runs.unshift(run);
  },
  dropLastRuleRun: async () => {
    runState.runs.shift();
  },
  clearRuleRuns: async () => {
    runState.runs = [];
  },
}));

const statsState = vi.hoisted(() => ({
  stats: {} as Record<string, { applied: number; lastAt: number; lastSource: 'auto' | 'manual' }>,
}));

vi.mock('../storage/rule-stats', () => ({
  recordRuleApplications: async (counts: Map<string, number>, source: 'auto' | 'manual') => {
    for (const [id, count] of counts) {
      const previous = statsState.stats[id]?.applied ?? 0;
      statsState.stats[id] = {
        applied: previous + count,
        lastAt: Date.now(),
        lastSource: source,
      };
    }
  },
  getRuleStats: async () => ({ ...statsState.stats }),
  clearRuleStats: async () => {
    statsState.stats = {};
  },
}));

const catalogState = vi.hoisted(() => ({
  catalog: {} as Record<string, { unread: boolean }>,
}));

vi.mock('../storage/processes', () => ({
  getProcessCatalog: async () => ({ ...catalogState.catalog }),
}));

const logState = vi.hoisted(() => ({ entries: [] as Array<Record<string, unknown>> }));

vi.mock('../storage/rule-log', () => ({
  pushRuleLog: async (entries: Array<Record<string, unknown>>) => {
    logState.entries.unshift(...entries);
  },
  getRuleLog: async () => [...logState.entries],
  clearRuleLog: async () => {
    logState.entries = [];
  },
}));

const syncState = vi.hoisted(() => ({
  snapshot: {} as Record<string, unknown>,
}));

interface SnapshotCard {
  id: string;
  idList: string;
  dueComplete: boolean;
  name: string;
  description: string;
  due: string | null;
  labels: Array<{ id: string }>;
}

function snapshotEntry(card: SnapshotCard) {
  return {
    idList: card.idList,
    dueComplete: card.dueComplete,
    name: card.name,
    description: card.description,
    due: card.due,
    labelIds: card.labels.map((label) => label.id).sort(),
  };
}

function storeSnapshot(cards: SnapshotCard[], replace = false) {
  if (replace) syncState.snapshot = {};
  for (const card of cards) syncState.snapshot[card.id] = snapshotEntry(card);
}

vi.mock('../storage/sync', () => ({
  getSyncSnapshot: async () => ({ ...syncState.snapshot }),
  snapshotOf: snapshotEntry,
  mergeSyncSnapshot: async (cards: SnapshotCard[]) => storeSnapshot(cards),
  replaceSyncSnapshot: async (cards: SnapshotCard[]) => storeSnapshot(cards, true),
  forgetCards: async (ids: string[]) => {
    for (const id of ids) delete syncState.snapshot[id];
  },
  clearSyncSnapshot: async () => {
    syncState.snapshot = {};
  },
}));

vi.mock('./cache', () => ({
  CACHE_TTL: {
    boards: 1,
    boardLists: 1,
    boardCards: 1,
    boardLabels: 1,
    processCards: 1,
    allLinkedCards: 1,
  },
  cacheGetOrSet: (_key: string, _ttl: number, factory: () => Promise<unknown>) => factory(),
  cacheSet: vi.fn(async () => undefined),
  cacheDelete: vi.fn(async () => undefined),
  cacheDeleteByPrefix: vi.fn(async () => undefined),
}));

const PROCESS = '08660.018176/2014-60';
const OTHER = '12345.678901/2025-12';
const WARN = 'Não altere as informações abaixo.';

function rawCard(overrides: Partial<TrelloCardApi> = {}): TrelloCardApi {
  return {
    id: 'card-1',
    name: 'Cartão',
    desc: '',
    shortUrl: 'https://trello.com/c/1',
    due: null,
    dueComplete: false,
    idBoard: 'board-1',
    idList: 'list-1',
    idChecklists: [],
    labels: [],
    board: { id: 'board-1', name: 'Quadro' },
    list: { id: 'list-1', name: 'Lista' },
    ...overrides,
  };
}

function fakeClient() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as unknown as TrelloClient;
}

function repository(client: TrelloClient) {
  return new TrelloRepository(async () => ({ key: 'key', token: 'token' }), client);
}

beforeEach(() => {
  mocks.rules = [];
  syncState.snapshot = {};
  runState.runs = [];
  statsState.stats = {};
  catalogState.catalog = {};
  logState.entries = [];
  mocks.settings = {
    ...mocks.settings,
    defaultBoardId: 'board-1',
    defaultBoardName: 'Quadro',
    defaultListId: 'list-1',
    defaultListName: 'Lista',
  };
});

describe('TrelloRepository', () => {
  it('cria cartão com marcador do processo na lista padrão', async () => {
    const client = fakeClient();
    vi.mocked(client.post).mockResolvedValue(rawCard({ id: 'card-new', desc: `SEI ${PROCESS}` }));
    vi.mocked(client.get).mockResolvedValue(rawCard({ id: 'card-new', desc: `SEI ${PROCESS}` }));

    const repo = repository(client);
    const card = await repo.createCard({
      name: 'Novo',
      description: 'Descrição',
      processNumber: PROCESS,
    });

    expect(client.post).toHaveBeenCalledWith(
      '/cards',
      expect.objectContaining({
        name: 'Novo',
        idList: 'list-1',
        desc: `Descrição\n\n---\n${WARN}\nSEI ${PROCESS}`,
      }),
    );
    expect(card.links).toEqual([PROCESS]);
  });

  it('atualiza descrição preservando vínculos existentes', async () => {
    const client = fakeClient();
    vi.mocked(client.get)
      .mockResolvedValueOnce(rawCard({ desc: `SEI ${PROCESS}\nSEI ${OTHER}\nAntiga` }))
      .mockResolvedValueOnce(rawCard({ desc: `Nova\nSEI ${PROCESS}\nSEI ${OTHER}` }));
    vi.mocked(client.put).mockResolvedValue({});

    const repo = repository(client);
    const updated = await repo.updateCard('card-1', { description: 'Nova' });

    expect(client.put).toHaveBeenCalledWith('/cards/card-1', {
      desc: `Nova\n\n---\n${WARN}\nSEI ${PROCESS}\nSEI ${OTHER}`,
    });
    expect(updated.description).toBe('Nova');
  });

  it('não deixa nome vazio', async () => {
    const client = fakeClient();
    vi.mocked(client.get).mockResolvedValue(rawCard());
    const repo = repository(client);
    await expect(repo.updateCard('card-1', { name: '   ' })).rejects.toMatchObject({
      code: 'validation',
    });
  });

  it('vincula cartão sem vínculo e ignora duplicado', async () => {
    const client = fakeClient();
    vi.mocked(client.get)
      .mockResolvedValueOnce(rawCard({ desc: 'Descrição' }))
      .mockResolvedValueOnce(rawCard({ desc: `Descrição\nSEI ${PROCESS}` }))
      .mockResolvedValueOnce(rawCard({ desc: `Descrição\nSEI ${PROCESS}` }));
    vi.mocked(client.put).mockResolvedValue({});

    const repo = repository(client);
    const results = await repo.linkCards(['card-1', 'card-1'], PROCESS);

    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('linked');
    expect(client.put).toHaveBeenCalledWith('/cards/card-1', {
      desc: `Descrição\n\n---\n${WARN}\nSEI ${PROCESS}`,
    });
  });

  it('não regrava vínculo já existente', async () => {
    const client = fakeClient();
    vi.mocked(client.get).mockResolvedValue(rawCard({ desc: `SEI ${PROCESS}\nDescrição` }));
    const repo = repository(client);
    const results = await repo.linkCards(['card-1'], PROCESS);
    expect(results[0]?.status).toBe('already');
    expect(client.put).not.toHaveBeenCalled();
  });

  it('vincula um cartão a vários processos em uma única gravação', async () => {
    const client = fakeClient();
    const third = '98765.432109/2026-01';
    vi.mocked(client.get)
      .mockResolvedValueOnce(rawCard({ desc: 'Descrição' }))
      .mockResolvedValueOnce(
        rawCard({ desc: `Descrição\nSEI ${PROCESS}\nSEI ${OTHER}\nSEI ${third}` }),
      );
    vi.mocked(client.put).mockResolvedValue({});

    const repo = repository(client);
    const results = await repo.linkCardsToProcesses(['card-1'], [PROCESS, OTHER, third, PROCESS]);

    expect(results[0]?.status).toBe('linked');
    expect(client.put).toHaveBeenCalledTimes(1);
    expect(client.put).toHaveBeenCalledWith('/cards/card-1', {
      desc: `Descrição\n\n---\n${WARN}\nSEI ${PROCESS}\nSEI ${OTHER}\nSEI ${third}`,
    });
  });

  it('desvincula apenas o processo atual', async () => {
    const client = fakeClient();
    vi.mocked(client.get)
      .mockResolvedValueOnce(rawCard({ desc: `Descrição\n\nSEI ${PROCESS}\nSEI ${OTHER}` }))
      .mockResolvedValueOnce(rawCard({ desc: `Descrição\n\nSEI ${OTHER}` }));
    vi.mocked(client.put).mockResolvedValue({});

    const repo = repository(client);
    const updated = await repo.unlinkCard('card-1', PROCESS);

    expect(client.put).toHaveBeenCalledWith('/cards/card-1', {
      desc: `Descrição\n\n---\n${WARN}\nSEI ${OTHER}`,
    });
    expect(updated.links).toEqual([OTHER]);
  });

  it('exige lista padrão para criar cartão', async () => {
    mocks.settings = { ...mocks.settings, defaultListId: '' };
    const client = fakeClient();
    const repo = repository(client);
    await expect(repo.createCard({ name: 'Sem destino' })).rejects.toMatchObject({
      code: 'not_configured',
    });
  });

  it('aplica regra de conclusão apenas em cartão vinculado', async () => {
    mocks.rules = [
      {
        id: 'rule-1',
        name: 'Concluído vai para concluídos',
        enabled: true,
        boardId: 'board-1',
        trigger: { type: 'completed' },
        actions: [
          { type: 'addLabel', labelId: 'label-done' },
          { type: 'moveToList', listId: 'list-done' },
        ],
      },
    ];
    const client = fakeClient();
    let cardFetches = 0;
    vi.mocked(client.get).mockImplementation(async (path: string) => {
      if (path === '/boards/board-1/lists') {
        return [
          { id: 'list-1', name: 'Lista' },
          { id: 'list-done', name: 'Concluídos' },
        ];
      }
      if (path.startsWith('/boards/')) return [];
      cardFetches += 1;
      if (cardFetches >= 3) {
        return rawCard({
          desc: `SEI ${PROCESS}`,
          idList: 'list-done',
          list: { id: 'list-done', name: 'Concluídos' },
          labels: [{ id: 'label-done', name: 'Concluído', color: 'green' }],
        });
      }
      return rawCard({ desc: `SEI ${PROCESS}` });
    });
    vi.mocked(client.put).mockResolvedValue({});
    vi.mocked(client.post).mockResolvedValue({});

    const repo = repository(client);
    const updated = await repo.updateCard('card-1', { dueComplete: true });

    expect(client.post).toHaveBeenCalledWith('/cards/card-1/idLabels', {
      value: 'label-done',
    });
    expect(client.put).toHaveBeenCalledWith('/cards/card-1', {
      pos: 'bottom',
      idList: 'list-done',
    });
    expect(updated.list?.id).toBe('list-done');
    expect(statsState.stats['rule-1']).toMatchObject({ applied: 1, lastSource: 'auto' });
  });

  it('não aplica regras em cartão sem vínculo com o SEI', async () => {
    mocks.rules = [
      {
        id: 'rule-1',
        name: 'Concluído vai para concluídos',
        enabled: true,
        boardId: 'board-1',
        trigger: { type: 'completed' },
        actions: [{ type: 'moveToList', listId: 'list-done' }],
      },
    ];
    const client = fakeClient();
    vi.mocked(client.get).mockResolvedValue(rawCard({ desc: 'Sem vínculo' }));
    vi.mocked(client.put).mockResolvedValue({});

    const repo = repository(client);
    await repo.updateCard('card-1', { dueComplete: true });

    expect(client.put).toHaveBeenCalledTimes(1);
    expect(client.put).toHaveBeenCalledWith('/cards/card-1', { dueComplete: true });
  });

  it('detecta mudança feita no Trello e aplica a regra na atualização', async () => {
    mocks.settings = { ...mocks.settings, defaultBoardId: '' };
    mocks.rules = [
      {
        id: 'rule-top',
        name: 'Entrou em qualquer lista, vai para o topo',
        enabled: true,
        boardId: 'board-1',
        trigger: { type: 'enterAnyList' },
        actions: [{ type: 'moveToTop' }],
      },
    ];

    let remoteList = 'list-1';
    const client = fakeClient();
    const remoteCard = () =>
      rawCard({
        desc: `SEI ${PROCESS}`,
        idList: remoteList,
        list: { id: remoteList, name: 'Lista remota' },
      });

    vi.mocked(client.get).mockImplementation(async (path: string) => {
      if (path === '/search') return { cards: [remoteCard()] };
      if (path.startsWith('/boards/')) return [];
      return remoteCard();
    });
    vi.mocked(client.put).mockResolvedValue({});

    const repo = repository(client);

    // Primeira leitura apenas registra o estado atual, sem disparar regra.
    await repo.getAllLinkedCards(true);
    expect(client.put).not.toHaveBeenCalled();

    // Usuário move o cartão direto no Trello.
    remoteList = 'list-2';
    await repo.getAllLinkedCards(true);
    expect(client.put).toHaveBeenCalledWith('/cards/card-1', { pos: 'top' });

    // Nova atualização não repete a regra já aplicada.
    const calls = vi.mocked(client.put).mock.calls.length;
    await repo.getAllLinkedCards(true);
    expect(vi.mocked(client.put).mock.calls.length).toBe(calls);
  });

  it('aplicar agora respeita a condição do gatilho', async () => {
    mocks.settings = { ...mocks.settings, defaultBoardId: '' };
    mocks.rules = [
      {
        id: 'rule-done',
        name: 'Concluído vai para concluídos',
        enabled: true,
        boardId: 'board-1',
        trigger: { type: 'completed' },
        actions: [{ type: 'moveToList', listId: 'list-done' }],
      },
    ];

    const client = fakeClient();
    vi.mocked(client.get).mockImplementation(async (path: string) => {
      if (path === '/search') {
        return {
          cards: [
            rawCard({ id: 'card-1', desc: `SEI ${PROCESS}`, dueComplete: true }),
            rawCard({ id: 'card-2', desc: `SEI ${PROCESS}`, dueComplete: false }),
          ],
        };
      }
      if (path === '/boards/board-1/lists') {
        return [
          { id: 'list-1', name: 'Lista' },
          { id: 'list-done', name: 'Concluídos' },
        ];
      }
      if (path.startsWith('/boards/')) return [];
      if (path === '/cards/card-1') {
        return rawCard({
          id: 'card-1',
          desc: `SEI ${PROCESS}`,
          dueComplete: true,
          idList: 'list-done',
          list: { id: 'list-done', name: 'Concluídos' },
        });
      }
      return rawCard({ id: 'card-2', desc: `SEI ${PROCESS}` });
    });
    vi.mocked(client.put).mockResolvedValue({});

    const repo = repository(client);

    // Prévia não altera nada e conta apenas os cartões concluídos.
    const preview = await repo.applyRuleNow('rule-done', true);
    expect(preview).toEqual({ applied: 1, total: 2 });
    expect(client.put).not.toHaveBeenCalled();

    // Aplicação real atinge só o cartão concluído.
    const result = await repo.applyRuleNow('rule-done');
    expect(result.applied).toBe(1);
    expect(client.put).toHaveBeenCalledTimes(1);
    expect(client.put).toHaveBeenCalledWith('/cards/card-1', {
      pos: 'bottom',
      idList: 'list-done',
    });
    expect(runState.runs[0]).toMatchObject({
      ruleId: 'rule-done',
      moves: [{ cardId: 'card-1', fromListId: 'list-1', toListId: 'list-done' }],
    });
    expect(statsState.stats['rule-done']).toMatchObject({ applied: 1, lastSource: 'manual' });
  });

  it('desfaz a última aplicação devolvendo o cartão à lista original', async () => {
    mocks.settings = { ...mocks.settings, defaultBoardId: '' };
    mocks.rules = [
      {
        id: 'rule-done',
        name: 'Concluído vai para concluídos',
        enabled: true,
        boardId: 'board-1',
        trigger: { type: 'completed' },
        actions: [{ type: 'moveToList', listId: 'list-done' }],
      },
    ];

    let currentList = 'list-1';
    const client = fakeClient();
    vi.mocked(client.get).mockImplementation(async (path: string) => {
      if (path === '/search') {
        return {
          cards: [
            rawCard({
              id: 'card-1',
              desc: `SEI ${PROCESS}`,
              dueComplete: true,
              idList: currentList,
              list: { id: currentList, name: 'Lista' },
            }),
          ],
        };
      }
      if (path === '/boards/board-1/lists') {
        return [
          { id: 'list-1', name: 'Lista' },
          { id: 'list-done', name: 'Concluídos' },
        ];
      }
      if (path.startsWith('/boards/')) return [];
      return rawCard({
        id: 'card-1',
        desc: `SEI ${PROCESS}`,
        dueComplete: true,
        idList: currentList,
        list: { id: currentList, name: 'Lista' },
      });
    });
    vi.mocked(client.put).mockImplementation(async (path: string, body?: unknown) => {
      if (path === '/cards/card-1') {
        const patch = body as { idList?: string } | undefined;
        if (patch?.idList) currentList = patch.idList;
      }
      return {};
    });

    const repo = repository(client);
    await repo.applyRuleNow('rule-done');
    expect(currentList).toBe('list-done');

    const undone = await repo.undoLastRuleRun();
    expect(undone.reverted).toBe(1);
    expect(undone.cards).toBe(1);
    expect(currentList).toBe('list-1');
    expect(runState.runs).toHaveLength(0);
  });

  it('aplica regra de novidade do SEI só nos cartões do quadro da regra', async () => {
    mocks.settings = { ...mocks.settings, defaultBoardId: '' };
    mocks.rules = [
      {
        id: 'rule-sei',
        name: 'Processo atualizado recebe etiqueta',
        enabled: true,
        boardId: 'board-1',
        trigger: { type: 'seiUpdated' },
        actions: [{ type: 'addLabel', labelId: 'label-novo' }],
      },
    ];

    const client = fakeClient();
    vi.mocked(client.get).mockImplementation(async (path: string) => {
      if (path === '/search') {
        return {
          cards: [
            rawCard({ id: 'card-1', desc: `SEI ${PROCESS}` }),
            rawCard({
              id: 'card-2',
              desc: `SEI ${PROCESS}`,
              idBoard: 'board-2',
              board: { id: 'board-2', name: 'Outro quadro' },
            }),
          ],
        };
      }
      if (path.startsWith('/boards/')) return [];
      return rawCard({
        id: 'card-1',
        desc: `SEI ${PROCESS}`,
        labels: [{ id: 'label-novo', name: 'Novo', color: 'blue' }],
      });
    });
    vi.mocked(client.post).mockResolvedValue({});

    const repo = repository(client);
    const result = await repo.applySeiUpdateRules([PROCESS]);

    expect(result.applied).toBe(1);
    expect(client.post).toHaveBeenCalledWith('/cards/card-1/idLabels', {
      value: 'label-novo',
    });
    expect(client.post).toHaveBeenCalledTimes(1);
  });

  it('aplicar agora ignora cartões que já estão na lista de destino', async () => {
    mocks.settings = { ...mocks.settings, defaultBoardId: '' };
    mocks.rules = [
      {
        id: 'rule-done',
        name: 'Concluído vai para concluídos',
        enabled: true,
        boardId: 'board-1',
        trigger: { type: 'completed' },
        actions: [{ type: 'moveToList', listId: 'list-done' }],
      },
    ];

    const client = fakeClient();
    vi.mocked(client.get).mockImplementation(async (path: string) => {
      if (path === '/search') {
        return {
          cards: [
            rawCard({
              id: 'card-1',
              desc: `SEI ${PROCESS}`,
              dueComplete: true,
              idList: 'list-done',
              list: { id: 'list-done', name: 'Concluídos' },
            }),
            rawCard({ id: 'card-2', desc: `SEI ${PROCESS}`, dueComplete: true }),
          ],
        };
      }
      if (path.startsWith('/boards/')) return [];
      return rawCard({ id: 'card-2', desc: `SEI ${PROCESS}`, dueComplete: true });
    });

    const repo = repository(client);
    const preview = await repo.applyRuleNow('rule-done', true);
    expect(preview).toEqual({ applied: 1, total: 2 });
    expect(client.put).not.toHaveBeenCalled();
  });

  it('aplicar agora considera novidade do SEI no processo vinculado', async () => {
    mocks.settings = { ...mocks.settings, defaultBoardId: '' };
    mocks.rules = [
      {
        id: 'rule-sei',
        name: 'Processo atualizado segue para Demandas',
        enabled: true,
        boardId: 'board-1',
        trigger: { type: 'seiUpdated' },
        actions: [{ type: 'moveToList', listId: 'list-2' }],
      },
    ];

    const client = fakeClient();
    vi.mocked(client.get).mockImplementation(async (path: string) => {
      if (path === '/search') {
        return { cards: [rawCard({ id: 'card-1', desc: `SEI ${PROCESS}` })] };
      }
      if (path === '/boards/board-1/lists') {
        return [
          { id: 'list-1', name: 'Lista' },
          { id: 'list-2', name: 'Demandas' },
        ];
      }
      if (path.startsWith('/boards/')) return [];
      return rawCard({ id: 'card-1', desc: `SEI ${PROCESS}` });
    });
    vi.mocked(client.put).mockResolvedValue({});

    const repo = repository(client);

    catalogState.catalog = {};
    expect(await repo.applyRuleNow('rule-sei', true)).toEqual({ applied: 0, total: 1 });

    catalogState.catalog = { [PROCESS]: { unread: true } };
    expect(await repo.applyRuleNow('rule-sei', true)).toEqual({ applied: 1, total: 1 });
  });

  it('adiciona etiqueta quando o cartão entra na lista e registra a execução', async () => {
    mocks.settings = { ...mocks.settings, defaultBoardId: '' };
    mocks.rules = [
      {
        id: 'rule-label',
        name: 'Entrou na lista recebe etiqueta',
        enabled: true,
        boardId: 'board-1',
        trigger: { type: 'enterList', listId: 'list-2' },
        actions: [{ type: 'addLabel', labelId: 'label-novo', labelName: 'Novo' }],
      },
    ];

    let currentList = 'list-1';
    let hasLabel = false;
    const client = fakeClient();
    vi.mocked(client.get).mockImplementation(async () =>
      rawCard({
        id: 'card-1',
        desc: `SEI ${PROCESS}`,
        idList: currentList,
        list: { id: currentList, name: 'Lista' },
        labels: hasLabel ? [{ id: 'label-novo', name: 'Novo', color: 'blue' }] : [],
      }),
    );
    vi.mocked(client.put).mockImplementation(async (_path: string, body?: unknown) => {
      const patch = body as { idList?: string } | undefined;
      if (patch?.idList) currentList = patch.idList;
      return {};
    });
    vi.mocked(client.post).mockImplementation(async () => {
      hasLabel = true;
      return {};
    });

    const repo = repository(client);
    const updated = await repo.updateCard('card-1', { idList: 'list-2' });

    expect(client.post).toHaveBeenCalledWith('/cards/card-1/idLabels', {
      value: 'label-novo',
    });
    expect(updated.labels.map((label) => label.id)).toEqual(['label-novo']);
    expect(logState.entries[0]).toMatchObject({
      ruleId: 'rule-label',
      cardId: 'card-1',
      source: 'auto',
      actions: ['Adicionar etiqueta "Novo"'],
    });
  });

  it('cria cartão e aplica regra de entrada na lista', async () => {
    mocks.rules = [
      {
        id: 'rule-label',
        name: 'Entrou na lista recebe etiqueta',
        enabled: true,
        boardId: 'board-1',
        trigger: { type: 'enterList', listId: 'list-1' },
        actions: [{ type: 'addLabel', labelId: 'label-novo', labelName: 'Novo' }],
      },
    ];

    const client = fakeClient();
    let hasLabel = false;
    vi.mocked(client.post).mockImplementation(async (path: string) => {
      if (path === '/cards/card-new/idLabels') {
        hasLabel = true;
        return {};
      }
      return rawCard({ id: 'card-new', desc: `SEI ${PROCESS}` });
    });
    vi.mocked(client.get).mockImplementation(async () =>
      rawCard({
        id: 'card-new',
        desc: `SEI ${PROCESS}`,
        labels: hasLabel ? [{ id: 'label-novo', name: 'Novo', color: 'blue' }] : [],
      }),
    );

    const repo = repository(client);
    const card = await repo.createCard({
      name: 'Juliana Gomes',
      processNumber: PROCESS,
      listId: 'list-1',
    });

    expect(client.post).toHaveBeenCalledWith('/cards/card-new/idLabels', {
      value: 'label-novo',
    });
    expect(card.labels.map((label) => label.id)).toContain('label-novo');
    expect(logState.entries[0]).toMatchObject({
      ruleId: 'rule-label',
      cardId: 'card-new',
    });
  });

  it('encontra cartões sem vínculo com número de processo no comentário', async () => {
    const SEI_IN_TEXT = '23541.040441/2026-70';
    const client = fakeClient();
    vi.mocked(client.get).mockImplementation(async (path: string) => {
      if (path === '/members/me/boards') return [{ id: 'board-1', name: 'Quadro' }];
      if (path === '/boards/board-1/lists') {
        return [{ id: 'list-1', name: 'Lista', pos: 1 }];
      }
      if (path === '/boards/board-1/cards') {
        return [
          rawCard({ id: 'card-1', desc: `SEI: ${SEI_IN_TEXT}\nNome: Ana` }),
          rawCard({ id: 'card-2', desc: `SEI ${PROCESS}` }),
          rawCard({ id: 'card-3', desc: 'Sem número de processo' }),
        ];
      }
      return [];
    });

    const repo = repository(client);
    const candidates = await repo.findUnlinkedCandidates('board-1');

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      cardId: 'card-1',
      cardName: 'Cartão',
      processNumber: SEI_IN_TEXT,
    });
    expect(candidates[0]?.snippet).toContain(SEI_IN_TEXT);
  });
});
