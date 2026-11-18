import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const BOARD = { id: 'board-1', name: 'DEMANDAS' };
const LISTS = [
  { id: 'list-a', name: 'Aguardando' },
  { id: 'list-b', name: 'Demandas' },
];

function card(id: string, name: string, idList: string, links: string[]) {
  const list = LISTS.find((item) => item.id === idList) ?? LISTS[0];
  return {
    id,
    name,
    desc: '',
    description: '',
    shortUrl: `https://trello.com/c/${id}`,
    start: null,
    due: null,
    dueComplete: false,
    idBoard: BOARD.id,
    idList,
    idChecklists: [],
    labels: [],
    board: BOARD,
    list,
    links,
    hasChecklist: false,
    lastActivity: null,
  };
}

async function stubDashboard(page: Page) {
  await page.addInitScript(
    ({ board, lists, initialCards }) => {
      const ok = (data: unknown) => Promise.resolve({ ok: true, data });
      const withCallback = <T>(value: T | Promise<T>, callback?: (result: T) => void) => {
        if (typeof callback === 'function') {
          void Promise.resolve(value).then(callback);
          return undefined;
        }
        return Promise.resolve(value);
      };
      const settings = {
        appKey: 'key',
        appToken: 'token',
        defaultBoardId: board.id,
        defaultBoardName: board.name,
        defaultListId: lists[0]?.id ?? '',
        defaultListName: lists[0]?.name ?? '',
        activatedOrigins: [],
        allSites: false,
        autoSeiHosts: false,
        theme: 'light',
        compact: true,
        notificationsEnabled: true,
        autoRefreshMinutes: 0,
      };
      let cards = initialCards as Array<Record<string, unknown>>;
      const calls: Array<{ rpc: string; payload?: unknown }> = [];
      (window as unknown as { __rpcCalls: typeof calls }).__rpcCalls = calls;

      const storageGet = (keys?: unknown, callback?: (result: Record<string, unknown>) => void) => {
        const result: Record<string, unknown> = {};
        const requested = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : [];
        if (requested.includes('sei-flow:settings:v1')) result['sei-flow:settings:v1'] = settings;
        if (requested.includes('sei-flow:pinned-cards:v1')) result['sei-flow:pinned-cards:v1'] = [];
        return withCallback(result, callback);
      };

      (window as unknown as { chrome: unknown }).chrome = {
        runtime: {
          id: 'test-extension',
          getURL: (path: string) => path,
          getManifest: () => ({ version: '1.5.4' }),
          sendMessage: (
            message: { rpc: string; payload?: { cardId?: string; patch?: { idList?: string } } },
            callback?: (response: unknown) => void,
          ) => {
            calls.push({ rpc: message.rpc, payload: message.payload });
            let response: Promise<unknown>;
            switch (message.rpc) {
              case 'settings:get':
                response = ok(settings);
                break;
              case 'processes:list':
                response = ok([]);
                break;
              case 'activation:last-tab':
                response = ok(null);
                break;
              case 'trello:boards':
                response = ok([board]);
                break;
              case 'trello:lists':
                response = ok(lists);
                break;
              case 'trello:board-cards':
                response = ok(cards);
                break;
              case 'trello:update-card':
                cards = cards.map((item) => {
                  if (item.id !== message.payload?.cardId) return item;
                  const idList = message.payload?.patch?.idList ?? (item.idList as string);
                  return {
                    ...item,
                    idList,
                    list: lists.find((list) => list.id === idList) ?? item.list,
                  };
                });
                response = ok(cards.find((item) => item.id === message.payload?.cardId));
                break;
              default:
                response = ok(null);
            }
            return withCallback(response, callback);
          },
        },
        storage: {
          local: {
            get: storageGet,
            set: (_items: unknown, callback?: () => void) => withCallback(undefined, callback),
            remove: (_keys: unknown, callback?: () => void) => withCallback(undefined, callback),
          },
          sync: { get: storageGet },
          onChanged: { addListener: () => undefined, removeListener: () => undefined },
        },
        permissions: {
          request: () => Promise.resolve(true),
          contains: () => Promise.resolve(true),
          remove: () => Promise.resolve(true),
        },
        tabs: { query: () => Promise.resolve([]), create: () => Promise.resolve({}) },
      };
    },
    { board: BOARD, lists: LISTS, initialCards: [card('card-1', 'Cartão A', 'list-a', ['11111.111111/2024-11']), card('card-2', 'Cartão B', 'list-b', [])] },
  );
}

async function openDashboard(page: Page) {
  await page.route('http://dashboard.test/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname === '/' ? '/dashboard.html' : url.pathname;
    await route.fulfill({ path: join(process.cwd(), '.output', 'chrome-mv3', path) });
  });
  await page.goto('http://dashboard.test/dashboard.html');
}

test('kanban move cartão entre colunas', async ({ page }) => {
  await stubDashboard(page);
  await openDashboard(page);

  await expect(page.getByText('Cartão A')).toBeVisible();
  await page.getByRole('button', { name: 'Visão em quadro (Kanban)' }).click();
  await expect(page.getByRole('region', { name: 'Coluna Aguardando' })).toBeVisible();
  const target = page.getByRole('region', { name: 'Coluna Demandas' });
  await expect(target).toBeVisible();

  const handle = page.getByRole('button', { name: 'Arrastar cartão Cartão A' });
  const handleBox = await handle.boundingBox();
  const targetBox = await target.boundingBox();
  if (!handleBox || !targetBox) throw new Error('Sem geometria para o teste de arrastar.');

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 60, { steps: 12 });
  await page.mouse.up();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          ((window as unknown as { __rpcCalls?: Array<{ rpc: string }> }).__rpcCalls ?? []).filter(
            (call) => call.rpc === 'trello:update-card',
          ).length,
      ),
    )
    .toBeGreaterThan(0);

  const update = await page.evaluate(
    () =>
      ((window as unknown as { __rpcCalls?: Array<{ rpc: string; payload?: { patch?: { idList?: string } } }> })
        .__rpcCalls ?? []).find((call) => call.rpc === 'trello:update-card'),
  );
  expect(update?.payload?.patch?.idList).toBe('list-b');
  await expect(target.getByText('Cartão A')).toBeVisible();
});

test('kanban move cartão com o teclado', async ({ page }) => {
  await stubDashboard(page);
  await openDashboard(page);

  await expect(page.getByText('Cartão A')).toBeVisible();
  await page.getByRole('button', { name: 'Visão em quadro (Kanban)' }).click();
  const handle = page.getByRole('button', { name: 'Arrastar cartão Cartão A' });
  await handle.focus();
  await page.keyboard.press('Space');
  for (let index = 0; index < 24; index += 1) {
    await page.keyboard.press('ArrowRight');
  }
  await page.keyboard.press('Space');

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          ((window as unknown as { __rpcCalls?: Array<{ rpc: string }> }).__rpcCalls ?? []).filter(
            (call) => call.rpc === 'trello:update-card',
          ).length,
      ),
    )
    .toBeGreaterThan(0);

  const update = await page.evaluate(
    () =>
      ((window as unknown as { __rpcCalls?: Array<{ rpc: string; payload?: { patch?: { idList?: string } } }> })
        .__rpcCalls ?? []).find((call) => call.rpc === 'trello:update-card'),
  );
  expect(update?.payload?.patch?.idList).toBe('list-b');
});
