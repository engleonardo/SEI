import { browser } from 'wxt/browser';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  demoBoardCards,
  demoBoards,
  demoCardsForProcess,
  demoCreateCard,
  demoCreateList,
  demoLists,
  demoRenameList,
  demoUpdateCard,
  resetDemoData,
} from './store';

beforeEach(async () => {
  await browser.storage.local.clear();
  await resetDemoData();
});

describe('modo sem Trello', () => {
  it('começa com quadros, listas e cartões de exemplo', async () => {
    const boards = await demoBoards();
    expect(boards.length).toBeGreaterThanOrEqual(2);

    const lists = await demoLists(boards[0]!.id);
    expect(lists.length).toBeGreaterThan(0);

    const cards = await demoBoardCards(boards[0]!.id);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0]?.board?.name).toBe(boards[0]!.name);
  });

  it('cria e move um cartão de exemplo', async () => {
    const boards = await demoBoards();
    const lists = await demoLists(boards[0]!.id);

    const created = await demoCreateCard({
      name: 'Novo cartão',
      listId: lists[0]!.id,
      processNumber: '11111.111111/2026-11',
    });
    expect(created.links).toContain('11111.111111/2026-11');

    const moved = await demoUpdateCard(created.id, {
      idList: lists[1]!.id,
      name: 'Cartão movido',
    });
    expect(moved.name).toBe('Cartão movido');
    expect(moved.idList).toBe(lists[1]!.id);
  });

  it('cria um cartão de exemplo para um processo novo', async () => {
    const cards = await demoCardsForProcess('99999.999999/2026-11');
    expect(cards).toHaveLength(1);
    expect(cards[0]?.links).toContain('99999.999999/2026-11');
  });

  it('cria e renomeia uma lista de exemplo', async () => {
    const boards = await demoBoards();
    const list = await demoCreateList(boards[0]!.id, 'Nova lista');
    const renamed = await demoRenameList(boards[0]!.id, list.id, 'Renomeada');
    expect(renamed.name).toBe('Renomeada');
  });
});
