/**
 * Gera as capturas de tela da Chrome Web Store (1280x800).
 *
 * Uso:
 *   npm run build
 *   node scripts/store-screenshots.mjs
 */
import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = process.cwd();
const OUT = join(ROOT, 'docs', 'store', 'screenshots-1280x800');
const VIEWPORT = { width: 1280, height: 800 };
const PROCESS = '08660.018176/2014-60';
const OTHER = '12345.678901/2025-12';
const THIRD = '98765.432109/2026-01';
const now = Date.now();

const iconDataUrl = `data:image/png;base64,${readFileSync(join(ROOT, 'public', 'icon-128.png')).toString('base64')}`;
const injectPath = join(ROOT, '.output', 'chrome-mv3', 'sei-inject.js');

const settings = {
  appKey: 'key',
  appToken: 'token',
  defaultBoardId: 'board-1',
  defaultBoardName: 'DEMANDAS',
  defaultListId: 'list-1',
  defaultListName: 'Em andamento',
  activatedOrigins: ['http://sei.test'],
  allSites: false,
  theme: 'light',
  compact: true,
  notificationsEnabled: true,
  autoRefreshMinutes: 0,
};

const cards = [
  {
    id: 'card-1',
    name: 'Ana Paula Ribeiro',
    desc: `SEI ${PROCESS}`,
    description:
      'Nome: Ana Paula Ribeiro\nMatrícula: 1459901\nCargo: Técnica em Farmácia\nUnidade: Farmácia Clínica',
    shortUrl: 'https://trello.com/c/1',
    due: new Date(now + 8 * 86_400_000).toISOString(),
    dueComplete: false,
    idBoard: 'board-1',
    idList: 'list-1',
    idChecklists: [],
    labels: [
      { id: 'label-1', name: 'Adicional', color: 'orange_light' },
      { id: 'label-2', name: 'Urgente', color: 'red' },
    ],
    board: { id: 'board-1', name: 'DEMANDAS' },
    list: { id: 'list-1', name: 'Em andamento' },
    links: [PROCESS],
    hasChecklist: true,
    lastActivity: new Date(now - 600_000).toISOString(),
  },
  {
    id: 'card-2',
    name: 'Bruno Carvalho',
    desc: `SEI ${OTHER}`,
    description: 'Nome: Bruno Carvalho\nMatrícula: 2130592\nCargo: Médico',
    shortUrl: 'https://trello.com/c/2',
    due: new Date(now + 3 * 86_400_000).toISOString(),
    dueComplete: false,
    idBoard: 'board-1',
    idList: 'list-1',
    idChecklists: [],
    labels: [{ id: 'label-1', name: 'Adicional', color: 'orange_light' }],
    board: { id: 'board-1', name: 'DEMANDAS' },
    list: { id: 'list-1', name: 'Em andamento' },
    links: [OTHER],
    hasChecklist: false,
    lastActivity: new Date(now - 3_600_000).toISOString(),
  },
  {
    id: 'card-3',
    name: 'Camila Nunes',
    desc: `SEI ${PROCESS}`,
    description: 'Nome: Camila Nunes\nMatrícula: 3415538\nCargo: Enfermeira',
    shortUrl: 'https://trello.com/c/3',
    due: new Date(now + 5 * 86_400_000).toISOString(),
    dueComplete: false,
    idBoard: 'board-1',
    idList: 'list-2',
    idChecklists: [],
    labels: [],
    board: { id: 'board-1', name: 'DEMANDAS' },
    list: { id: 'list-2', name: 'Aguardando informação' },
    links: [PROCESS],
    hasChecklist: false,
    lastActivity: new Date(now - 86_400_000).toISOString(),
  },
  {
    id: 'card-4',
    name: 'Diego Martins',
    desc: `SEI ${OTHER}`,
    description: 'Nome: Diego Martins\nMatrícula: 5566778\nCargo: Analista',
    shortUrl: 'https://trello.com/c/4',
    due: new Date(now - 4 * 86_400_000).toISOString(),
    dueComplete: true,
    idBoard: 'board-1',
    idList: 'list-3',
    idChecklists: [],
    labels: [],
    board: { id: 'board-1', name: 'DEMANDAS' },
    list: { id: 'list-3', name: 'Concluído' },
    links: [OTHER],
    hasChecklist: false,
    lastActivity: new Date(now - 2 * 86_400_000).toISOString(),
  },
  {
    id: 'card-5',
    name: 'Eduardo Prado',
    desc: `SEI ${THIRD}`,
    description: 'Nome: Eduardo Prado\nMatrícula: 7788990\nCargo: Analista',
    shortUrl: 'https://trello.com/c/5',
    due: new Date(now + 15 * 86_400_000).toISOString(),
    dueComplete: false,
    idBoard: 'board-1',
    idList: 'list-2',
    idChecklists: [],
    labels: [{ id: 'label-2', name: 'Urgente', color: 'red' }],
    board: { id: 'board-1', name: 'DEMANDAS' },
    list: { id: 'list-2', name: 'Aguardando informação' },
    links: [THIRD],
    hasChecklist: false,
    lastActivity: new Date(now - 7_200_000).toISOString(),
  },
];

const catalog = {
  [PROCESS]: {
    number: PROCESS,
    specification: 'Aquisição de material de escritório',
    processType: 'Processo Administrativo',
    url: 'http://sei.test/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=1',
    origin: 'http://sei.test',
    unread: false,
    updatedAt: now,
  },
  [OTHER]: {
    number: OTHER,
    specification: 'Contratação de serviço de limpeza',
    processType: 'Processo de Contratação',
    url: 'http://sei.test/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=2',
    origin: 'http://sei.test',
    unread: true,
    updatedAt: now,
  },
  [THIRD]: {
    number: THIRD,
    specification: 'Revisão de escala de plantão',
    processType: 'Processo Administrativo',
    url: 'http://sei.test/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=3',
    origin: 'http://sei.test',
    unread: false,
    updatedAt: now,
  },
};

const boards = [
  { id: 'board-1', name: 'DEMANDAS' },
  { id: 'board-2', name: 'CONTRATOS' },
];
const lists = [
  { id: 'list-1', name: 'Em andamento' },
  { id: 'list-2', name: 'Aguardando informação' },
  { id: 'list-3', name: 'Concluído' },
];
const labels = [
  { id: 'label-1', name: 'Adicional', color: 'orange_light' },
  { id: 'label-2', name: 'Urgente', color: 'red' },
];
const rules = [
  {
    id: 'rule-done',
    name: 'Concluído vai para a lista de concluídos',
    enabled: true,
    boardId: 'board-1',
    trigger: { type: 'completed' },
    actions: [
      { type: 'moveToList', listId: 'list-3' },
      { type: 'moveToTop' },
    ],
  },
  {
    id: 'rule-sei',
    name: 'Processo SEI atualizado, volta para Em andamento',
    enabled: true,
    boardId: 'board-1',
    trigger: { type: 'seiUpdated', listId: 'list-2' },
    actions: [{ type: 'moveToList', listId: 'list-1' }],
  },
  {
    id: 'rule-label',
    name: 'Entrou na lista recebe etiqueta',
    enabled: false,
    boardId: 'board-1',
    trigger: { type: 'enterList', listId: 'list-1' },
    actions: [{ type: 'addLabel', labelId: 'label-1', labelName: 'Adicional' }],
  },
];
const stats = {
  'rule-done': { applied: 42, lastAt: now - 3_600_000, lastSource: 'auto' },
  'rule-sei': { applied: 7, lastAt: now - 86_400_000, lastSource: 'manual' },
};
const lastRun = {
  id: 'run_1',
  at: now - 86_400_000,
  ruleId: 'rule-sei',
  ruleName: 'Processo SEI atualizado, volta para Em andamento',
  moves: [{ cardId: 'card-3', cardName: 'Camila Nunes', fromListId: 'list-2', toListId: 'list-1' }],
  labels: [],
};

function pageStub({ settingsData, boardsData, listsData, labelsData, rulesData, statsData, runData, cardsData, catalogData, iconUrl }) {
  const ok = (data) => Promise.resolve({ ok: true, data });
  const withCallback = (value, callback) => {
    if (typeof callback === 'function') {
      void Promise.resolve(value).then(callback);
      return undefined;
    }
    return Promise.resolve(value);
  };
  const storageData = {
    'sei-flow:settings:v1': settingsData,
    'sei-flow:processes:v1': catalogData,
  };
  const storageGet = (keys, callback) => {
    const result = {};
    const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(storageData);
    for (const key of list) if (key in storageData) result[key] = storageData[key];
    return withCallback(result, callback);
  };
  window.chrome = {
    runtime: {
      id: 'test-extension',
      getURL: (path) => (path.endsWith('icon-128.png') ? iconUrl : `http://127.0.0.1:4190${path}`),
      sendMessage: (message, callback) => {
        let response;
        switch (message.rpc) {
          case 'settings:get':
            response = ok(settingsData);
            break;
          case 'trello:boards':
            response = ok(boardsData);
            break;
          case 'trello:lists':
            response = ok(listsData);
            break;
          case 'trello:board-labels':
            response = ok(labelsData);
            break;
          case 'trello:cards-for-process':
            response = ok(
              cardsData.filter((card) =>
                card.links.includes(message.payload?.processNumber ?? ''),
              ),
            );
            break;
          case 'trello:all-linked-cards':
            response = ok(cardsData);
            break;
          case 'processes:list':
            response = ok(Object.values(catalogData));
            break;
          case 'rules:list':
            response = ok(rulesData);
            break;
          case 'rules:stats':
            response = ok(statsData);
            break;
          case 'rules:last-run':
            response = ok(runData);
            break;
          default:
            response = ok(null);
        }
        return withCallback(response, callback);
      },
      openOptionsPage: () => Promise.resolve(),
      getManifest: () => ({ version: '1.1.1', permissions: [], host_permissions: [] }),
    },
    storage: {
      local: {
        get: storageGet,
        set: (_items, cb) => withCallback(undefined, cb),
        remove: (_keys, cb) => withCallback(undefined, cb),
      },
      sync: { get: storageGet },
      session: { get: storageGet, set: (_items, cb) => withCallback(undefined, cb) },
    },
    permissions: {
      request: () => Promise.resolve(true),
      contains: () => Promise.resolve(true),
      remove: () => Promise.resolve(true),
    },
    tabs: { query: () => Promise.resolve([]), create: () => Promise.resolve({}) },
  };
}

async function shootPage({ fixture, url, out, after }) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.addInitScript(pageStub, {
    settingsData: settings,
    boardsData: boards,
    listsData: lists,
    labelsData: labels,
    rulesData: rules,
    statsData: stats,
    runData: lastRun,
    cardsData: cards,
    catalogData: catalog,
    iconUrl: iconDataUrl,
  });
  const html = readFileSync(join(ROOT, 'src', 'test', 'fixtures', fixture), 'utf8');
  await page.route('http://sei.test/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }),
  );
  await page.goto(url);
  await page.addScriptTag({ path: injectPath });
  await page.waitForTimeout(1600);
  if (after) await after(page);
  await page.screenshot({ path: join(OUT, out) });
  await browser.close();
}

// 1) Painel inicial
{
  const extensionDir = mkdtempSync(join(tmpdir(), 'sf-store-'));
  const profileDir = mkdtempSync(join(tmpdir(), 'sf-store-profile-'));
  cpSync(join(ROOT, '.output', 'chrome-mv3'), extensionDir, { recursive: true });
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
    viewport: VIEWPORT,
  });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20000 });
  const extensionId = new URL(worker.url()).host;
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await worker.evaluate(
    async ({ settingsData, cardsData, catalogData, lastTab }) => {
      await chrome.storage.local.set({
        'sei-flow:settings:v1': settingsData,
        'sei-flow:processes:v1': catalogData,
        'sei-flow:cache:v2:all-linked': { at: Date.now(), value: cardsData },
      });
      await chrome.storage.session.set({ 'sei-flow:last-action-tab': lastTab });
    },
    {
      settingsData: settings,
      cardsData: cards,
      catalogData: catalog,
      lastTab: {
        id: 1,
        url: 'http://sei.test/sei/controlador.php?acao=procedimento_controlar',
        title: 'SEI - Controle de Processos',
        capturedAt: now,
      },
    },
  );

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/dashboard.html`);
  await page.waitForSelector('.sdo-card', { timeout: 25000 });
  await page.waitForTimeout(900);
  await page.locator('#sdo-sort').selectOption('name');
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'dashboard-1280x800.png') });

  // 2) Filtros e etiquetas
  await page.getByRole('button', { name: /^Filtros/ }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, 'filter-1280x800.png') });
  await context.close();
}

// 3) Lista de processos
await shootPage({
  fixture: 'sei-list-v4.html',
  url: 'http://sei.test/sei/controlador.php?acao=procedimento_controlar',
  out: 'list-1280x800.png',
});

// 4) Processo aberto
await shootPage({
  fixture: 'sei-content-v4.html',
  url: 'http://sei.test/sei/controlador.php?acao=procedimento_trabalhar',
  out: 'process-1280x800.png',
});

// 5) Novo cartão
await shootPage({
  fixture: 'sei-content-v4.html',
  url: 'http://sei.test/sei/controlador.php?acao=procedimento_trabalhar',
  out: 'create-dialog-1280x800.png',
  after: async (page) => {
    await page.getByRole('button', { name: 'Novo cartão' }).click();
    await page.waitForTimeout(700);
  },
});

// 6) Regras automáticas
{
  const server = createServer(async (req, res) => {
    try {
      const url = (req.url ?? '/').split('?')[0];
      const file = join(ROOT, '.output', 'chrome-mv3', url === '/' ? '/options.html' : url);
      const body = await readFile(file);
      const types = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.png': 'image/png',
      };
      res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((resolve) => server.listen(4190, '127.0.0.1', resolve));

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.addInitScript(pageStub, {
    settingsData: settings,
    boardsData: boards,
    listsData: lists,
    labelsData: labels,
    rulesData: rules,
    statsData: stats,
    runData: lastRun,
    cardsData: cards,
    catalogData: catalog,
    iconUrl: iconDataUrl,
  });
  await page.goto('http://127.0.0.1:4190/options.html');
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: 'Regras' }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUT, 'rules-1280x800.png') });

  await page.getByRole('button', { name: 'Diagnóstico' }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, 'options-1280x800.png') });
  await browser.close();
  server.close();
}

console.log('Capturas geradas em', OUT);
