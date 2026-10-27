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
    theme: 'auto' as const,
    compact: true,
    autoRefreshMinutes: 0,
  },
}));

vi.mock('../storage/settings', () => ({
  getSettings: async () => mocks.settings,
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
  cacheDelete: vi.fn(async () => undefined),
  cacheDeleteByPrefix: vi.fn(async () => undefined),
}));

const PROCESS = '08660.018176/2014-60';
const OTHER = '12345.678901/2025-12';

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
        desc: `SEI ${PROCESS}\nDescrição`,
      }),
    );
    expect(card.links).toEqual([PROCESS]);
  });

  it('atualiza descrição preservando vínculos existentes', async () => {
    const client = fakeClient();
    vi.mocked(client.get)
      .mockResolvedValueOnce(rawCard({ desc: `SEI ${PROCESS}\nSEI ${OTHER}\nAntiga` }))
      .mockResolvedValueOnce(rawCard({ desc: `SEI ${PROCESS}\nSEI ${OTHER}\nNova` }));
    vi.mocked(client.put).mockResolvedValue({});

    const repo = repository(client);
    const updated = await repo.updateCard('card-1', { description: 'Nova' });

    expect(client.put).toHaveBeenCalledWith('/cards/card-1', {
      desc: `SEI ${PROCESS}\nSEI ${OTHER}\nNova`,
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
      .mockResolvedValueOnce(rawCard({ desc: `SEI ${PROCESS}\nDescrição` }))
      .mockResolvedValueOnce(rawCard({ desc: `SEI ${PROCESS}\nDescrição` }));
    vi.mocked(client.put).mockResolvedValue({});

    const repo = repository(client);
    const results = await repo.linkCards(['card-1', 'card-1'], PROCESS);

    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('linked');
    expect(client.put).toHaveBeenCalledWith('/cards/card-1', {
      desc: `SEI ${PROCESS}\nDescrição`,
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
        rawCard({ desc: `SEI ${PROCESS}\nSEI ${OTHER}\nSEI ${third}\nDescrição` }),
      );
    vi.mocked(client.put).mockResolvedValue({});

    const repo = repository(client);
    const results = await repo.linkCardsToProcesses(['card-1'], [PROCESS, OTHER, third, PROCESS]);

    expect(results[0]?.status).toBe('linked');
    expect(client.put).toHaveBeenCalledTimes(1);
    expect(client.put).toHaveBeenCalledWith('/cards/card-1', {
      desc: `SEI ${PROCESS}\nSEI ${OTHER}\nSEI ${third}\nDescrição`,
    });
  });

  it('desvincula apenas o processo atual', async () => {
    const client = fakeClient();
    vi.mocked(client.get)
      .mockResolvedValueOnce(rawCard({ desc: `SEI ${PROCESS}\nSEI ${OTHER}\nDescrição` }))
      .mockResolvedValueOnce(rawCard({ desc: `SEI ${OTHER}\nDescrição` }));
    vi.mocked(client.put).mockResolvedValue({});

    const repo = repository(client);
    const updated = await repo.unlinkCard('card-1', PROCESS);

    expect(client.put).toHaveBeenCalledWith('/cards/card-1', {
      desc: `SEI ${OTHER}\nDescrição`,
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
});
