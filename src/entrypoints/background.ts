import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { injectSeiScript } from '../core/activation/inject';
import { openDashboardTab } from '../core/extension/dashboard-tab';
import { handleRpc, getDueSummary } from '../core/messaging/handlers';
import { isRpcRequest } from '../core/messaging/contract';
import {
  getSettings,
  isOriginActivated,
  normalizeOrigin,
  removeActivatedOrigin,
  saveSettings,
} from '../core/storage/settings';
import { saveLastActionTab } from '../core/storage/last-tab';
import { looksLikeSeiUrl } from '../core/sei/detect';

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

const DUE_ALARM = 'sei-flow:due-check';
const NOTIFICATION_ID = 'sei-flow:due';
const LAST_NOTIFICATION_KEY = 'sei-flow:last-due-notification';

async function setupAlarms(): Promise<void> {
  try {
    await browser.alarms.create(DUE_ALARM, { periodInMinutes: 60 });
  } catch (error) {
    console.debug('[SEI Flow] Falha ao criar alarme de prazos.', error);
  }
}

/** O ícone não mostra contador; limpa qualquer número de versões anteriores. */
async function clearBadge(): Promise<void> {
  await browser.action.setBadgeText({ text: '' }).catch(() => undefined);
  await browser.action.setTitle({ title: 'SEI Flow' }).catch(() => undefined);
}

async function notifyDue(): Promise<void> {
  try {
    const settings = await getSettings();
    if (!settings.notificationsEnabled) return;
    const summary = await getDueSummary();
    const count = summary.overdue + summary.dueToday;
    if (count === 0) return;

    const todayKey = new Date().toISOString().slice(0, 10);
    const stored = await browser.storage.local.get(LAST_NOTIFICATION_KEY);
    if (stored[LAST_NOTIFICATION_KEY] === todayKey) return;

    await browser.notifications.create(NOTIFICATION_ID, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon-128.png'),
      title: 'SEI Flow - prazos',
      message: `${summary.overdue} atrasado(s) e ${summary.dueToday} vencendo hoje.`,
      priority: 1,
    });
    await browser.storage.local.set({ [LAST_NOTIFICATION_KEY]: todayKey });
  } catch (error) {
    console.debug('[SEI Flow] Falha ao notificar prazos.', error);
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
    void setupAlarms();
    void clearBadge();
    void injectIntoOpenTabs();
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== DUE_ALARM) return;
    void notifyDue();
  });

  browser.notifications.onClicked.addListener((notificationId) => {
    if (notificationId !== NOTIFICATION_ID) return;
    void browser.notifications.clear(notificationId);
    void openDashboardTab();
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

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isRpcRequest(message)) return false;
    handleRpc(message)
      .then((response) => {
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
