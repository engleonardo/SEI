import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrelloCard } from '../../core/domain/types';
import { ProcessPanel } from './ProcessPanel';

const rpc = vi.hoisted(() => vi.fn());

vi.mock('../../core/messaging/client', () => ({
  callRpc: rpc,
  errorCode: () => 'unknown',
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

vi.mock('../../core/messaging/actions', () => ({
  openOptionsPage: vi.fn(),
}));

const PROCESS = '11111.111111/2024-11';

const card: TrelloCard = {
  id: 'card-1',
  name: 'Cartão vinculado',
  desc: '',
  description: '',
  shortUrl: 'https://trello.com/c/1',
  start: null,
  due: null,
  dueComplete: false,
  idBoard: 'board-1',
  idList: 'list-1',
  idChecklists: [],
  labels: [],
  board: { id: 'board-1', name: 'Quadro' },
  list: { id: 'list-1', name: 'Lista' },
  links: [PROCESS],
  hasChecklist: false,
  lastActivity: null,
};

describe('ProcessPanel', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('mostra o cache na hora e atualiza em segundo plano', async () => {
    let resolveFresh: (value: TrelloCard[]) => void = () => undefined;
    const fresh = new Promise<TrelloCard[]>((resolve) => {
      resolveFresh = resolve;
    });

    rpc.mockImplementation((method: string) => {
      if (method === 'trello:cards-for-process-cache') return Promise.resolve([card]);
      if (method === 'trello:cards-for-process') return fresh;
      return Promise.resolve(null);
    });

    render(<ProcessPanel processNumber={PROCESS} />);

    await screen.findByText('Cartão vinculado');
    expect(rpc).toHaveBeenCalledWith('trello:cards-for-process-cache', { processNumber: PROCESS });
    expect(rpc).toHaveBeenCalledWith('trello:cards-for-process', {
      processNumber: PROCESS,
      fresh: true,
    });

    resolveFresh([{ ...card, name: 'Cartão atualizado' }]);
    await screen.findByText('Cartão atualizado');
  });
});
