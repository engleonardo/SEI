import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { injectSeiScript } from '../core/activation/inject';
import { handleRpc } from '../core/messaging/handlers';
import { isRpcRequest } from '../core/messaging/contract';
import {
  getSettings,
  isOriginActivated,
  normalizeOrigin,
  removeActivatedOrigin,
  saveSettings,
} from '../core/storage/settings';

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
  if (details.reason === 'install') {
    await browser.runtime.openOptionsPage();
  }
}

async function onPermissionsRemoved(details: { origins?: string[] }): Promise<void> {
  const origins = details.origins ?? [];
  if (origins.length === 0) return;

  const settings = await getSettings();
  let next = settings;

  if (origins.includes('*://*/*') && settings.allSites) {
    next = await saveSettings({ allSites: false });
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
  browser.runtime.onInstalled.addListener((details) => {
    void onInstalled(details as { reason: string });
  });

  browser.runtime.onStartup.addListener(() => {
    void injectIntoOpenTabs();
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete') return;
    if (!tab.url) return;
    void maybeInject(tabId, tab.url);
  });

  browser.permissions.onRemoved.addListener((removed) => {
    void onPermissionsRemoved(removed as { origins?: string[] });
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isRpcRequest(message)) return false;
    handleRpc(message)
      .then((response) => sendResponse(response))
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
