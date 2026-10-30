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
import { addLink, hasLink, parseLinks, removeLink, renderLinks, stripLinks } from '../link/marker';
import { findProcessNumbers, snippetFor, type LinkCandidate } from '../link/scan';
import { getRules } from '../storage/rules';
import {
  forgetCards,
  getSyncSnapshot,
  mergeSyncSnapshot,
  replaceSyncSnapshot,
  type CardSnapshot,
} from '../storage/sync';
import { ruleAppliesNow, ruleMatches, ruleIssue, ruleRunCardCount, ruleWouldChange, type Rule, type RuleEvent, type RuleRunLabel, type RuleRunMove } from '../domain/rules';
import { dropLastRuleRun, getLastRuleRun, pushRuleRun } from '../storage/rule-runs';
import { recordRuleApplications } from '../storage/rule-stats';
import { pushRuleLog, type RuleLogEntry } from '../storage/rule-log';
import { getSettings } from '../storage/settings';
import { getProcessCatalog } from '../storage/processes';
import { mapLimit } from '../utils/async';
import { CACHE_TTL, cacheDelete, cacheDeleteByPrefix, cacheGet, cacheGetOrSet, cacheSet } from './cache';
import { TrelloClient, TrelloError, type TrelloCredentials } from './client';
import { toCard, toCards } from './normalize';

const CARD_FIELDS =
  'id,name,desc,shortUrl,due,dueComplete,idBoard,idList,idChecklists,labels,dateLastActivity';
const BOARD_FIELDS = 'id,name';
const LIST_FIELDS = 'id,name,pos';
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

  async getBoards(fresh = false): Promise<TrelloBoard[]> {
    const load = async () => {
      const response = await this.client.get<TrelloBoard[]>('/members/me/boards', {
        filter: 'open',
        fields: BOARD_FIELDS,
        limit: MAX_CARDS,
      });
      return (response ?? [])
        .filter((board) => Boolean(board?.id && board?.name))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    };
    if (fresh) {
      const boards = await load();
      await cacheSet('boards', boards);
      return boards;
    }
    return cacheGetOrSet('boards', CACHE_TTL.boards, load);
  }

  async getLists(boardId: string, fresh = false): Promise<TrelloList[]> {
    const load = async () => {
      const response = await this.client.get<TrelloList[]>(`/boards/${boardId}/lists`, {
        filter: 'open',
        fields: LIST_FIELDS,
      });
      return (response ?? [])
        .filter((list) => Boolean(list?.id && list?.name))
        .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
    };
    if (fresh) {
      try {
        const lists = await load();
        await cacheSet(`lists:${boardId}`, lists);
        return lists;
      } catch (error) {
        const cached = await cacheGet<TrelloList[]>(`lists:${boardId}`, Number.POSITIVE_INFINITY);
        if (cached) return cached;
        throw error;
      }
    }
    return cacheGetOrSet(`lists:${boardId}`, CACHE_TTL.boardLists, load);
  }

  async getBoardCards(boardId: string, fresh = false): Promise<TrelloCard[]> {
    const load = async () => {
      const [board, lists, raw] = await Promise.all([
        this.getBoards().then((boards) => boards.find((item) => item.id === boardId) ?? null),
        this.getLists(boardId),
        this.client.get<TrelloCardApi[]>(`/boards/${boardId}/cards`, {
          filter: 'open',
          fields: CARD_FIELDS,
        }),
      ]);
      return this.applyBoardLabels(toCards(asCardList(raw), board, lists));
    };

    if (fresh) {
      try {
        const cards = await load();
        await cacheSet(`boardcards:${boardId}`, cards);
        return cards;
      } catch (error) {
        const cached = await cacheGet<TrelloCard[]>(
          `boardcards:${boardId}`,
          Number.POSITIVE_INFINITY,
        );
        if (cached) return cached;
        throw error;
      }
    }

    return cacheGetOrSet(`boardcards:${boardId}`, CACHE_TTL.boardCards, load);
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

  /**
   * Procura cartões sem vínculo cujo comentário tenha um número de processo SEI.
   * Não altera nada: apenas devolve os candidatos para confirmação do usuário.
   */
  async findUnlinkedCandidates(boardId: string): Promise<LinkCandidate[]> {
    const cards = await this.getBoardCards(boardId, true);
    const candidates: LinkCandidate[] = [];

    for (const card of cards) {
      if (card.links.length > 0) continue;
      for (const processNumber of findProcessNumbers(card.description)) {
        candidates.push({
          cardId: card.id,
          cardName: card.name,
          processNumber,
          snippet: snippetFor(card.description, processNumber),
        });
      }
    }

    return candidates.sort(
      (a, b) =>
        a.cardName.localeCompare(b.cardName, 'pt-BR') ||
        a.processNumber.localeCompare(b.processNumber, 'pt-BR'),
    );
  }

  async getCardsForProcess(processNumber: string, fresh = false): Promise<TrelloCard[]> {
    const process = sanitizeProcessForQuery(processNumber);
    if (!process) return [];

    const load = async () => {
      const settings = await this.settings();
      const searched = await this.safeSearch(`description:"SEI ${process}" is:open`);

      let fromDefaultBoard: TrelloCard[] = [];
      if (settings.defaultBoardId) {
        try {
          fromDefaultBoard = (await this.getBoardCards(settings.defaultBoardId, fresh)).filter(
            (card) => card.links.includes(process),
          );
        } catch {
          fromDefaultBoard = [];
        }
      }

      const merged = mergeById(fromDefaultBoard, toCards(asCardList(searched)));
      return this.applyBoardLabels(merged.filter((card) => card.links.includes(process)));
    };

    if (fresh) {
      try {
        const cards = await load();
        await this.refreshBoardLabels(cards);
        const synced = await this.reconcile(cards, false);
        await cacheSet(`process:${process}`, synced);
        return synced;
      } catch (error) {
        const cached = await cacheGet<TrelloCard[]>(`process:${process}`, Number.POSITIVE_INFINITY);
        if (cached) return cached;
        throw error;
      }
    }

    return cacheGetOrSet(`process:${process}`, CACHE_TTL.processCards, load);
  }

  async getAllLinkedCards(fresh = false): Promise<TrelloCard[]> {
    const load = async () => {
      const settings = await this.settings();
      const searched = await this.safeSearch('description:SEI is:open');

      let fromDefaultBoard: TrelloCard[] = [];
      if (settings.defaultBoardId) {
        try {
          fromDefaultBoard = await this.getBoardCards(settings.defaultBoardId, fresh);
        } catch {
          fromDefaultBoard = [];
        }
      }

      const merged = mergeById(fromDefaultBoard, toCards(asCardList(searched)));
      return this.applyBoardLabels(merged.filter((card) => card.links.length > 0));
    };

    if (fresh) {
      try {
        const cards = await load();
        await this.refreshBoardLabels(cards);
        const synced = await this.reconcile(cards);
        await cacheSet('all-linked', synced);
        return synced;
      } catch (error) {
        const cached = await cacheGet<TrelloCard[]>('all-linked', Number.POSITIVE_INFINITY);
        if (cached) return cached;
        throw error;
      }
    }

    return cacheGetOrSet('all-linked', CACHE_TTL.allLinkedCards, load);
  }

  /**
   * Relê as etiquetas dos quadros envolvidos para refletir nomes e cores
   * alterados diretamente no Trello.
   */
  private async refreshBoardLabels(cards: TrelloCard[]): Promise<void> {
    const boardIds = Array.from(
      new Set(cards.map((card) => card.idBoard).filter((id): id is string => Boolean(id))),
    ).slice(0, 10);
    if (boardIds.length === 0) return;
    await mapLimit(boardIds, 3, async (boardId) => {
      try {
        await this.getBoardLabels(boardId, true);
      } catch {
        // mantém o cache atual se o quadro falhar
      }
    });
  }

  async createCard(input: {
    name: string;
    description?: string;
    processNumber?: string;
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

    const description = input.processNumber
      ? addLink(input.description ?? '', input.processNumber)
      : stripLinks(input.description ?? '');

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
    let created = await this.getCard(raw.id, true);
    await mergeSyncSnapshot([created]);

    // Criar um cartão em uma lista conta como "entrar na lista" para as regras.
    if (created.links.length > 0) {
      created = await this.runRules(created, {
        kind: 'moved',
        fromListId: null,
        toListId: created.idList,
      });
      await mergeSyncSnapshot([created]);
    }

    return created;
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
      body.desc = renderLinks(patch.description, links);
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

    let event: RuleEvent | null = null;
    if (patch.idList && patch.idList !== current.idList) {
      event = { kind: 'moved', fromListId: current.idList, toListId: patch.idList };
    } else if (patch.dueComplete === true && !current.dueComplete) {
      event = { kind: 'completed' };
    }

    if (event) updated = await this.runRules(updated, event);
    await mergeSyncSnapshot([updated]);
    return updated;
  }

  /**
   * Compara o estado atual do Trello com o último estado conhecido e dispara
   * as regras para mudanças feitas fora da extensão (site/app do Trello).
   */
  private async reconcile(cards: TrelloCard[], replace = true): Promise<TrelloCard[]> {
    const snapshot = await getSyncSnapshot();
    const result: TrelloCard[] = [];

    for (const card of cards) {
      const previous = snapshot[card.id];
      if (!previous) {
        result.push(card);
        continue;
      }
      result.push(await this.applyRemoteEvents(card, previous));
    }

    if (replace) await replaceSyncSnapshot(result);
    else await mergeSyncSnapshot(result);
    return result;
  }

  private async applyRemoteEvents(
    card: TrelloCard,
    previous: CardSnapshot,
  ): Promise<TrelloCard> {
    if (card.links.length === 0) return card;

    const events: RuleEvent[] = [];
    if (previous.idList !== card.idList) {
      events.push({ kind: 'moved', fromListId: previous.idList, toListId: card.idList });
    }
    if (!previous.dueComplete && card.dueComplete) {
      events.push({ kind: 'completed' });
    }

    if (events.length === 0) return card;

    let current = card;
    const applied = new Set<string>();
    const counts = new Map<string, number>();
    const log: RuleLogEntry[] = [];
    for (const event of events) {
      const state = await this.executeRules(
        current,
        event,
        applied,
        0,
        false,
        undefined,
        counts,
        log,
      );
      current = state.card;
    }
    await recordRuleApplications(counts, 'auto');
    await pushRuleLog(log);
    return current;
  }

  /**
   * Aplica as regras em cadeia a um cartão vinculado ao SEI.
   * Nunca roda em cartões sem vínculo. Proteção contra loop: no máximo 5
   * níveis e cada regra roda uma única vez na mesma cadeia.
   */
  private async runRules(card: TrelloCard, event: RuleEvent): Promise<TrelloCard> {
    const counts = new Map<string, number>();
    const log: RuleLogEntry[] = [];
    const { card: result } = await this.executeRules(
      card,
      event,
      new Set<string>(),
      0,
      false,
      undefined,
      counts,
      log,
    );
    await recordRuleApplications(counts, 'auto');
    await pushRuleLog(log);
    return result;
  }

  private async executeRules(
    card: TrelloCard,
    event: RuleEvent,
    applied: Set<string>,
    depth: number,
    force: boolean,
    only?: string,
    counts?: Map<string, number>,
    log?: RuleLogEntry[],
  ): Promise<{ card: TrelloCard; touched: boolean }> {
    if (depth >= 5) return { card, touched: false };
    if (card.links.length === 0) return { card, touched: false };

    const rules = await getRules();
    let current = card;
    let touched = false;

    for (const rule of rules) {
      if (applied.has(rule.id)) continue;
      if (!rule.boardId || card.idBoard !== rule.boardId) continue;
      if (only && rule.id !== only) continue;
      if (!force && !ruleMatches(rule, event, current)) continue;
      if (force && rule.actions.length === 0) continue;

      applied.add(rule.id);
      const appliedRule = await this.executeRule(current, rule);
      if (!appliedRule.touched) continue;

      touched = true;
      current = appliedRule.card;
      if (counts) counts.set(rule.id, (counts.get(rule.id) ?? 0) + 1);
      if (log) {
        log.push({
          at: Date.now(),
          ruleId: rule.id,
          ruleName: rule.name,
          cardId: current.id,
          cardName: current.name,
          source: force ? 'manual' : 'auto',
          actions: appliedRule.actions,
        });
      }

      if (appliedRule.moved) {
        const chained = await this.executeRules(
          current,
          { kind: 'moved', fromListId: appliedRule.fromListId, toListId: current.idList },
          applied,
          depth + 1,
          false,
          undefined,
          counts,
          log,
        );
        current = chained.card;
      }
    }

    return { card: current, touched };
  }

  private async executeRule(
    card: TrelloCard,
    rule: Rule,
  ): Promise<{
    card: TrelloCard;
    touched: boolean;
    moved: boolean;
    fromListId: string;
    actions: string[];
  }> {
    const fromListId = card.idList;
    const moveCandidate = rule.actions.find(
      (action) => action.type === 'moveToList' && action.listId,
    );
    let targetListId = moveCandidate?.listId;
    let boardLists: Array<{ id: string; name: string }> | null = null;
    if (targetListId) {
      // Nunca move para uma lista de outro quadro: a regra é presa ao quadro dela.
      boardLists = await this.getLists(rule.boardId).catch(() => null);
      if (
        !Array.isArray(boardLists) ||
        !boardLists.some((list) => list.id === targetListId)
      ) {
        targetListId = undefined;
      }
    }
    const moveToTop = rule.actions.some((action) => action.type === 'moveToTop');
    const adds = rule.actions.filter(
      (action) => action.type === 'addLabel' && Boolean(action.labelId),
    );
    const removes = rule.actions.filter(
      (action) => action.type === 'removeLabel' && Boolean(action.labelId),
    );

    let touched = false;
    const actions: string[] = [];

    for (const action of adds) {
      if (card.labels.some((label) => label.id === action.labelId)) continue;
      await this.client.post(`/cards/${card.id}/idLabels`, { value: action.labelId });
      touched = true;
      actions.push(`Adicionar etiqueta${action.labelName ? ` "${action.labelName}"` : ''}`);
    }

    for (const action of removes) {
      if (!card.labels.some((label) => label.id === action.labelId)) continue;
      await this.client.delete(`/cards/${card.id}/idLabels/${action.labelId}`);
      touched = true;
      actions.push(`Remover etiqueta${action.labelName ? ` "${action.labelName}"` : ''}`);
    }

    const shouldMoveList = Boolean(targetListId && targetListId !== card.idList);
    if (shouldMoveList || moveToTop) {
      const body: Record<string, string> = { pos: shouldMoveList ? 'bottom' : 'top' };
      if (shouldMoveList && targetListId) body.idList = targetListId;
      await this.client.put(`/cards/${card.id}`, body);
      touched = true;
      if (shouldMoveList) {
        const listName =
          boardLists?.find((list) => list.id === targetListId)?.name ?? 'lista';
        actions.push(`Mover para a lista "${listName}"`);
      } else {
        actions.push('Mover para o topo');
      }
    }

    if (!touched) {
      return { card, touched: false, moved: false, fromListId, actions: [] };
    }

    await this.invalidateCardCaches();
    const updated = await this.getCard(card.id, true);
    return {
      card: updated,
      touched: true,
      moved: updated.idList !== fromListId,
      fromListId,
      actions,
    };
  }

  async applyRuleNow(
    ruleId: string,
    dryRun = false,
  ): Promise<{ applied: number; total: number }> {
    const rules = await getRules();
    const rule = rules.find((item) => item.id === ruleId);
    if (!rule) {
      throw new TrelloError('validation', 'Regra não encontrada.');
    }
    if (ruleIssue(rule)) {
      throw new TrelloError('validation', ruleIssue(rule) ?? 'Regra incompleta.');
    }

    const cards = await this.getAllLinkedCards();
    const catalog = await getProcessCatalog();
    // Só entram cartões do quadro da regra e que ainda mudariam algo.
    const scoped = cards.filter(
      (card) => card.links.length > 0 && card.idBoard === rule.boardId,
    );
    const matching = scoped.filter(
      (card) =>
        ruleAppliesNow(rule, card, {
          seiUnread: card.links.some((link) => Boolean(catalog[link]?.unread)),
        }) && ruleWouldChange(rule, card),
    );
    if (dryRun) {
      return { applied: matching.length, total: scoped.length };
    }

    let applied = 0;
    const touched: TrelloCard[] = [];
    const moves: RuleRunMove[] = [];
    const labels: RuleRunLabel[] = [];
    const counts = new Map<string, number>();
    const log: RuleLogEntry[] = [];

    for (const card of matching) {
      const beforeListId = card.idList;
      const beforeLabels = new Set(card.labels.map((label) => label.id));
      try {
        const result = await this.executeRules(
          card,
          { kind: 'seiUpdated' },
          new Set<string>(),
          0,
          true,
          rule.id,
          counts,
          log,
        );
        if (!result.touched) continue;

        applied += 1;
        touched.push(result.card);
        this.collectRuleRunDiff(card.name, beforeListId, beforeLabels, result.card, moves, labels);
      } catch {
        // Uma falha isolada não interrompe a aplicação nas demais cartões.
      }
    }

    await this.invalidateCardCaches();
    if (touched.length > 0) await mergeSyncSnapshot(touched);
    await recordRuleApplications(counts, 'manual');
    await pushRuleLog(log);

    if (moves.length > 0 || labels.length > 0) {
      await pushRuleRun({
        id: `run_${Date.now().toString(36)}`,
        at: Date.now(),
        ruleId: rule.id,
        ruleName: rule.name,
        moves,
        labels,
      });
    }

    return { applied, total: scoped.length };
  }

  /**
   * Dispara as regras de "processo SEI atualizado" quando a lista do SEI
   * detecta novidade. Vale para todos os cartões vinculados ao processo,
   * desde que estejam no quadro da regra.
   */
  async applySeiUpdateRules(processNumbers: string[]): Promise<{ applied: number }> {
    const processes = new Set(
      processNumbers
        .map((number) => normalizeProcessNumber(number))
        .filter((number): number is string => Boolean(number)),
    );
    if (processes.size === 0) return { applied: 0 };

    const cards = await this.getAllLinkedCards();
    const relevant = cards.filter((card) =>
      card.links.some((link) => processes.has(link)),
    );
    if (relevant.length === 0) return { applied: 0 };

    let applied = 0;
    const touched: TrelloCard[] = [];
    const counts = new Map<string, number>();
    const log: RuleLogEntry[] = [];

    for (const card of relevant) {
      try {
        const result = await this.executeRules(
          card,
          { kind: 'seiUpdated' },
          new Set<string>(),
          0,
          false,
          undefined,
          counts,
          log,
        );
        if (result.touched) {
          applied += 1;
          touched.push(result.card);
        }
      } catch {
        // Uma falha isolada não interrompe as demais cartões.
      }
    }

    await this.invalidateCardCaches();
    if (touched.length > 0) await mergeSyncSnapshot(touched);
    await recordRuleApplications(counts, 'auto');
    await pushRuleLog(log);
    return { applied };
  }

  private collectRuleRunDiff(
    cardName: string,
    beforeListId: string,
    beforeLabels: Set<string>,
    after: TrelloCard,
    moves: RuleRunMove[],
    labels: RuleRunLabel[],
  ): void {
    if (after.idList !== beforeListId) {
      moves.push({
        cardId: after.id,
        cardName,
        fromListId: beforeListId,
        toListId: after.idList,
      });
    }

    const afterLabels = new Set(after.labels.map((label) => label.id));
    for (const label of afterLabels) {
      if (!beforeLabels.has(label)) {
        labels.push({ cardId: after.id, cardName, labelId: label, added: true });
      }
    }
    for (const label of beforeLabels) {
      if (!afterLabels.has(label)) {
        labels.push({ cardId: after.id, cardName, labelId: label, added: false });
      }
    }
  }

  /**
   * Desfaz a última aplicação manual ("Aplicar agora"): devolve cada cartão à
   * lista de origem e reverte as etiquetas adicionadas/removidas.
   * Cartões que mudaram de lista depois da aplicação são preservados.
   */
  async undoLastRuleRun(): Promise<{ reverted: number; total: number; cards: number }> {
    const run = await getLastRuleRun();
    if (!run) {
      throw new TrelloError('validation', 'Nenhuma aplicação em massa para desfazer.');
    }

    const touched: TrelloCard[] = [];
    let reverted = 0;

    for (const move of run.moves) {
      try {
        const card = await this.getCard(move.cardId, true);
        if (card.links.length === 0) continue;
        if (card.idList !== move.toListId) continue;
        await this.client.put(`/cards/${card.id}`, { idList: move.fromListId });
        touched.push(await this.getCard(card.id, true));
        reverted += 1;
      } catch {
        // lista de origem removida ou cartão apagado: mantém como está
      }
    }

    for (const change of run.labels) {
      try {
        const card = await this.getCard(change.cardId, true);
        if (card.links.length === 0) continue;
        const has = card.labels.some((label) => label.id === change.labelId);
        if (change.added === has) continue;
        if (change.added) {
          await this.client.delete(`/cards/${card.id}/idLabels/${change.labelId}`);
        } else {
          await this.client.post(`/cards/${card.id}/idLabels`, { value: change.labelId });
        }
        touched.push(await this.getCard(card.id, true));
        reverted += 1;
      } catch {
        // etiqueta removida ou cartão apagado: mantém como está
      }
    }

    await this.invalidateCardCaches();
    if (touched.length > 0) await mergeSyncSnapshot(touched);
    await dropLastRuleRun();

    return {
      reverted,
      total: run.moves.length + run.labels.length,
      cards: ruleRunCardCount(run),
    };
  }

  async deleteCard(cardId: string): Promise<void> {
    await this.client.delete(`/cards/${cardId}`);
    await this.invalidateCardCaches();
    await forgetCards([cardId]);
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
    await mergeSyncSnapshot(
      results.map((result) => result.card).filter((card): card is TrelloCard => Boolean(card)),
    );
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
        const desc = renderLinks(current.desc, links);
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
    await mergeSyncSnapshot(
      results.map((result) => result.card).filter((card): card is TrelloCard => Boolean(card)),
    );
    return results;
  }

  async unlinkCard(cardId: string, processNumber: string): Promise<TrelloCard> {
    const current = await this.getCard(cardId, true);
    if (!hasLink(current.desc, processNumber)) return current;
    await this.client.put(`/cards/${cardId}`, {
      desc: removeLink(current.desc, processNumber),
    });
    await this.invalidateCardCaches();
    const updated = await this.getCard(cardId, true);
    await mergeSyncSnapshot([updated]);
    return updated;
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
    const card = await this.getCard(cardId, true);
    await mergeSyncSnapshot([card]);
    return card;
  }

  async removeLabelFromCard(cardId: string, labelId: string): Promise<TrelloCard> {
    await this.client.delete(`/cards/${cardId}/idLabels/${labelId}`);
    await this.invalidateCardCaches();
    const card = await this.getCard(cardId, true);
    await mergeSyncSnapshot([card]);
    return card;
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
