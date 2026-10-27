import type {
  BulkLinkResult,
  ConnectionInfo,
  Settings,
  TrelloBoard,
  TrelloCard,
  TrelloCardApi,
  TrelloChecklist,
  TrelloChecklistItem,
  TrelloLabel,
  TrelloList,
} from '../domain/types';
import { normalizeProcessNumber, sanitizeProcessForQuery } from '../domain/process';
import { addLink, hasLink, parseLinks, removeLink, stripLinks } from '../link/marker';
import { getRules } from '../storage/rules';
import { ruleMatches, type Rule, type RuleEvent } from '../domain/rules';
import { getSettings } from '../storage/settings';
import { mapLimit } from '../utils/async';
import { CACHE_TTL, cacheDelete, cacheDeleteByPrefix, cacheGetOrSet, cacheSet } from './cache';
import { TrelloClient, TrelloError, type TrelloCredentials } from './client';
import { toCard, toCards } from './normalize';

const CARD_FIELDS =
  'id,name,desc,shortUrl,due,dueComplete,idBoard,idList,idChecklists,labels,dateLastActivity';
const BOARD_FIELDS = 'id,name';
const LIST_FIELDS = 'id,name';
const LABEL_FIELDS = 'id,name,color';
const MAX_CARDS = 1000;

function mergeById<T extends { id: string }>(...groups: T[][]): T[] {
  const map = new Map<string, T>();
  for (const group of groups) {
    for (const item of group) {
      if (!map.has(item.id)) map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

function asCardList(value: unknown): TrelloCardApi[] {
  return Array.isArray(value) ? (value as TrelloCardApi[]) : [];
}

export class TrelloRepository {
  readonly client: TrelloClient;

  constructor(credentials?: () => Promise<TrelloCredentials>, client?: TrelloClient) {
    this.client =
      client ??
      new TrelloClient(
        credentials ??
          (async () => {
            const settings = await getSettings();
            return { key: settings.appKey, token: settings.appToken };
          }),
      );
  }

  private async settings(): Promise<Settings> {
    return getSettings();
  }

  async getBoards(): Promise<TrelloBoard[]> {
    return cacheGetOrSet('boards', CACHE_TTL.boards, async () => {
      const response = await this.client.get<TrelloBoard[]>('/members/me/boards', {
        filter: 'open',
        fields: BOARD_FIELDS,
        limit: MAX_CARDS,
      });
      return (response ?? [])
        .filter((board) => Boolean(board?.id && board?.name))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    });
  }

  async getLists(boardId: string): Promise<TrelloList[]> {
    return cacheGetOrSet(`lists:${boardId}`, CACHE_TTL.boardLists, async () => {
      const response = await this.client.get<TrelloList[]>(`/boards/${boardId}/lists`, {
        filter: 'open',
        fields: LIST_FIELDS,
      });
      return (response ?? []).filter((list) => Boolean(list?.id && list?.name));
    });
  }

  async getBoardCards(boardId: string): Promise<TrelloCard[]> {
    return cacheGetOrSet(`boardcards:${boardId}`, CACHE_TTL.boardCards, async () => {
      const [board, lists, raw] = await Promise.all([
        this.getBoards().then((boards) => boards.find((item) => item.id === boardId) ?? null),
        this.getLists(boardId),
        this.client.get<TrelloCardApi[]>(`/boards/${boardId}/cards`, {
          filter: 'open',
          fields: CARD_FIELDS,
        }),
      ]);
      return this.applyBoardLabels(toCards(asCardList(raw), board, lists));
    });
  }

  async getCard(cardId: string, fresh = false): Promise<TrelloCard> {
    const key = `card:${cardId}`;
    if (fresh) {
      const raw = await this.client.get<TrelloCardApi>(`/cards/${cardId}`, {
        fields: CARD_FIELDS,
        board: 'true',
        list: 'true',
      });
      const [card] = await this.applyBoardLabels([toCard(raw)]);
      return card ?? toCard(raw);
    }
    return cacheGetOrSet(key, 30_000, async () => {
      const raw = await this.client.get<TrelloCardApi>(`/cards/${cardId}`, {
        fields: CARD_FIELDS,
        board: 'true',
        list: 'true',
      });
      const [card] = await this.applyBoardLabels([toCard(raw)]);
      return card ?? toCard(raw);
    });
  }

  /**
   * O endpoint de busca do Trello pode devolver etiquetas sem a cor (ou com
   * dados parciais). A fonte de verdade é o quadro; aqui completamos nome e
   * cor com as etiquetas reais do board para o chip bater com o Trello.
   */
  private async applyBoardLabels(cards: TrelloCard[]): Promise<TrelloCard[]> {
    const boardIds = Array.from(
      new Set(
        cards
          .filter((card) => card.labels.length > 0 && Boolean(card.idBoard))
          .map((card) => card.idBoard),
      ),
    ).slice(0, 25);
    if (boardIds.length === 0) return cards;

    const groups = await mapLimit(boardIds, 4, async (boardId) => {
      try {
        return [boardId, await this.getBoardLabels(boardId)] as const;
      } catch {
        return [boardId, [] as TrelloLabel[]] as const;
      }
    });
    const labelsByBoard = new Map(groups);

    return cards.map((card) => {
      const boardLabels = labelsByBoard.get(card.idBoard);
      if (!boardLabels || boardLabels.length === 0) return card;
      const byId = new Map(boardLabels.map((label) => [label.id, label]));
      let changed = false;
      const labels = card.labels.map((label) => {
        const source = byId.get(label.id);
        if (!source) return label;
        const color = source.color ?? label.color;
        const name = label.name || source.name;
        const idBoard = label.idBoard ?? source.idBoard;
        if (color !== label.color || name !== label.name || idBoard !== label.idBoard) {
          changed = true;
          return { ...label, color, name, idBoard };
        }
        return label;
      });
      return changed ? { ...card, labels } : card;
    });
  }

  private async searchCardsRaw(query: string): Promise<TrelloCardApi[]> {
    return cacheGetOrSet(`search:${query}`, 60_000, async () => {
      const response = await this.client.get<{ cards?: TrelloCardApi[] }>('/search', {
        query,
        modelTypes: 'cards',
        cards_limit: MAX_CARDS,
        card_fields: CARD_FIELDS,
        card_board: 'true',
        card_list: 'true',
        board_fields: BOARD_FIELDS,
        list_fields: LIST_FIELDS,
      });
      return asCardList(response?.cards);
    });
  }

  private async safeSearch(query: string): Promise<TrelloCardApi[]> {
    try {
      return await this.searchCardsRaw(query);
    } catch (error) {
      if (error instanceof TrelloError && (error.code === 'rate_limit' || error.code === 'server')) {
        return [];
      }
      throw error;
    }
  }

  async searchCardsByName(nameQuery: string): Promise<TrelloCard[]> {
    const query = nameQuery.trim();
    if (!query) return [];
    const raw = await this.safeSearch(`name:"${query.replace(/["\\]/g, '')}" is:open`);
    return toCards(raw);
  }

  async getCardsForProcess(processNumber: string): Promise<TrelloCard[]> {
    const process = sanitizeProcessForQuery(processNumber);
    if (!process) return [];

    return cacheGetOrSet(`process:${process}`, CACHE_TTL.processCards, async () => {
      const settings = await this.settings();
      const searched = await this.safeSearch(`description:"SEI ${process}" is:open`);

      let fromDefaultBoard: TrelloCard[] = [];
      if (settings.defaultBoardId) {
        try {
          fromDefaultBoard = (await this.getBoardCards(settings.defaultBoardId)).filter((card) =>
            card.links.includes(process),
          );
        } catch {
          fromDefaultBoard = [];
        }
      }

      const merged = mergeById(toCards(asCardList(searched)), fromDefaultBoard);
      return this.applyBoardLabels(merged.filter((card) => card.links.includes(process)));
    });
  }

  async getAllLinkedCards(): Promise<TrelloCard[]> {
    return cacheGetOrSet('all-linked', CACHE_TTL.allLinkedCards, async () => {
      const settings = await this.settings();
      const searched = await this.safeSearch('description:SEI is:open');

      let fromDefaultBoard: TrelloCard[] = [];
      if (settings.defaultBoardId) {
        try {
          fromDefaultBoard = await this.getBoardCards(settings.defaultBoardId);
        } catch {
          fromDefaultBoard = [];
        }
      }

      const merged = mergeById(toCards(asCardList(searched)), fromDefaultBoard);
      return this.applyBoardLabels(merged.filter((card) => card.links.length > 0));
    });
  }

  async createCard(input: {
    name: string;
    description?: string;
    processNumber?: string;
    processUrl?: string;
    boardId?: string;
    listId?: string;
    start?: string | null;
    due?: string | null;
  }): Promise<TrelloCard> {
    const settings = await this.settings();
    const listId = input.listId || settings.defaultListId;
    if (!listId) {
      throw new TrelloError(
        'not_configured',
        'Escolha um quadro e uma lista antes de criar cartões.',
      );
    }

    const clean = stripLinks(input.description ?? '').trimEnd();
    const linkLine = input.processUrl ? `Processo SEI: ${input.processUrl}` : '';
    const description = [
      clean,
      linkLine,
      input.processNumber ? `SEI ${input.processNumber}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const body: Record<string, string> = {
      name: input.name.trim() || (input.processNumber ? `SEI ${input.processNumber}` : 'Novo cartão'),
      desc: description,
      idList: listId,
      pos: 'bottom',
    };
    if (input.start) body.start = input.start;
    if (input.due) body.due = input.due;

    const raw = await this.client.post<TrelloCardApi>('/cards', body);

    await this.invalidateCardCaches();
    return this.getCard(raw.id, true);
  }

  async updateCard(
    cardId: string,
    patch: {
      name?: string;
      description?: string;
      due?: string | null;
      dueComplete?: boolean;
      idBoard?: string;
      idList?: string;
    },
  ): Promise<TrelloCard> {
    const current = await this.getCard(cardId, true);
    const body: Record<string, string | boolean> = {};

    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new TrelloError('validation', 'O nome do cartão não pode ficar vazio.');
      body.name = name;
    }

    if (patch.description !== undefined) {
      const links = parseLinks(current.desc);
      const clean = stripLinks(patch.description);
      body.desc = [clean, ...links.map((process) => `SEI ${process}`)]
        .filter(Boolean)
        .join('\n');
    }

    if (patch.due !== undefined) body.due = patch.due === null ? 'null' : patch.due;
    if (patch.dueComplete !== undefined) body.dueComplete = patch.dueComplete;
    if (patch.idBoard !== undefined) body.idBoard = patch.idBoard;
    if (patch.idList !== undefined) body.idList = patch.idList;

    if (Object.keys(body).length === 0) return current;

    await this.client.put(`/cards/${cardId}`, body);
    await this.invalidateCardCaches();

    let updated = await this.getCard(cardId, true);
    if (updated.links.length === 0) return updated;

    const event: RuleEvent =
      patch.idList && patch.idList !== current.idList
        ? { kind: 'moved', fromListId: current.idList, toListId: patch.idList }
        : patch.dueComplete === true && !current.dueComplete
          ? { kind: 'completed' }
          : { kind: 'updated' };

    updated = await this.runRules(updated, event);
    return updated;
  }

  /**
   * Aplica as regras em cadeia a um cartão vinculado ao SEI.
   * Nunca roda em cartões sem vínculo. Proteção contra loop: no máximo 5
   * níveis e cada regra roda uma única vez na mesma cadeia.
   */
  private async runRules(card: TrelloCard, event: RuleEvent): Promise<TrelloCard> {
    const { card: result } = await this.executeRules(card, event, new Set<string>(), 0, false);
    return result;
  }

  private async executeRules(
    card: TrelloCard,
    event: RuleEvent,
    applied: Set<string>,
    depth: number,
    force: boolean,
    only?: string,
  ): Promise<{ card: TrelloCard; touched: boolean }> {
    if (depth >= 5) return { card, touched: false };
    if (card.links.length === 0) return { card, touched: false };

    const rules = await getRules();
    let current = card;
    let touched = false;

    for (const rule of rules) {
      if (applied.has(rule.id)) continue;
      if (only && rule.id !== only) continue;
      if (!force && !ruleMatches(rule, event, current)) continue;
      if (force && rule.actions.length === 0) continue;

      applied.add(rule.id);
      const appliedRule = await this.executeRule(current, rule);
      if (!appliedRule.touched) continue;

      touched = true;
      current = appliedRule.card;

      if (appliedRule.moved) {
        const chained = await this.executeRules(
          current,
          { kind: 'moved', fromListId: appliedRule.fromListId, toListId: current.idList },
          applied,
          depth + 1,
          false,
        );
        current = chained.card;
      }
    }

    return { card: current, touched };
  }

  private async executeRule(
    card: TrelloCard,
    rule: Rule,
  ): Promise<{ card: TrelloCard; touched: boolean; moved: boolean; fromListId: string }> {
    const fromListId = card.idList;
    const moveAction = rule.actions.find((action) => action.type === 'moveToList' && action.listId);
    const moveToTop = rule.actions.some((action) => action.type === 'moveToTop');
    const adds = rule.actions.filter(
      (action) => action.type === 'addLabel' && Boolean(action.labelId),
    );
    const removes = rule.actions.filter(
      (action) => action.type === 'removeLabel' && Boolean(action.labelId),
    );

    let touched = false;

    for (const action of adds) {
      if (card.labels.some((label) => label.id === action.labelId)) continue;
      await this.client.post(`/cards/${card.id}/idLabels`, { value: action.labelId });
      touched = true;
    }

    for (const action of removes) {
      if (!card.labels.some((label) => label.id === action.labelId)) continue;
      await this.client.delete(`/cards/${card.id}/idLabels/${action.labelId}`);
      touched = true;
    }

    const targetList = moveAction?.listId ?? card.idList;
    if (moveAction || moveToTop) {
      const body: Record<string, string> = { pos: moveAction ? 'bottom' : 'top' };
      if (moveAction) body.idList = targetList;
      await this.client.put(`/cards/${card.id}`, body);
      touched = true;
    }

    if (!touched) {
      return { card, touched: false, moved: false, fromListId };
    }

    await this.invalidateCardCaches();
    const updated = await this.getCard(card.id, true);
    return {
      card: updated,
      touched: true,
      moved: updated.idList !== fromListId,
      fromListId,
    };
  }

  async applyRuleNow(ruleId: string): Promise<{ applied: number; total: number }> {
    const rules = await getRules();
    const rule = rules.find((item) => item.id === ruleId);
    if (!rule) {
      throw new TrelloError('validation', 'Regra não encontrada.');
    }

    const cards = await this.getAllLinkedCards();
    let applied = 0;
    for (const card of cards) {
      try {
        const result = await this.executeRules(
          card,
          { kind: 'updated', toListId: card.idList },
          new Set<string>(),
          0,
          true,
          rule.id,
        );
        if (result.touched) applied += 1;
      } catch {
        // Uma falha isolada não interrompe a aplicação nas demais cartões.
      }
    }
    await this.invalidateCardCaches();
    return { applied, total: cards.length };
  }

  async deleteCard(cardId: string): Promise<void> {
    await this.client.delete(`/cards/${cardId}`);
    await this.invalidateCardCaches();
  }

  async linkCards(cardIds: string[], processNumber: string): Promise<BulkLinkResult[]> {
    const unique = Array.from(new Set(cardIds.filter(Boolean)));
    const results = await mapLimit(unique, 2, async (cardId) => {
      try {
        const current = await this.getCard(cardId, true);
        if (hasLink(current.desc, processNumber)) {
          return { cardId, status: 'already' as const, card: current };
        }
        await this.client.put(`/cards/${cardId}`, {
          desc: addLink(current.desc, processNumber),
        });
        const card = await this.getCard(cardId, true);
        return { cardId, status: 'linked' as const, card };
      } catch (error) {
        return {
          cardId,
          status: 'error' as const,
          message: error instanceof Error ? error.message : 'Falha ao vincular o cartão.',
        };
      }
    });

    await this.invalidateCardCaches();
    return results;
  }

  async linkCardsToProcesses(
    cardIds: string[],
    processNumbers: string[],
  ): Promise<BulkLinkResult[]> {
    const processes = Array.from(
      new Set(
        processNumbers
          .map((process) => normalizeProcessNumber(process))
          .filter((process): process is string => Boolean(process)),
      ),
    );
    if (processes.length === 0) {
      throw new TrelloError('validation', 'Informe pelo menos um número de processo válido.');
    }

    const unique = Array.from(new Set(cardIds.filter(Boolean)));
    const results = await mapLimit(unique, 2, async (cardId) => {
      try {
        const current = await this.getCard(cardId, true);
        const existing = parseLinks(current.desc);
        const newLinks = processes.filter((processNumber) => !existing.includes(processNumber));
        if (newLinks.length === 0) {
          return { cardId, status: 'already' as const, card: current };
        }
        const links = [...newLinks, ...existing];
        const description = stripLinks(current.desc);
        const desc = [description, ...links.map((process) => `SEI ${process}`)]
          .filter(Boolean)
          .join('\n');
        await this.client.put(`/cards/${cardId}`, { desc });
        const card = await this.getCard(cardId, true);
        return { cardId, status: 'linked' as const, card };
      } catch (error) {
        return {
          cardId,
          status: 'error' as const,
          message: error instanceof Error ? error.message : 'Falha ao vincular o cartão.',
        };
      }
    });

    await this.invalidateCardCaches();
    return results;
  }

  async unlinkCard(cardId: string, processNumber: string): Promise<TrelloCard> {
    const current = await this.getCard(cardId, true);
    if (!hasLink(current.desc, processNumber)) return current;
    await this.client.put(`/cards/${cardId}`, {
      desc: removeLink(current.desc, processNumber),
    });
    await this.invalidateCardCaches();
    return this.getCard(cardId, true);
  }

  async getBoardLabels(boardId: string, fresh = false): Promise<TrelloLabel[]> {
    const load = async () => {
      const labels = await this.client.get<TrelloLabel[]>(`/boards/${boardId}/labels`, {
        fields: LABEL_FIELDS,
        limit: MAX_CARDS,
      });
      return (labels ?? []).filter((label) => Boolean(label?.id));
    };

    if (fresh) {
      const labels = await load();
      await cacheSet(`labels:${boardId}`, labels);
      return labels;
    }

    return cacheGetOrSet(`labels:${boardId}`, CACHE_TTL.boardLabels, load);
  }

  async createLabel(boardId: string, name: string, color: string): Promise<TrelloLabel> {
    const label = await this.client.post<TrelloLabel>('/labels', {
      idBoard: boardId,
      name: name.trim(),
      color,
    });
    await cacheDelete(`labels:${boardId}`);
    return label;
  }

  async addLabelToCard(cardId: string, labelId: string): Promise<TrelloCard> {
    await this.client.post(`/cards/${cardId}/idLabels`, { value: labelId });
    await this.invalidateCardCaches();
    return this.getCard(cardId, true);
  }

  async removeLabelFromCard(cardId: string, labelId: string): Promise<TrelloCard> {
    await this.client.delete(`/cards/${cardId}/idLabels/${labelId}`);
    await this.invalidateCardCaches();
    return this.getCard(cardId, true);
  }

  async getChecklists(cardId: string, fresh = false): Promise<TrelloChecklist[]> {
    const key = `checklists:${cardId}`;
    const load = async () => {
      const checklists = await this.client.get<TrelloChecklist[]>(`/cards/${cardId}/checklists`, {
        fields: 'id,name,idCard',
        checkItems: 'all',
        checkItem_fields: 'id,name,state,pos',
      });
      return (checklists ?? []).map((checklist) => ({
        ...checklist,
        checkItems: Array.isArray(checklist.checkItems) ? checklist.checkItems : [],
      }));
    };
    if (fresh) {
      const value = await load();
      await cacheDeleteByPrefix(key);
      return value;
    }
    return cacheGetOrSet(key, 30_000, load);
  }

  async createChecklist(cardId: string, name: string): Promise<TrelloChecklist[]> {
    await this.client.post('/checklists', {
      idCard: cardId,
      name: name.trim() || 'Checklist',
      pos: 'bottom',
    });
    await this.invalidateCardCaches();
    return this.getChecklists(cardId, true);
  }

  async addCheckItem(checklistId: string, name: string): Promise<TrelloChecklistItem> {
    const item = await this.client.post<TrelloChecklistItem>(`/checklists/${checklistId}/checkItems`, {
      name: name.trim(),
      pos: 'bottom',
    });
    await this.invalidateCardCaches();
    return item;
  }

  async updateCheckItem(
    cardId: string,
    checkItemId: string,
    state: 'complete' | 'incomplete',
  ): Promise<void> {
    await this.client.put(`/cards/${cardId}/checkItem/${checkItemId}`, { state });
    await this.invalidateCardCaches();
  }

  async deleteCheckItem(checklistId: string, checkItemId: string): Promise<void> {
    await this.client.delete(`/checklists/${checklistId}/checkItems/${checkItemId}`);
    await this.invalidateCardCaches();
  }

  async deleteChecklist(checklistId: string): Promise<void> {
    await this.client.delete(`/checklists/${checklistId}`);
    await this.invalidateCardCaches();
  }

  async testConnection(): Promise<ConnectionInfo> {
    const me = await this.client.get<{ id: string; username: string; fullName?: string }>('/members/me', {
      fields: 'id,username,fullName',
    });
    const boards = await this.getBoards();
    return {
      id: me.id,
      username: me.username,
      fullName: me.fullName ?? me.username,
      boardCount: boards.length,
    };
  }

  private async invalidateCardCaches(): Promise<void> {
    await Promise.all([
      cacheDeleteByPrefix('card:'),
      cacheDeleteByPrefix('process:'),
      cacheDeleteByPrefix('all-linked'),
      cacheDeleteByPrefix('boardcards:'),
      cacheDeleteByPrefix('search:'),
      cacheDeleteByPrefix('checklists:'),
    ]);
  }
}
