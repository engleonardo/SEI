import { browser } from 'wxt/browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { handleRpc } from './handlers';
import { DEFAULT_SETTINGS } from '../storage/settings';
import { resetDemoData } from '../demo/store';

beforeEach(async () => {
  await browser.storage.local.clear();
  await browser.storage.local.set({
    'sei-flow:settings:v1': { ...DEFAULT_SETTINGS, skipTrello: true },
  });
  await resetDemoData();
});

describe('RPCs no modo sem Trello', () => {
  it('serve quadros de exemplo sem falar com o Trello', async () => {
    const response = await handleRpc({ rpc: 'trello:boards', payload: undefined });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    const boards = response.data as Array<{ name: string }>;
    expect(boards.map((board) => board.name)).toContain('Meus processos');
  });

  it('cria cartão local e devolve a lista de exemplo', async () => {
    const listsResponse = await handleRpc({
      rpc: 'trello:lists',
      payload: { boardId: 'demo-board-1' },
    });
    expect(listsResponse.ok).toBe(true);
    if (!listsResponse.ok) return;
    const lists = listsResponse.data as Array<{ id: string }>;

    const created = await handleRpc({
      rpc: 'trello:create-card',
      payload: { name: 'Cartão de teste', listId: lists[0]!.id },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const card = created.data as { name: string; idList: string };
    expect(card.name).toBe('Cartão de teste');
    expect(card.idList).toBe(lists[0]!.id);
  });
});
