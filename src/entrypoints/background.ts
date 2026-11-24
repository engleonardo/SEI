import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { injectSeiScript } from '../core/activation/inject';
import { openDashboardTab } from '../core/extension/dashboard-tab';
import { handleRpc, finishAuth } from '../core/messaging/handlers';
import { isRpcRequest } from '../core/messaging/contract';
import {
  getSettings,
  isOriginActivated,
  normalizeOrigin,
  removeActivatedOrigin,
  saveSettings,
} from '../core/storage/settings';
import { saveLastActionTab } from '../core/storage/last-tab';
import { markSyncChanged } from '../core/storage/sync-tick';
import { looksLikeSeiUrl } from '../core/sei/detect';
import { registerAttachmentUploadPort } from '../core/attachments/upload-port';
import { handleOAuthCallbackMessage } from '../core/auth/oauth';
import { syncConfig } from '../core/sync/config';

async function maybeInject(tabId: number, url: string): Promise<void> {
  if (tabId < 0 || !url) return;
  if (!normalizeOrigin(url)) return;
  const settings = await getSettings();
  if (!isOriginActivated(url, settings)) return;
  await injectSeiScript(tabId);
}

async function injectIntoOpenTabs(): Promise<void> {
  try {
    const settings = await getSettings();
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && tab.url && isOriginActivated(tab.url, settings)) {
        void injectSeiScript(tab.id);
      }
    }
  } catch (error) {
    console.debug('[SEI Flow] Falha ao reinjetar nas abas abertas.', error);
  }
}

async function onInstalled(details: { reason: string }): Promise<void> {
  await getSettings();
  await setupAlarms();
  await clearBadge();
  if (details.reason === 'install') {
    await openDashboardTab();
  }
}

const CONFIG_ALARM = 'sei-flow:config-sync';

/** Alterações feitas dentro do SEI avisam o painel para recarregar. */
const SYNC_MUTATION_RPCS = new Set([
  'trello:create-card',
  'trello:update-card',
  'trello:delete-card',
  'trello:link-cards',
  'trello:link-cards-bulk',
  'trello:unlink-card',
  'trello:create-label',
  'trello:add-label',
  'trello:remove-label',
  'trello:create-checklist',
  'trello:add-check-item',
  'trello:update-check-item',
  'trello:delete-check-item',
  'trello:delete-checklist',
  'trello:create-list',
  'trello:rename-list',
  'processes:upsert',
  'rules:save',
  'rules:apply-now',
  'rules:undo',
]);

async function setupAlarms(): Promise<void> {
  try {
    // Remove o alarme antigo de notificações de prazos (1.7.0 e anteriores).
    await browser.alarms.clear('sei-flow:due-check').catch(() => false);
    await browser.alarms.create(CONFIG_ALARM, { periodInMinutes: 30 });
  } catch (error) {
    console.debug('[SEI Flow] Falha ao criar alarmes.', error);
  }
}

/** O ícone não mostra contador; limpa qualquer número de versões anteriores. */
async function clearBadge(): Promise<void> {
  await browser.action.setBadgeText({ text: '' }).catch(() => undefined);
  await browser.action.setTitle({ title: 'SEI Flow' }).catch(() => undefined);
}

async function onPermissionsRemoved(details: { origins?: string[] }): Promise<void> {
  const origins = details.origins ?? [];
  if (origins.length === 0) return;

  const settings = await getSettings();
  let next = settings;

  if (origins.includes('*://*/*')) {
    if (settings.allSites) next = await saveSettings({ allSites: false });
    if (settings.autoSeiHosts) next = await saveSettings({ autoSeiHosts: false });
  }

  for (const pattern of origins) {
    if (pattern === '*://*/*') continue;
    const origin = pattern.replace(/\/\*$/, '');
    next = await saveSettings({
      activatedOrigins: removeActivatedOrigin(next, origin).activatedOrigins,
    });
  }
}

export default defineBackground(() => {
  registerAttachmentUploadPort();

  browser.runtime.onInstalled.addListener((details) => {
    void onInstalled(details as { reason: string });
  });

  browser.runtime.onStartup.addListener(() => {
    void setupAlarms();
    void clearBadge();
    void injectIntoOpenTabs();
    void syncConfig().catch(() => undefined);
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== CONFIG_ALARM) return;
    void syncConfig().catch(() => undefined);
  });

  // O dashboard é a página inicial: o ícone da extensão abre o painel.
  browser.action.onClicked.addListener((tab) => {
    void (async () => {
      if (tab.url) {
        const settings = await getSettings();
        if (isOriginActivated(tab.url, settings) || looksLikeSeiUrl(tab.url)) {
          await saveLastActionTab({ id: tab.id, url: tab.url, title: tab.title });
        }
      }
      await openDashboardTab();
    })();
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete') return;
    if (!tab.url) return;
    void maybeInject(tabId, tab.url);
  });

  browser.permissions.onRemoved.addListener((removed) => {
    void onPermissionsRemoved(removed as { origins?: string[] });
  });

  // A página de callback do OAuth entrega o código por content script.
  browser.runtime.onMessage.addListener((message, sender) => {
    if (
      !message ||
      typeof message !== 'object' ||
      (message as { type?: unknown }).type !== 'sei-flow:oauth-callback'
    ) {
      return false;
    }
    void handleOAuthCallbackMessage(
      message as {
        code?: unknown;
        state?: unknown;
        error?: unknown;
        errorDescription?: unknown;
      },
      { url: sender.url, tab: sender.tab ? { id: sender.tab.id } : undefined },
    )
      .then((finished) => {
        if (finished) void finishAuth();
      })
      .catch(() => undefined);
    return false;
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isRpcRequest(message)) return false;
    handleRpc(message)
      .then((response) => {
        if (response.ok && sender.tab && SYNC_MUTATION_RPCS.has(message.rpc)) {
          void markSyncChanged();
        }
        sendResponse(response);
      })
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: {
            code: 'unknown',
            message: error instanceof Error ? error.message : 'Erro inesperado.',
          },
        });
      });
    return true;
  });
});
