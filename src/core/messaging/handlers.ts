import { browser } from 'wxt/browser';
import { normalizeOrigin, originPermissionPattern } from '../storage/settings';
import { injectSeiScript } from '../activation/inject';
import { openDashboardTab } from '../extension/dashboard-tab';
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
import { getLastActionTab, clearLastActionTab } from '../storage/last-tab';
import { exportBackup, importBackup } from '../storage/backup';
import {
  clearProcesses,
  listProcessRecords,
  markSeiRulesHandled,
  upsertProcessRecords,
} from '../storage/processes';
import { clearMirrors, getMirrorGroup } from '../storage/mirrors';
import { clearRules, getRules, saveRules } from '../storage/rules';
import { clearRuleRuns, getLastRuleRun } from '../storage/rule-runs';
import { clearRuleStats, getRuleStats } from '../storage/rule-stats';
import { clearRuleLog, getRuleLog } from '../storage/rule-log';
import { clearPins } from '../storage/pins';
import { clearSyncSnapshot } from '../storage/sync';
import { markSyncChanged } from '../storage/sync-tick';
import { setOptionsTarget } from '../storage/options-target';
import {
  backupLocalConfig,
  cancelConfigSync,
  clearConfigSyncMeta,
  clearLocalConfigBackup,
  pushConfigNow,
  queueConfigSync,
  restoreLocalConfig,
  syncConfig,
} from '../sync/config';
import { loadTrelloCredentials } from '../auth/credentials';
import { clearOAuthResult, readOAuthResult, startLoginTab, logout } from '../auth/oauth';
import { readSession } from '../auth/session';
import * as demo from '../demo/store';

const repository = new TrelloRepository(loadTrelloCredentials);

/**
 * Fecha o login: recupera o backup local (se houver) e puxa a configuração
 * sincronizada do Trello. Roda no background, sem depender da tela de Opções.
 */
export async function finishAuth(): Promise<void> {
  const session = await readSession();
  try {
    await restoreLocalConfig(session?.account?.id);
  } catch {
    // backup é best-effort
  }
  await Promise.race([
    syncConfig({ force: true }),
    new Promise<void>((resolve) => setTimeout(resolve, 6_000)),
  ]).catch(() => undefined);
}

type HandlerMap = {
  [T in RpcType]: (payload: RpcMap[T]['payload']) => Promise<RpcMap[T]['result']>;
};

const handlers = {
  'settings:get': () => getSettings(),

  'settings:save': async (payload) => {
    const previous = await getSettings();
    let next = await saveSettings(payload);
    if (previous.appKey !== next.appKey || previous.appToken !== next.appToken) {
      await cacheClear();
    }
    if (previous.skipTrello && !next.skipTrello) {
      // Ao sair do modo sem Trello, começa limpo: o login/sync traz o que é real.
      await clearRules();
      await clearRuleStats();
      await clearRuleLog();
      await clearRuleRuns();
      await clearSyncSnapshot();
      await clearConfigSyncMeta();
      next = await saveSettings({
        defaultBoardId: '',
        defaultBoardName: '',
        defaultListId: '',
        defaultListName: '',
      });
    }
    if (
      !next.skipTrello &&
      ('defaultBoardId' in payload ||
        'defaultBoardName' in payload ||
        'defaultListId' in payload ||
        'defaultListName' in payload)
    ) {
      queueConfigSync();
    }
    return next;
  },

  'settings:test-connection': () => repository.testConnection(),

  'auth:status': async () => {
    const settings = await getSettings();
    if (settings.skipTrello) {
      return { connected: true, mode: 'demo' as const };
    }
    const session = await readSession();
    if (session) {
      // Uma sessão válida vence qualquer resultado antigo de login em outra aba
      // (por exemplo, um código já usado que gerou erro antes de outra tentativa).
      return {
        connected: true,
        mode: 'oauth' as const,
        account: session.account,
        expiresAt: session.expiresAt,
      };
    }
    const result = await readOAuthResult();
    const error =
      result && !result.ok && Date.now() - result.at < 10 * 60_000
        ? (result.error ?? 'Falha no login com o Trello.')
        : undefined;
    if (settings.appKey && settings.appToken) {
      return { connected: true, mode: 'token' as const, error };
    }
    return { connected: false, mode: 'none' as const, error };
  },

  'auth:start': async () => {
    await startLoginTab();
    return undefined;
  },

  'auth:finish': async () => {
    await finishAuth();
    return undefined;
  },

  'auth:logout': async (payload) => {
    let backupFailed = false;
    if (payload?.clearManual) {
      // Salva o estado mais recente no quadro de configuração antes de limpar.
      cancelConfigSync();
      const session = await readSession();
      try {
        await pushConfigNow();
        await clearLocalConfigBackup();
      } catch {
        // Sem o push, guarda uma cópia local para recuperar no próximo login.
        backupFailed = true;
        await backupLocalConfig(session?.account?.id);
      }
    }
    await logout();
    await clearOAuthResult();
    if (payload?.clearManual) {
      await saveSettings({
        appKey: '',
        appToken: '',
        defaultBoardId: '',
        defaultBoardName: '',
        defaultListId: '',
        defaultListName: '',
      });
      await cacheClear();
      await clearRules();
      await clearRuleStats();
      await clearRuleLog();
      await clearRuleRuns();
      await clearProcesses();
      await clearMirrors();
      await clearPins();
      await clearLastActionTab();
      await clearSyncSnapshot();
      await clearConfigSyncMeta();
      await markSyncChanged();
    }
    const settings = await getSettings();
    if (settings.appKey && settings.appToken) {
      return { connected: true, mode: 'token' as const };
    }
    return { connected: false, mode: 'none' as const, backupFailed };
  },

  'sync:config': (payload) => syncConfig({ force: payload?.force }),

  'settings:clear-cache': async () => {
    await cacheClear();
    return { cleared: true as const };
  },

  'settings:export': ({ includeCredentials, includeRules }) => exportBackup(includeCredentials, includeRules),

  'settings:import': async ({ data, importRules }) => {
    const result = await importBackup(data, { importRules });
    // Destino, sites e credenciais podem ter mudado: o cache e o snapshot
    // antigos não valem mais para o novo conjunto de configurações.
    await cacheClear();
    await clearSyncSnapshot();
    return result;
  },

  'options:open': async (payload) => {
    if (payload?.tab) await setOptionsTarget(payload.tab);
    if (typeof browser.runtime.openOptionsPage === 'function') {
      await browser.runtime.openOptionsPage();
      return undefined;
    }
    await browser.tabs.create({ url: browser.runtime.getURL('/options.html') });
    return undefined;
  },

  'dashboard:open': async () => {
    await openDashboardTab();
    return undefined;
  },

  'trello:boards': (payload) => repository.getBoards(payload?.fresh),
  'trello:lists': ({ boardId, fresh }) => repository.getLists(boardId, fresh),
  'trello:update-list': ({ listId, pos }) => repository.updateListPosition(listId, pos),
  'trello:board-cards': ({ boardId, fresh }) => repository.getBoardCards(boardId, fresh),
  'trello:card': ({ cardId }) => repository.getCard(cardId),
  'trello:cards-for-process': ({ processNumber, fresh }) =>
    repository.getCardsForProcess(processNumber, fresh),
  'trello:cards-for-process-cache': ({ processNumber }) => repository.getCachedCardsForProcess(processNumber),
  'trello:all-linked-cards': (payload) => repository.getAllLinkedCards(payload?.fresh),
  'trello:search-cards': ({ query }) => repository.searchCardsByName(query),
  'trello:unlinked-candidates': ({ boardId }) => repository.findUnlinkedCandidates(boardId),
  'trello:create-card': (payload) => repository.createCard(payload),
  'trello:update-card': async ({ cardId, patch }) => {
    const card = await repository.updateCard(cardId, patch);
    await repository.syncMirrorsForCard(cardId).catch(() => undefined);
    return card;
  },
  'trello:delete-card': async ({ cardId, deleteMirrors }) => {
    const group = deleteMirrors ? await getMirrorGroup(cardId) : null;
    const ids = group ? Array.from(new Set(group.cardIds)) : [cardId];
    let failed = 0;
    let requestedError: unknown = null;
    for (const id of ids) {
      try {
        await repository.deleteCard(id);
      } catch (error) {
        failed += 1;
        if (id === cardId) requestedError = error;
      }
    }
    // Se o cartão escolhido não foi excluído, mantém o espelho intacto e avisa a interface.
    if (requestedError) throw requestedError;
    if (group) {
      // Falha parcial: mantém o grupo para tentar de novo, sem perder a sincronização.
      if (failed === 0) await repository.deleteMirrorGroup(group.id);
    } else {
      await repository.removeMirror(cardId);
    }
    return undefined;
  },
  'trello:link-cards': ({ cardIds, processNumber }) => repository.linkCards(cardIds, processNumber),
  'trello:link-cards-bulk': ({ cardIds, processNumbers }) =>
    repository.linkCardsToProcesses(cardIds, processNumbers),
  'trello:unlink-card': ({ cardId, processNumber }) => repository.unlinkCard(cardId, processNumber),
  'trello:board-labels': ({ boardId, fresh }) => repository.getBoardLabels(boardId, fresh),
  'trello:attachments': ({ cardId }) => repository.getAttachments(cardId),
  'trello:add-attachment-url': ({ cardId, url, name }) => repository.addAttachmentUrl(cardId, url, name),
  'trello:delete-attachment': async ({ cardId, attachmentId }) => {
    await repository.deleteAttachment(cardId, attachmentId);
    return undefined;
  },
  'trello:copy-card': ({ cardId, listId }) => repository.copyCard(cardId, listId),
  'trello:copy-board': ({ boardId, name }) => repository.copyBoard(boardId, name),
  'trello:create-board': ({ name }) => repository.createBoard(name),
  'trello:rename-board': ({ boardId, name }) => repository.renameBoard(boardId, name),
  'trello:create-list': ({ boardId, name }) => repository.createList(boardId, name),
  'trello:rename-list': ({ boardId, listId, name }) => repository.renameList(boardId, listId, name),
  'trello:mirror-card': ({ cardId, listId }) => repository.createCardMirror(cardId, listId),
  'mirrors:status': ({ cardId }) => getMirrorGroup(cardId),
  'mirrors:remove': async ({ cardId }) => {
    await repository.removeMirror(cardId);
    return undefined;
  },
  'mirrors:sync': () => repository.syncMirrors(),
  'trello:create-label': ({ boardId, name, color }) => repository.createLabel(boardId, name, color),
  'trello:add-label': ({ cardId, labelId }) => repository.addLabelToCard(cardId, labelId),
  'trello:remove-label': ({ cardId, labelId }) => repository.removeLabelFromCard(cardId, labelId),
  'trello:checklists': ({ cardId, fresh }) => repository.getChecklists(cardId, fresh),
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
      await browser.permissions.remove({ origins: [originPermissionPattern(normalized)] }).catch(() => false);
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

  'rules:save': async ({ rules }) => {
    const saved = await saveRules(rules);
    const settings = await getSettings();
    if (!settings.skipTrello) queueConfigSync();
    return saved;
  },

  'rules:apply-now': ({ ruleId, dryRun }) => repository.applyRuleNow(ruleId, dryRun),

  'rules:last-run': () => getLastRuleRun(),

  'rules:stats': () => getRuleStats(),

  'rules:clear-stats': async () => {
    await clearRuleStats();
    return {};
  },

  'rules:log': () => getRuleLog(),

  'rules:clear-log': async () => {
    await clearRuleLog();
    return [];
  },

  'rules:undo': () => repository.undoLastRuleRun(),

  'processes:list': () => listProcessRecords(),

  'processes:upsert': async ({ processes }) => {
    const result = await upsertProcessRecords(processes);
    let rulesApplied = 0;
    // `pending` também inclui novidades detectadas tarde (extensão fechada no
    // momento da atualização) e que ainda não passaram pelas regras.
    if (result.pending.length > 0) {
      try {
        rulesApplied = (await repository.applySeiUpdateRules(result.pending)).applied;
        await markSeiRulesHandled(result.pending);
      } catch {
        rulesApplied = 0;
      }
    }
    return { updated: result.updated, total: result.total, rulesApplied };
  },
} satisfies HandlerMap;

/** RPCs do "Modo sem Trello": dados de exemplo locais, sem API. */
const demoHandlers = {
  'trello:boards': () => demo.demoBoards(),
  'trello:lists': ({ boardId }) => demo.demoLists(boardId),
  'trello:board-cards': ({ boardId }) => demo.demoBoardCards(boardId),
  'trello:card': ({ cardId }) => demo.demoCard(cardId),
  'trello:cards-for-process': ({ processNumber }) => demo.demoCardsForProcess(processNumber),
  'trello:cards-for-process-cache': ({ processNumber }) =>
    demo.demoCardsForProcess(processNumber),
  'trello:all-linked-cards': () => demo.demoAllLinked(),
  'trello:search-cards': ({ query }) => demo.demoSearchCards(query),
  'trello:unlinked-candidates': async () => [],
  'trello:create-card': (payload) => demo.demoCreateCard(payload),
  'trello:update-card': ({ cardId, patch }) => demo.demoUpdateCard(cardId, patch),
  'trello:delete-card': async ({ cardId }) => {
    await demo.demoDeleteCard(cardId);
    return undefined;
  },
  'trello:link-cards': ({ cardIds, processNumber }) =>
    demo.demoLinkCards(cardIds, processNumber),
  'trello:link-cards-bulk': ({ cardIds, processNumbers }) =>
    demo.demoLinkCardsBulk(cardIds, processNumbers),
  'trello:unlink-card': ({ cardId, processNumber }) =>
    demo.demoUnlinkCard(cardId, processNumber),
  'trello:board-labels': ({ boardId }) => demo.demoBoardLabels(boardId),
  'trello:create-board': ({ name }) => demo.demoCreateBoard(name),
  'trello:rename-board': ({ boardId, name }) => demo.demoRenameBoard(boardId, name),
  'trello:create-list': ({ boardId, name }) => demo.demoCreateList(boardId, name),
  'trello:rename-list': ({ boardId, listId, name }) =>
    demo.demoRenameList(boardId, listId, name),
  'trello:update-list': ({ listId, pos }) => demo.demoUpdateList(listId, pos),
  'trello:create-label': ({ boardId, name, color }) =>
    demo.demoCreateLabel(boardId, name, color),
  'trello:add-label': ({ cardId, labelId }) => demo.demoAddLabel(cardId, labelId),
  'trello:remove-label': ({ cardId, labelId }) => demo.demoRemoveLabel(cardId, labelId),
  'trello:attachments': ({ cardId }) => demo.demoAttachments(cardId),
  'trello:add-attachment-url': ({ cardId, url, name }) =>
    demo.demoAddAttachmentUrl(cardId, url, name),
  'trello:delete-attachment': async ({ cardId }) => {
    await demo.demoDeleteAttachment(cardId);
    return undefined;
  },
  'trello:copy-card': ({ cardId, listId }) => demo.demoCopyCard(cardId, listId),
  'trello:copy-board': ({ boardId, name }) => demo.demoCopyBoard(boardId, name),
  'trello:checklists': ({ cardId }) => demo.demoChecklists(cardId),
  'trello:create-checklist': async () => [],
  'trello:add-check-item': async ({ name }) => ({
    id: `demo-check-${Date.now().toString(36)}`,
    name,
    state: 'incomplete' as const,
  }),
  'trello:update-check-item': async () => undefined,
  'trello:delete-check-item': async () => undefined,
  'trello:delete-checklist': async () => undefined,
  'trello:mirror-card': ({ cardId, listId }) => demo.demoMirrorCard(cardId, listId),
  'mirrors:status': async () => null,
  'mirrors:remove': async () => undefined,
  'mirrors:sync': async () => ({ updated: 0 }),
  'settings:test-connection': async () => ({
    id: 'demo',
    username: 'demo',
    fullName: 'Modo sem Trello',
    boardCount: 2,
  }),
  'sync:config': async () => ({ pulled: false, pushed: false, skipped: true, updatedAt: 0 }),
  'rules:apply-now': async () => ({ applied: 0, total: 0 }),
  'rules:undo': async () => ({ reverted: 0, total: 0, cards: 0 }),
} satisfies Partial<HandlerMap>;

export async function handleRpc(request: RpcRequest): Promise<RpcResponse<unknown>> {
  const handler = (handlers as Record<string, unknown>)[request.rpc] as
    ((payload: unknown) => Promise<unknown>) | undefined;

  if (!handler) {
    return {
      ok: false,
      error: { code: 'validation', message: `Comando desconhecido: ${request.rpc}` },
    };
  }

  try {
    const settings = await getSettings();
    if (settings.skipTrello) {
      const demoHandler = (
        demoHandlers as unknown as Record<string, ((payload: unknown) => Promise<unknown>) | undefined>
      )[request.rpc];
      if (demoHandler) {
        const data = await demoHandler(request.payload);
        return { ok: true, data };
      }
    }
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
