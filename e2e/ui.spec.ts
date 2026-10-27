import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const PROCESS = '08660.018176/2014-60';
const OTHER = '12345.678901/2025-12';

const card = {
  id: 'card-1',
  name: 'Cartão vinculado',
  desc: `SEI ${PROCESS}\nDescrição do cartão`,
  description: 'Descrição do cartão',
  shortUrl: 'https://trello.com/c/1',
  due: null,
  dueComplete: false,
  idBoard: 'board-1',
  idList: 'list-1',
  idChecklists: [],
  labels: [{ id: 'label-1', name: 'Urgente', color: 'red' }],
  board: { id: 'board-1', name: 'Contratos' },
  list: { id: 'list-1', name: 'Em análise' },
  links: [PROCESS],
  hasChecklist: false,
};

const freeCard = {
  ...card,
  id: 'card-2',
  name: 'Cartão livre',
  desc: 'Ainda sem vínculo',
  description: 'Ainda sem vínculo',
  links: [],
};

const settings = {
  appKey: 'key',
  appToken: 'token',
  defaultBoardId: 'board-1',
  defaultBoardName: 'Contratos',
  defaultListId: 'list-1',
  defaultListName: 'Em análise',
  activatedOrigins: [],
  allSites: false,
  theme: 'light',
  compact: true,
  autoRefreshMinutes: 0,
};

const scriptPath = join(process.cwd(), '.output', 'chrome-mv3', 'sei-inject.js');
const iconDataUrl = `data:image/png;base64,${readFileSync(
  join(process.cwd(), 'public', 'icon-128.png'),
).toString('base64')}`;

async function stubExtension(page: Page) {
  await page.addInitScript(
    ({ cardData, freeCardData, settingsData, iconUrl }) => {
      const ok = (data: unknown) => Promise.resolve({ ok: true, data });
      const withCallback = <T,>(value: T | Promise<T>, callback?: (result: T) => void) => {
        if (typeof callback === 'function') {
          void Promise.resolve(value).then(callback);
          return undefined;
        }
        return Promise.resolve(value);
      };
      const storageGet = (_keys?: unknown, callback?: (result: Record<string, unknown>) => void) =>
        withCallback({}, callback);
      // Stub mínimo da API de extensão para executar o script real fora do Chrome.
      (window as unknown as { chrome: unknown }).chrome = {
        runtime: {
          id: 'test-extension',
          getURL: (path: string) => (path.endsWith('icon-128.png') ? iconUrl : path),
          sendMessage: (
            message: { rpc: string; payload?: { processNumber?: string; cardIds?: string[] } },
            callback?: (response: unknown) => void,
          ) => {
            let response: Promise<unknown>;
            switch (message.rpc) {
              case 'settings:get':
                response = ok(settingsData);
                break;
              case 'trello:all-linked-cards':
                response = ok([cardData]);
                break;
              case 'trello:cards-for-process':
                response = ok(
                  [cardData].filter((item) => item.links.includes(message.payload?.processNumber ?? '')),
                );
                break;
              case 'trello:boards':
                response = ok([
                  { id: 'board-1', name: 'Contratos' },
                  { id: 'board-2', name: 'Outro quadro' },
                ]);
                break;
              case 'trello:lists':
                response = ok([{ id: 'list-1', name: 'Em análise' }]);
                break;
              case 'trello:board-cards':
                response = ok([freeCardData, cardData]);
                break;
              case 'trello:link-cards':
                response = ok(
                  (message.payload?.cardIds ?? []).map((cardId) => {
                    const found = [cardData, freeCardData].find((item) => item.id === cardId);
                    return { cardId, status: 'linked', card: found };
                  }),
                );
                break;
              case 'trello:create-card':
                response = ok({ ...freeCardData, id: 'card-new', name: 'Novo cartão criado' });
                break;
              default:
                response = ok(null);
            }
            return withCallback(response, callback);
          },
          openOptionsPage: () => Promise.resolve(),
          getManifest: () => ({ version: '0.1.0' }),
        },
        storage: {
          local: {
            get: storageGet,
            set: (_items: unknown, callback?: () => void) => withCallback(undefined, callback),
            remove: (_keys: unknown, callback?: () => void) => withCallback(undefined, callback),
          },
          sync: { get: storageGet },
        },
        permissions: {
          request: () => Promise.resolve(true),
          contains: () => Promise.resolve(true),
          remove: () => Promise.resolve(true),
        },
        tabs: { query: () => Promise.resolve([]) },
      };
    },
    { cardData: card, freeCardData: freeCard, settingsData: settings, iconUrl: iconDataUrl },
  );
}

async function openFixture(page: Page, fixture: string, url: string) {
  const html = readFileSync(join(process.cwd(), 'src', 'test', 'fixtures', fixture), 'utf8');
  await page.route('http://sei.test/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }),
  );
  await page.goto(url);
  await page.addScriptTag({ path: scriptPath });
}

test.beforeEach(async ({ page }) => {
  await stubExtension(page);
});

test('lista de processos mostra o cartão vinculado e o botão de ações', async ({ page }) => {
  await openFixture(page, 'sei-list-v4.html', 'http://sei.test/sei/controlador.php?acao=procedimento_controlar');

  await expect(page.getByText('Cartão vinculado')).toBeVisible();
  await expect(page.getByRole('button', { name: /Cartões/ }).first()).toBeVisible();
  await expect(page.getByText('SEI Flow').first()).toBeVisible();
});

test('processo aberto mostra o painel completo', async ({ page }) => {
  await openFixture(page, 'sei-content-v4.html', 'http://sei.test/sei/controlador.php?acao=procedimento_visualizar');

  await expect(page.getByText('SEI Flow').first()).toBeVisible();
  await expect(page.getByText('Cartão vinculado')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Novo cartão' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vincular cartões' })).toBeVisible();
});

test('diálogo de novo cartão abre com o destino padrão', async ({ page }) => {
  await openFixture(page, 'sei-content-v4.html', 'http://sei.test/sei/controlador.php?acao=procedimento_visualizar');
  await page.getByRole('button', { name: 'Novo cartão' }).click();

  await expect(page.getByText('Novo cartão no Trello')).toBeVisible();
  await expect(page.getByRole('dialog').getByLabel('Nome')).toHaveValue(PROCESS);
  await expect(page.getByText('Contratos').first()).toBeVisible();
  await expect(page.getByText('Em análise').first()).toBeVisible();
});

test('diálogo de vínculo lista cartões do quadro e permite seleção múltipla', async ({ page }) => {
  await openFixture(page, 'sei-content-v4.html', 'http://sei.test/sei/controlador.php?acao=procedimento_visualizar');
  await page.getByRole('button', { name: 'Vincular cartões' }).click();

  await expect(page.getByText('Vincular cartões existentes')).toBeVisible();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Cartão livre')).toBeVisible();
  await page.getByLabel('Somente cartões sem vínculo SEI').uncheck();
  await expect(dialog.getByText('Cartão vinculado').first()).toBeVisible();
  await dialog
    .locator('label.sf-link-item')
    .filter({ hasText: 'Cartão livre' })
    .getByRole('checkbox')
    .check();
  await expect(page.getByRole('button', { name: /Vincular \(1\)/ })).toBeVisible();
});

test('filtro sem cartão esconde processos que já têm cartão', async ({ page }) => {
  await openFixture(page, 'sei-list-v4.html', 'http://sei.test/sei/controlador.php?acao=procedimento_controlar');

  await page.getByRole('button', { name: 'Abrir filtros' }).click();
  await page.getByRole('button', { name: 'Sem cartão' }).click();
  await page.getByRole('button', { name: 'Aplicar' }).click();

  await expect(page.getByText('Cartão vinculado')).toBeHidden();
  await expect(page.getByText(OTHER)).toBeVisible();
});

