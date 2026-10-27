import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { injectSeiScript } from '../core/activation/inject';
import { handleRpc, getDueSummary } from '../core/messaging/handlers';
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
  await setupAlarms();
  void refreshBadge();
  if (details.reason === 'install') {
    await browser.runtime.openOptionsPage();
  }
}

const DUE_ALARM = 'sei-flow:due-check';
const NOTIFICATION_ID = 'sei-flow:due';
const LAST_NOTIFICATION_KEY = 'sei-flow:last-due-notification';
let badgeTimer: ReturnType<typeof setTimeout> | null = null;

async function setupAlarms(): Promise<void> {
  try {
    await browser.alarms.create(DUE_ALARM, { periodInMinutes: 60 });
  } catch (error) {
    console.debug('[SEI Flow] Falha ao criar alarme de prazos.', error);
  }
}

async function refreshBadge(): Promise<void> {
  try {
    const settings = await getSettings();
    if (!settings.appKey || !settings.appToken) {
      await browser.action.setBadgeText({ text: '' });
      return;
    }
    const summary = await getDueSummary();
    const count = summary.overdue + summary.dueToday;
    await browser.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    await browser.action.setBadgeBackgroundColor({ color: '#c0392b' });
    await browser.action.setTitle({
      title:
        count > 0
          ? `SEI Flow — ${summary.overdue} atrasado(s), ${summary.dueToday} vencendo hoje`
          : 'SEI Flow',
    });
  } catch {
    await browser.action.setBadgeText({ text: '' }).catch(() => undefined);
  }
}

function scheduleBadgeUpdate(): void {
  if (badgeTimer) clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => {
    badgeTimer = null;
    void refreshBadge();
  }, 2_000);
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
      title: 'SEI Flow — prazos',
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
    void refreshBadge();
    void injectIntoOpenTabs();
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== DUE_ALARM) return;
    void refreshBadge();
    void notifyDue();
  });

  browser.notifications.onClicked.addListener((notificationId) => {
    if (notificationId !== NOTIFICATION_ID) return;
    void browser.notifications.clear(notificationId);
    void browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });
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
        if (response.ok && message.rpc.startsWith('trello:')) {
          scheduleBadgeUpdate();
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
