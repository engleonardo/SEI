import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const BOARD = { id: 'board-1', name: 'DEMANDAS' };
const LISTS = [
  { id: 'list-a', name: 'Aguardando' },
  { id: 'list-b', name: 'Demandas' },
  { id: 'list-c', name: 'Concluído' },
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

async function stubDashboard(page: Page, options: { mirrored?: boolean } = {}) {
  await page.addInitScript(
    ({ board, lists, initialCards, mirrored }) => {
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
      let mirrorGroup = mirrored
        ? { id: 'mirror-1', cardIds: ['card-1', 'card-2'], createdAt: 1 }
        : null;
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
            message: {
              rpc: string;
              payload?: {
                cardId?: string;
                patch?: { idList?: string };
                listId?: string;
                pos?: number;
                url?: string;
                name?: string;
              };
            },
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
              case 'trello:board-labels':
                response = ok([]);
                break;
              case 'trello:attachments':
                response = ok([
                  {
                    id: 'att-1',
                    name: 'Contrato.pdf',
                    url: 'https://trello.com/c/att-1',
                    bytes: 12345,
                    date: '2026-11-18T12:00:00.000Z',
                    mimeType: 'application/pdf',
                    isUpload: true,
                  },
                ]);
                break;
              case 'trello:add-attachment-url':
                response = ok({
                  id: 'att-2',
                  name: 'Link',
                  url: message.payload?.url ?? 'https://example.com',
                  bytes: 0,
                  date: '2026-11-18T12:00:00.000Z',
                  mimeType: null,
                  isUpload: false,
                });
                break;
              case 'trello:copy-card':
                response = ok({
                  id: 'copy-1',
                  name: 'Cópia',
                  shortUrl: 'https://trello.com/c/copy',
                });
                break;
              case 'trello:copy-board':
                response = ok({
                  id: 'board-copy',
                  name: message.payload?.name ?? 'Cópia',
                });
                break;
              case 'mirrors:status':
                response = ok(mirrorGroup);
                break;
              case 'trello:mirror-card':
                mirrorGroup = {
                  id: 'mirror-1',
                  cardIds: [message.payload?.cardId ?? 'card-1', 'copy-1'],
                  createdAt: 1,
                };
                response = ok({
                  card: { id: 'copy-1', name: 'Cópia', shortUrl: 'https://trello.com/c/copy' },
                  group: mirrorGroup,
                });
                break;
              case 'mirrors:remove':
                mirrorGroup = null;
                response = ok(undefined);
                break;
              case 'trello:delete-card':
                response = ok(undefined);
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
              case 'trello:update-list':
                response = ok({
                  id: message.payload?.listId,
                  name: lists.find((list) => list.id === message.payload?.listId)?.name ?? '',
                  pos: message.payload?.pos,
                });
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
    {
      board: BOARD,
      lists: LISTS,
      initialCards: [
        {
          ...card('card-1', 'Cartão A', 'list-a', ['11111.111111/2024-11']),
          lastActivity: '2026-11-01T12:00:00.000Z',
        },
        {
          ...card('card-3', 'Cartão Z', 'list-a', []),
          lastActivity: '2026-11-18T12:00:00.000Z',
        },
        card('card-2', 'Cartão B', 'list-b', []),
      ],
      mirrored: options.mirrored ?? false,
    },
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
  await expect(page.locator('.sdo-page')).toHaveClass(/sdo-page--kanban/);
  await expect(page.locator('.sdo-kanban-column__title')).toHaveText([
    'Aguardando',
    'Demandas',
    'Concluído',
  ]);
  await expect(page.getByRole('region', { name: 'Coluna Concluído' })).toBeVisible();
  await expect(page.getByText('Arrastar', { exact: true })).toHaveCount(0);
  const columnHeight = await page
    .locator('.sdo-kanban-column')
    .first()
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(columnHeight).toBeGreaterThan(600);
  const firstCard = page.locator('.sdo-kanban-card').first();
  await firstCard.hover();
  await page.waitForTimeout(250);
  const hoverBorder = await firstCard
    .locator('.sdo-card')
    .evaluate((element) => getComputedStyle(element).borderColor);
  expect(hoverBorder).toBe('rgb(29, 78, 216)');
  const cardOverflow = await page
    .locator('.sdo-kanban-card')
    .first()
    .evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(cardOverflow).toBeLessThanOrEqual(1);
  const selectedProcess = await page
    .locator('.sdo-process')
    .first()
    .evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return selection?.toString() ?? '';
    });
  expect(selectedProcess).toContain('11111.111111/2024-11');
  const target = page.getByRole('region', { name: 'Coluna Demandas' });
  await expect(target).toBeVisible();

  const sourceCard = page.locator('.sdo-kanban-card').filter({ hasText: 'Cartão A' }).first();
  const dragHandle = sourceCard.getByRole('button', { name: 'Arrastar cartão Cartão A' });
  const cardBox = await dragHandle.boundingBox();
  const targetBox = await target.boundingBox();
  if (!cardBox || !targetBox) throw new Error('Sem geometria para o teste de arrastar.');

  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
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

  // Desfazer pelo botão devolve o cartão para a coluna de origem.
  await page.getByRole('button', { name: 'Desfazer última movimentação' }).click();
  await expect(page.getByRole('region', { name: 'Coluna Aguardando' }).getByText('Cartão A')).toBeVisible();
  const undoCall = await page.evaluate(
    () =>
      ((window as unknown as { __rpcCalls?: Array<{ rpc: string; payload?: { patch?: { idList?: string } } }> })
        .__rpcCalls ?? []).filter((call) => call.rpc === 'trello:update-card').at(-1),
  );
  expect(undoCall?.payload?.patch?.idList).toBe('list-a');
});

test('kanban respeita a ordenação escolhida', async ({ page }) => {
  await stubDashboard(page);
  await openDashboard(page);

  await page.getByRole('button', { name: 'Visão em quadro (Kanban)' }).click();
  const column = page.getByRole('region', { name: 'Coluna Aguardando' });
  const titles = column.locator('.sdo-card__title-row h3');
  await expect(titles).toHaveText(['Cartão A', 'Cartão Z']);

  await page.getByLabel('Ordenar cartões').selectOption('activity');
  await expect(titles).toHaveText(['Cartão Z', 'Cartão A']);
});

test('kanban reordena colunas', async ({ page }) => {
  await stubDashboard(page);
  await openDashboard(page);

  await page.getByRole('button', { name: 'Visão em quadro (Kanban)' }).click();
  await expect(page.locator('.sdo-kanban-column__title')).toHaveText([
    'Aguardando',
    'Demandas',
    'Concluído',
  ]);

  await page.getByRole('button', { name: 'Mover coluna Demandas para a esquerda' }).click();
  await expect(page.locator('.sdo-kanban-column__title')).toHaveText([
    'Demandas',
    'Aguardando',
    'Concluído',
  ]);

  const update = await page.evaluate(
    () =>
      ((window as unknown as { __rpcCalls?: Array<{ rpc: string; payload?: { listId?: string } }> })
        .__rpcCalls ?? []).filter((call) => call.rpc === 'trello:update-list').at(-1),
  );
  expect(update?.payload?.listId).toBe('list-b');
});

test('kanban abre novo cartão na coluna', async ({ page }) => {
  await stubDashboard(page);
  await openDashboard(page);

  await page.getByRole('button', { name: 'Visão em quadro (Kanban)' }).click();
  const firstColumn = page.getByRole('region', { name: 'Coluna Aguardando' });
  await firstColumn.getByRole('button', { name: 'Adicionar cartão' }).click();

  await expect(page.getByText('Novo cartão no Trello')).toBeVisible();
  await expect(page.getByRole('dialog').getByLabel('Lista', { exact: true })).toHaveValue('list-a');
});

test('kanban abre anexos e adiciona link', async ({ page }) => {
  await stubDashboard(page);
  await openDashboard(page);

  await page.getByRole('button', { name: 'Visão em quadro (Kanban)' }).click();
  const card = page.locator('.sdo-kanban-card').filter({ hasText: 'Cartão A' }).first();
  await card.getByRole('button', { name: 'Anexos' }).click();

  await expect(page.getByRole('dialog').getByText('Contrato.pdf')).toBeVisible();
  await page.getByLabel('URL do anexo').fill('https://example.com/arquivo');
  await page.getByRole('button', { name: 'Anexar link' }).click();
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Link' })).toBeVisible();
});

test('kanban abre compartilhar e clona cartão', async ({ page }) => {
  await stubDashboard(page);
  await openDashboard(page);

  await page.getByRole('button', { name: 'Visão em quadro (Kanban)' }).click();
  const card = page.locator('.sdo-kanban-card').filter({ hasText: 'Cartão A' }).first();
  await card.getByRole('button', { name: 'Compartilhar e clonar' }).click();

  await page.getByRole('tab', { name: 'Duplicar' }).click();
  await expect(page.getByRole('radio', { name: /Cópia independente/ })).toBeVisible();
  const listSelect = page.getByRole('dialog').getByLabel('Lista de destino');
  await listSelect.selectOption('list-b');
  await page.getByRole('button', { name: 'Clonar cartão' }).click();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          ((window as unknown as { __rpcCalls?: Array<{ rpc: string }> }).__rpcCalls ?? []).filter(
            (call) => call.rpc === 'trello:copy-card',
          ).length,
      ),
    )
    .toBeGreaterThan(0);

  const copyCall = await page.evaluate(
    () =>
      ((window as unknown as { __rpcCalls?: Array<{ rpc: string; payload?: { listId?: string } }> })
        .__rpcCalls ?? []).find((call) => call.rpc === 'trello:copy-card'),
  );
  expect(copyCall?.payload?.listId).toBe('list-b');
});

test('kanban cria espelho do cartão', async ({ page }) => {
  await stubDashboard(page);
  await openDashboard(page);

  await page.getByRole('button', { name: 'Visão em quadro (Kanban)' }).click();
  const card = page.locator('.sdo-kanban-card').filter({ hasText: 'Cartão A' }).first();
  await card.getByRole('button', { name: 'Compartilhar e clonar' }).click();
  await page.getByRole('tab', { name: 'Duplicar' }).click();
  await page.getByRole('radio', { name: /Espelho sincronizado/ }).click();
  await page.getByRole('dialog').getByLabel('Lista de destino').selectOption('list-b');
  await page.getByRole('button', { name: 'Espelhar cartão' }).click();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          ((window as unknown as { __rpcCalls?: Array<{ rpc: string }> }).__rpcCalls ?? []).filter(
            (call) => call.rpc === 'trello:mirror-card',
          ).length,
      ),
    )
    .toBeGreaterThan(0);
  await expect(page.getByRole('dialog').getByText(/Espelhado com 1 cartão/)).toBeVisible();
});

test('exclusão de espelho oferece só este ou todos', async ({ page }) => {
  await stubDashboard(page, { mirrored: true });
  await openDashboard(page);

  await page.getByRole('button', { name: 'Visão em quadro (Kanban)' }).click();
  const card = page.locator('.sdo-kanban-card').filter({ hasText: 'Cartão A' }).first();
  await card.getByRole('button', { name: 'Excluir cartão' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Excluir cartão espelhado')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Só este' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Todos os espelhos' })).toBeVisible();

  await dialog.getByRole('button', { name: 'Só este' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          ((window as unknown as { __rpcCalls?: Array<{ rpc: string }> }).__rpcCalls ?? []).filter(
            (call) => call.rpc === 'trello:delete-card',
          ).length,
      ),
    )
    .toBeGreaterThan(0);
  const deleteCall = await page.evaluate(
    () =>
      ((window as unknown as { __rpcCalls?: Array<{ rpc: string; payload?: { deleteMirrors?: boolean } }> })
        .__rpcCalls ?? []).find((call) => call.rpc === 'trello:delete-card'),
  );
  expect(deleteCall?.payload?.deleteMirrors).toBe(false);
});

test('exclusão de espelho pode remover todos', async ({ page }) => {
  await stubDashboard(page, { mirrored: true });
  await openDashboard(page);

  await page.getByRole('button', { name: 'Visão em quadro (Kanban)' }).click();
  const card = page.locator('.sdo-kanban-card').filter({ hasText: 'Cartão A' }).first();
  await card.getByRole('button', { name: 'Excluir cartão' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Todos os espelhos' }).click();

  const deleteCall = await page.evaluate(
    () =>
      ((window as unknown as { __rpcCalls?: Array<{ rpc: string; payload?: { deleteMirrors?: boolean } }> })
        .__rpcCalls ?? []).find((call) => call.rpc === 'trello:delete-card'),
  );
  expect(deleteCall?.payload?.deleteMirrors).toBe(true);
});

test('filtros abrem antes das listas e recolhem', async ({ page }) => {
  await stubDashboard(page);
  await openDashboard(page);

  const filtersButton = page.getByRole('button', { name: /^Filtros/ });
  await filtersButton.click();
  const filters = page.locator('.sdo-filters');
  const lists = page.locator('.sdo-lists');
  await expect(filters).toBeVisible();
  await expect(lists).toBeVisible();
  const positions = await Promise.all([
    filters.evaluate((element) => element.getBoundingClientRect().top),
    lists.evaluate((element) => element.getBoundingClientRect().top),
  ]);
  expect(positions[0]).toBeLessThan(positions[1]);

  await filters.getByRole('button', { name: 'Recolher' }).click();
  await expect(filters).toHaveCount(0);
});

test('kanban move cartão com o teclado', async ({ page }) => {
  await stubDashboard(page);
  await openDashboard(page);

  await expect(page.getByText('Cartão A')).toBeVisible();
  await page.getByRole('button', { name: 'Visão em quadro (Kanban)' }).click();
  const handle = page.getByRole('button', { name: 'Arrastar cartão Cartão A' });
  await handle.focus();
  await page.keyboard.press('Space');
  // O dnd-kit registra o listener de teclado logo depois de iniciar o arraste.
  await expect(page.locator('.sdo-kanban-card--dragging').first()).toBeVisible();
  await page.waitForTimeout(120);
  // Cada seta salta para a coluna vizinha, independente do tamanho da tela.
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.sdo-kanban-column--over')).toHaveAttribute(
    'aria-label',
    'Coluna Demandas',
  );
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

  // Ctrl+Z desfaz a última movimentação.
  await page.keyboard.press('Control+z');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          ((window as unknown as { __rpcCalls?: Array<{ rpc: string }> }).__rpcCalls ?? []).filter(
            (call) => call.rpc === 'trello:update-card',
          ).length,
      ),
    )
    .toBeGreaterThan(1);
  const undoCall = await page.evaluate(
    () =>
      ((window as unknown as { __rpcCalls?: Array<{ rpc: string; payload?: { patch?: { idList?: string } } }> })
        .__rpcCalls ?? []).filter((call) => call.rpc === 'trello:update-card').at(-1),
  );
  expect(undoCall?.payload?.patch?.idList).toBe('list-a');
});
