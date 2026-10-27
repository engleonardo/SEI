import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const EXTENSION_SOURCE = join(process.cwd(), '.output', 'chrome-mv3');

test('extensão carrega, injeta no SEI e abre opções/popup', async () => {
  const source = EXTENSION_SOURCE;
  const extensionDir = mkdtempSync(join(tmpdir(), 'sei-flow-ext-'));
  const profileDir = mkdtempSync(join(tmpdir(), 'sei-flow-profile-'));
  cpSync(source, extensionDir, { recursive: true });

  const manifestPath = join(extensionDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    host_permissions?: string[];
  };
  manifest.host_permissions = [...(manifest.host_permissions ?? []), 'http://sei.test/*'];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

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

    // O onInstalled abre a página de opções; esperamos ela terminar antes de abrir a aba do SEI.
    await new Promise((resolve) => setTimeout(resolve, 1200));

    await worker.evaluate(async (value) => {
      await chrome.storage.local.set({ 'sei-flow:settings:v1': value });
    }, {
      appKey: '',
      appToken: '',
      defaultBoardId: '',
      defaultBoardName: '',
      defaultListId: '',
      defaultListName: '',
      activatedOrigins: ['http://sei.test'],
      allSites: false,
      theme: 'light',
      compact: true,
      autoRefreshMinutes: 0,
    });

    const html = readFileSync(join(process.cwd(), 'src', 'test', 'fixtures', 'sei-list-v4.html'), 'utf8');
    await context.route('http://sei.test/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }),
    );

    const page = await context.newPage();
    await page.goto('http://sei.test/sei/controlador.php?acao=procedimento_controlar');

    // O script é injetado pelo background via scripting.executeScript.
    await expect(page.getByText('SEI Flow').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Abrir filtros' })).toBeVisible();

    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(options.getByRole('heading', { level: 1, name: /^Conexão$/ })).toBeVisible();

    const popup = await context.newPage();
    await popup.setViewportSize({ width: 380, height: 640 });
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.getByText('SEI Flow').first()).toBeVisible();
    await expect(popup.getByText('Página atual')).toBeVisible();
  } finally {
    await context.close();
    rmSync(extensionDir, { recursive: true, force: true });
    rmSync(profileDir, { recursive: true, force: true });
  }
});
