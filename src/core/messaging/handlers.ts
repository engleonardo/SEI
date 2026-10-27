import { browser } from 'wxt/browser';
import { normalizeOrigin, originPermissionPattern } from '../storage/settings';
import { injectSeiScript } from '../activation/inject';
import type { RpcMap, RpcRequest, RpcResponse, RpcType } from './contract';
import { TrelloError } from '../trello/client';
import { cacheClear } from '../trello/cache';
import { TrelloRepository } from '../trello/repository';
import {
  addActivatedOrigin,
  getSettings,
  isOriginActivated,
  removeActivatedOrigin,
  saveSettings,
} from '../storage/settings';
import { getLastActionTab } from '../storage/last-tab';
import { listProcessRecords, upsertProcessRecords } from '../storage/processes';
import { getRules, saveRules } from '../storage/rules';

const repository = new TrelloRepository();

type HandlerMap = {
  [T in RpcType]: (payload: RpcMap[T]['payload']) => Promise<RpcMap[T]['result']>;
};

const handlers = {
  'settings:get': () => getSettings(),

  'settings:save': async (payload) => {
    const previous = await getSettings();
    const next = await saveSettings(payload);
    if (previous.appKey !== next.appKey || previous.appToken !== next.appToken) {
      await cacheClear();
    }
    return next;
  },

  'settings:test-connection': () => repository.testConnection(),

  'settings:clear-cache': async () => {
    await cacheClear();
    return { cleared: true as const };
  },

  'options:open': async () => {
    await browser.runtime.openOptionsPage();
    return undefined;
  },

  'dashboard:open': async () => {
    await browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });
    return undefined;
  },

  'trello:boards': () => repository.getBoards(),
  'trello:lists': ({ boardId }) => repository.getLists(boardId),
  'trello:board-cards': ({ boardId }) => repository.getBoardCards(boardId),
  'trello:card': ({ cardId }) => repository.getCard(cardId),
  'trello:cards-for-process': ({ processNumber }) => repository.getCardsForProcess(processNumber),
  'trello:all-linked-cards': () => repository.getAllLinkedCards(),
  'trello:search-cards': ({ query }) => repository.searchCardsByName(query),
  'trello:create-card': (payload) => repository.createCard(payload),
  'trello:update-card': ({ cardId, patch }) => repository.updateCard(cardId, patch),
  'trello:delete-card': async ({ cardId }) => {
    await repository.deleteCard(cardId);
    return undefined;
  },
  'trello:link-cards': ({ cardIds, processNumber }) => repository.linkCards(cardIds, processNumber),
  'trello:link-cards-bulk': ({ cardIds, processNumbers }) =>
    repository.linkCardsToProcesses(cardIds, processNumbers),
  'trello:unlink-card': ({ cardId, processNumber }) => repository.unlinkCard(cardId, processNumber),
  'trello:board-labels': ({ boardId, fresh }) => repository.getBoardLabels(boardId, fresh),
  'trello:create-label': ({ boardId, name, color }) => repository.createLabel(boardId, name, color),
  'trello:add-label': ({ cardId, labelId }) => repository.addLabelToCard(cardId, labelId),
  'trello:remove-label': ({ cardId, labelId }) => repository.removeLabelFromCard(cardId, labelId),
  'trello:checklists': ({ cardId }) => repository.getChecklists(cardId),
  'trello:create-checklist': ({ cardId, name }) => repository.createChecklist(cardId, name),
  'trello:add-check-item': ({ checklistId, name }) => repository.addCheckItem(checklistId, name),
  'trello:update-check-item': async ({ cardId, checkItemId, state }) => {
    await repository.updateCheckItem(cardId, checkItemId, state);
    return undefined;
  },
  'trello:delete-check-item': async ({ checklistId, checkItemId }) => {
    await repository.deleteCheckItem(checklistId, checkItemId);
    return undefined;
  },
  'trello:delete-checklist': async ({ checklistId }) => {
    await repository.deleteChecklist(checklistId);
    return undefined;
  },

  'activation:add-origin': async ({ origin }) => {
    const normalized = normalizeOrigin(origin);
    if (!normalized) throw new TrelloError('validation', 'Origem inválida.');
    const settings = await getSettings();
    if (!settings.allSites) {
      const granted = await browser.permissions.contains({
        origins: [originPermissionPattern(normalized)],
      });
      if (!granted) {
        throw new TrelloError('permission', 'Permissão de acesso a este site não concedida.');
      }
    }
    const next = addActivatedOrigin(settings, normalized);
    return saveSettings({ activatedOrigins: next.activatedOrigins });
  },

  'activation:remove-origin': async ({ origin }) => {
    const normalized = normalizeOrigin(origin);
    if (!normalized) throw new TrelloError('validation', 'Origem inválida.');
    const settings = await getSettings();
    const next = removeActivatedOrigin(settings, normalized);
    if (!settings.allSites) {
      await browser.permissions
        .remove({ origins: [originPermissionPattern(normalized)] })
        .catch(() => false);
    }
    return saveSettings({ activatedOrigins: next.activatedOrigins });
  },

  'activation:set-all-sites': async ({ enabled }) => {
    if (enabled) {
      const granted = await browser.permissions.contains({ origins: ['*://*/*'] });
      if (!granted) {
        throw new TrelloError('permission', 'Permissão para todos os sites não concedida.');
      }
    } else {
      await browser.permissions.remove({ origins: ['*://*/*'] }).catch(() => false);
    }
    return saveSettings({ allSites: enabled });
  },

  'activation:inject-tab': async ({ tabId }) => {
    await injectSeiScript(tabId);
    return undefined;
  },

  'activation:status': async ({ url }) => {
    const settings = await getSettings();
    return {
      activated: isOriginActivated(url, settings),
      allSites: settings.allSites,
      origin: normalizeOrigin(url),
    };
  },

  'activation:last-tab': () => getLastActionTab(),

  'rules:list': () => getRules(),

  'rules:save': ({ rules }) => saveRules(rules),

  'rules:apply-now': ({ ruleId }) => repository.applyRuleNow(ruleId),

  'processes:list': () => listProcessRecords(),

  'processes:upsert': ({ processes }) => upsertProcessRecords(processes),
} satisfies HandlerMap;

export interface DueSummary {
  total: number;
  overdue: number;
  dueToday: number;
  dueSoon: number;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export async function getDueSummary(): Promise<DueSummary> {
  const cards = await repository.getAllLinkedCards();
  const today = startOfDay(new Date());
  const soonLimit = new Date(today);
  soonLimit.setDate(soonLimit.getDate() + 7);

  let overdue = 0;
  let dueToday = 0;
  let dueSoon = 0;

  for (const card of cards) {
    if (!card.due || card.dueComplete) continue;
    const due = startOfDay(new Date(card.due));
    if (due.getTime() < today.getTime()) overdue += 1;
    else if (due.getTime() === today.getTime()) dueToday += 1;
    else if (due.getTime() <= soonLimit.getTime()) dueSoon += 1;
  }

  return { total: cards.length, overdue, dueToday, dueSoon };
}

export async function handleRpc(request: RpcRequest): Promise<RpcResponse<unknown>> {  const handler = (handlers as Record<string, unknown>)[request.rpc] as
    | ((payload: unknown) => Promise<unknown>)
    | undefined;

  if (!handler) {
    return {
      ok: false,
      error: { code: 'validation', message: `Comando desconhecido: ${request.rpc}` },
    };
  }

  try {
    const data = await handler(request.payload);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof TrelloError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    return {
      ok: false,
      error: {
        code: 'unknown',
        message: error instanceof Error ? error.message : 'Erro inesperado na extensão.',
      },
    };
  }
}
