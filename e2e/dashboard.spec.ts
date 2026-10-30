import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type BrowserContext } from '@playwright/test';

test.use({ trace: 'off' });
test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

const EXTENSION_SOURCE = join(process.cwd(), '.output', 'chrome-mv3');
const PROCESS = '08660.018176/2014-60';
const OTHER = '12345.678901/2025-12';

const now = Date.now();
const cards = [
  {
    id: 'card-1',
    name: 'Revisar contrato',
    desc: `SEI ${PROCESS}\nDescrição do contrato`,
    description: 'Descrição do contrato',
    shortUrl: 'https://trello.com/c/1',
    due: new Date(now + 86_400_000).toISOString(),
    dueComplete: false,
    idBoard: 'board-1',
    idList: 'list-1',
    idChecklists: [],
    labels: [
      { id: 'label-red', name: 'Urgente', color: 'red' },
      { id: 'label-light', name: 'Leonardo', color: 'green_light' },
    ],
    board: { id: 'board-1', name: 'Contratos' },
    list: { id: 'list-1', name: 'Em análise' },
    links: [PROCESS],
    hasChecklist: false,
    lastActivity: new Date(now - 60_000).toISOString(),
  },
  {
    id: 'card-2',
    name: 'Publicar edital',
    desc: `SEI ${OTHER}`,
    description: '',
    shortUrl: 'https://trello.com/c/2',
    due: new Date(now - 4 * 86_400_000).toISOString(),
    dueComplete: false,
    idBoard: 'board-1',
    idList: 'list-1',
    idChecklists: [],
    labels: [],
    board: { id: 'board-1', name: 'Contratos' },
    list: { id: 'list-1', name: 'Em análise' },
    links: [OTHER],
    hasChecklist: false,
    lastActivity: new Date(now - 10 * 86_400_000).toISOString(),
  },
];

const settings = {
  appKey: 'key',
  appToken: 'token',
  defaultBoardId: 'board-1',
  defaultBoardName: 'Contratos',
  defaultListId: 'list-1',
  defaultListName: 'Em análise',
  activatedOrigins: ['http://sei.test'],
  allSites: false,
  autoSeiHosts: false,
  theme: 'light',
  compact: true,
  notificationsEnabled: true,
  autoRefreshMinutes: 0,
};

const processes = {
  [PROCESS]: {
    number: PROCESS,
    specification: 'Aquisição de material de escritório',
    processType: 'Processo Administrativo',
    url: 'http://sei.test/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=1',
    origin: 'http://sei.test',
    unread: true,
    updatedAt: now,
  },
  [OTHER]: {
    number: OTHER,
    specification: 'Contratação de serviço de limpeza',
    processType: 'Processo de Contratação',
    url: 'http://sei.test/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=2',
    origin: 'http://sei.test',
    unread: false,
    updatedAt: now,
  },
};

async function seed(context: BrowserContext): Promise<void> {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20_000 });
  await worker.evaluate(
    async ({ settingsData, processData, cardsData, lastTab }) => {
      await chrome.storage.local.set({
        'sei-flow:settings:v1': settingsData,
        'sei-flow:processes:v1': processData,
        'sei-flow:cache:v2:all-linked': { at: Date.now(), value: cardsData },
      });
      await chrome.storage.session.set({ 'sei-flow:last-action-tab': lastTab });
    },
    {
      settingsData: settings,
      processData: processes,
      cardsData: cards,
      lastTab: {
        id: 1,
        url: 'http://sei.test/sei/controlador.php?acao=procedimento_controlar',
        title: 'SEI - Controle de Processos',
        capturedAt: now,
      },
    },
  );
}

test('dashboard é a página inicial, filtra por etiqueta/tipo e edita cartão inline', async () => {
  const extensionDir = mkdtempSync(join(tmpdir(), 'sei-flow-dash-'));
  const profileDir = mkdtempSync(join(tmpdir(), 'sei-flow-dash-profile-'));
  cpSync(EXTENSION_SOURCE, extensionDir, { recursive: true });

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
    ],
    viewport: { width: 1280, height: 900 },
  });

  try {
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20_000 });
    const extensionId = new URL(worker.url()).host;

    // onInstalled abre o dashboard e grava as configurações padrão.
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await seed(context);

    const dashboard = await context.newPage();
    await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html`);

    await expect(dashboard.getByRole('heading', { name: /Painel SEI Flow/ })).toBeVisible();
    await expect(dashboard.getByRole('combobox', { name: 'Quadro' })).toBeVisible();
    const totalMetric = dashboard.locator('.sdo-metric--total');
    await expect(totalMetric).toContainText('2');
    await expect(totalMetric).toContainText('Contratos');

    // Alternância de tema aplica na hora e persiste.
    await dashboard.locator('.sdo-theme-toggle').click();
    await expect(dashboard.locator('html')).toHaveAttribute('data-sf-theme', 'dark');
    await dashboard.locator('.sdo-theme-toggle').click();
    await expect(dashboard.locator('html')).toHaveAttribute('data-sf-theme', 'light');
    await expect(dashboard.getByText('Revisar contrato')).toBeVisible();
    await expect(dashboard.getByText('Publicar edital')).toBeVisible();
    await expect(
      dashboard.getByText('Desenvolvido por Engenheiro Leonardo Almeida de Oliveira'),
    ).toBeVisible();

    // Cartões de lista: o quadro padrão já vem escolhido e mostra a contagem por lista.
    await expect(dashboard.getByText('Listas do quadro')).toBeVisible();
    await expect(dashboard.getByRole('button', { name: /Sem vínculo/ })).toBeVisible();
    const listCard = dashboard.locator('.sdo-list-card').filter({ hasText: 'Em análise' }).first();
    await expect(listCard).toBeVisible();
    await listCard.click();
    await expect(dashboard.getByText('Revisar contrato')).toBeVisible();
    await expect(dashboard.locator('.sdo-list-card--on')).toHaveText(/Em análise/);
    await expect(dashboard.locator('.sdo-list-card--on')).toHaveCount(1);
    await dashboard.getByRole('button', { name: /Todas as listas/ }).click();
    await expect(dashboard.locator('.sdo-list-card--on')).toHaveCount(0);

    // Indicadores alternam o filtro: clicar de novo remove o filtro.
    const overdueMetric = dashboard.locator('.sdo-metric--danger');
    await overdueMetric.click();
    await expect(overdueMetric).toHaveClass(/sdo-metric--active/);
    await overdueMetric.click();
    await expect(overdueMetric).not.toHaveClass(/sdo-metric--active/);

    // Link do processo abre a página real do SEI.
    const processLink = dashboard.getByRole('link', {
      name: new RegExp(PROCESS.replace('.', '\\.')),
    });
    await expect(processLink).toHaveAttribute(
      'href',
      'http://sei.test/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=1',
    );
    await dashboard.getByRole('button', { name: /^Filtros/ }).click();
    await dashboard.waitForTimeout(300);

    // Etiquetas usam as cores reais do Trello (incluindo as novas cores light/dark).
    const lightLabel = dashboard.getByRole('button', { name: /Leonardo/ }).first();
    expect(
      await lightLabel.evaluate((element) => getComputedStyle(element).backgroundColor),
    ).toBe('rgb(186, 243, 219)');
    const redLabel = dashboard.getByRole('button', { name: /Urgente/ }).first();
    expect(await redLabel.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
      'rgb(248, 113, 104)',
    );

    // Filtro por etiqueta.
    await lightLabel.click();
    await expect(dashboard.getByText('Revisar contrato')).toBeVisible();
    await expect(dashboard.getByText('Publicar edital')).toBeHidden();
    await dashboard.getByRole('button', { name: 'Limpar filtros' }).first().click();

    // Filtro por tipo de processo.
    await dashboard.locator('#sdo-type').selectOption('Processo de Contratação');
    await expect(dashboard.getByText('Publicar edital')).toBeVisible();
    await expect(dashboard.getByText('Revisar contrato')).toBeHidden();
    await dashboard.getByRole('button', { name: 'Limpar filtros' }).first().click();

    // Filtro por atualização recente no Trello.
    await dashboard.locator('#sdo-activity').selectOption('7d');
    await expect(dashboard.getByText('Revisar contrato')).toBeVisible();
    await expect(dashboard.getByText('Publicar edital')).toBeHidden();
    await dashboard.getByRole('button', { name: 'Limpar filtros' }).first().click();

    // Filtro por novidade no SEI.
    await dashboard.locator('#sdo-sei').selectOption('unread');
    await expect(dashboard.getByText('Revisar contrato')).toBeVisible();
    await expect(dashboard.getByText('Publicar edital')).toBeHidden();
    await dashboard.getByRole('button', { name: 'Limpar filtros' }).first().click();

    // Edição inline no próprio cartão (sem modal de detalhes).
    const firstCard = dashboard.locator('.sdo-card').filter({ hasText: 'Revisar contrato' }).first();
    await firstCard.locator('.sdo-card__title-button').click();
    await expect(dashboard.getByLabel('Nome do cartão')).toBeVisible();
    await dashboard.getByLabel('Nome do cartão').press('Escape');
    await expect(dashboard.getByLabel('Nome do cartão')).toHaveCount(0);

    // Ações ficam no rodapé do cartão, alinhadas à esquerda.
    const footer = firstCard.locator('.sdo-card__footer');
    await expect(footer.getByRole('button', { name: 'Etiquetas' })).toBeVisible();
    await expect(footer.getByRole('button', { name: 'Checklist' })).toBeVisible();
    await expect(footer.getByRole('button', { name: 'Prazo' })).toBeVisible();
    await expect(footer.getByRole('button', { name: 'Mover' })).toBeVisible();
    await expect(footer.getByRole('button', { name: 'Concluir' })).toBeVisible();
    await expect(dashboard.getByRole('button', { name: 'Detalhes' })).toHaveCount(0);

    await footer.getByRole('button', { name: 'Prazo' }).click();
    const dialog = dashboard.getByRole('dialog');
    await expect(dialog.getByText('Data de entrega')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();

    // O ícone não mostra contador numérico.
    await expect
      .poll(() => worker.evaluate(() => chrome.action.getBadgeText({})), { timeout: 10_000 })
      .toBe('');
  } finally {
    await context.close();
    rmSync(extensionDir, { recursive: true, force: true });
    rmSync(profileDir, { recursive: true, force: true });
  }
});
