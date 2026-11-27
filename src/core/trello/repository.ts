import type {
  BulkLinkResult,
  ConnectionInfo,
  Settings,
  TrelloAttachment,
  TrelloBoard,
  TrelloCard,
  TrelloCardApi,
  TrelloChecklist,
  TrelloChecklistItem,
  TrelloComment,
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
import {
  renderRuleComment,
  ruleAppliesNow,
  ruleDate,
  ruleDateLabel,
  ruleDateMatches,
  ruleIssue,
  ruleMatches,
  ruleRunCardCount,
  ruleRunChangeCount,
  ruleWouldChange,
  type Rule,
  type RuleEvent,
  type RuleRunComment,
  type RuleRunComplete,
  type RuleRunDate,
  type RuleRunLabel,
  type RuleRunMove,
} from '../domain/rules';
import { dropLastRuleRun, getLastRuleRun, pushRuleRun } from '../storage/rule-runs';
import { recordRuleApplications } from '../storage/rule-stats';
import { pushRuleLog, type RuleLogEntry } from '../storage/rule-log';
import { getSettings } from '../storage/settings';
import { getProcessCatalog } from '../storage/processes';
import { listChecklistTemplates } from '../storage/checklist-templates';
import {
  addMirror,
  getMirrorGroup,
  listMirrorGroups,
  removeMirrorCard,
  removeMirrorGroup,
  type MirrorGroup,
} from '../storage/mirrors';
import { mapLimit } from '../utils/async';
import { isConfigBoardName } from '../sync/config';
import { CACHE_TTL, cacheDelete, cacheDeleteByPrefix, cacheGet, cacheGetOrSet, cacheSet } from './cache';
import { TrelloClient, TrelloError, type TrelloCredentials } from './client';
import { toCard, toCards } from './normalize';

const CARD_FIELDS =
  'id,name,desc,shortUrl,start,due,dueComplete,idBoard,idList,idChecklists,labels,dateLastActivity,badges';
const BOARD_FIELDS = 'id,name';
const LIST_FIELDS = 'id,name,pos';
const LABEL_FIELDS = 'id,name,color';
const ATTACHMENT_FIELDS = 'id,name,url,bytes,date,mimeType,isUpload';
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
        .filter((board) => !isConfigBoardName(board.name))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    };
    if (fresh) {
      const boards = await load();
      await cacheSet('boards', boards);
      return boards;
    }
    return cacheGetOrSet('boards', CACHE_TTL.boards, load);
  }

  async createBoard(name: string): Promise<TrelloBoard> {
    const board = await this.client.post<TrelloBoard>('/boards', {
      name: name.trim(),
      prefs_permissionLevel: 'private',
      defaultLists: true,
    });
    await cacheDelete('boards');
    await cacheDelete('all-linked');
    return board;
  }

  async renameBoard(boardId: string, name: string): Promise<TrelloBoard> {
    const board = await this.client.put<TrelloBoard>(`/boards/${boardId}`, {
      name: name.trim(),
    });
    await cacheDelete('boards');
    return board;
  }

  async createList(boardId: string, name: string): Promise<TrelloList> {
    const list = await this.client.post<TrelloList>(`/boards/${boardId}/lists`, {
      name: name.trim(),
      pos: 'bottom',
    });
    await cacheDelete(`lists:${boardId}`);
    await cacheDeleteByPrefix('boardcards:');
    return list;
  }

  async renameList(boardId: string, listId: string, name: string): Promise<TrelloList> {
    const list = await this.client.put<TrelloList>(`/lists/${listId}`, {
      name: name.trim(),
    });
    await cacheDelete(`lists:${boardId}`);
    await cacheDeleteByPrefix('boardcards:');
    return list;
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

  async updateListPosition(listId: string, pos: number): Promise<TrelloList> {
    const response = await this.client.put<{
      id: string;
      name: string;
      pos?: number;
    }>(`/lists/${listId}`, { pos });
    await cacheDeleteByPrefix('lists:');
    await cacheDeleteByPrefix('boardcards:');
    return {
      id: response?.id ?? listId,
      name: response?.name ?? '',
      pos: response?.pos ?? pos,
    };
  }

  async getBoardCards(boardId: string, fresh = false): Promise<TrelloCard[]> {
    const load = async () => {
      const [board, lists, raw] = await Promise.all([
        this.getBoards().then((boards) => boards.find((item) => item.id === boardId) ?? null),
        this.getLists(boardId, fresh),
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
        // O painel abre o quadro por este caminho (filtro "Sem vínculo").
        // Reconciliar aqui faz as regras reagirem a mudanças feitas no Trello.
        const synced = await this.reconcile(cards, false);
        await cacheSet(`boardcards:${boardId}`, synced);
        return synced;
      } catch (error) {
        const cached = await cacheGet<TrelloCard[]>(`boardcards:${boardId}`, Number.POSITIVE_INFINITY);
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
        cards.filter((card) => card.labels.length > 0 && Boolean(card.idBoard)).map((card) => card.idBoard),
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
      // Busca e cartões do quadro em paralelo: o painel do processo abre mais rápido.
      const [searched, fromDefaultBoard] = await Promise.all([
        this.safeSearch(`description:"SEI ${process}" is:open`),
        settings.defaultBoardId
          ? this.getBoardCards(settings.defaultBoardId, fresh).catch(() => [] as TrelloCard[])
          : Promise.resolve([] as TrelloCard[]),
      ]);

      const merged = mergeById(
        fromDefaultBoard.filter((card) => card.links.includes(process)),
        toCards(asCardList(searched)),
      );
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

  /** Leitura instantânea do cache, sem chamar o Trello. */
  async getCachedCardsForProcess(processNumber: string): Promise<TrelloCard[] | null> {
    const process = sanitizeProcessForQuery(processNumber);
    if (!process) return null;
    const direct = await cacheGet<TrelloCard[]>(`process:${process}`, Number.POSITIVE_INFINITY);
    // A busca do Trello pode demorar para indexar quadros secundários. Se o
    // dashboard já carregou o quadro, aproveita os cartões do cache na hora.
    const fromBoards: TrelloCard[] = [];
    const boards = await cacheGet<TrelloBoard[]>('boards', Number.POSITIVE_INFINITY);
    for (const board of boards ?? []) {
      const cards = await cacheGet<TrelloCard[]>(`boardcards:${board.id}`, 10 * 60_000);
      if (!cards) continue;
      for (const card of cards) {
        if (card.links.includes(process)) fromBoards.push(card);
      }
    }
    if (!direct && fromBoards.length === 0) return null;
    if (fromBoards.length === 0) return direct;
    return mergeById(direct ?? [], fromBoards);
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
        const synced = await this.reconcile(cards, false);
        await cacheSet('all-linked', synced);
        // Regras que aceitam cartões sem vínculo precisam ver o quadro inteiro.
        await this.syncUnlinkedRuleBoards();
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
        // Usa o cache (TTL de 10 min). Forçar a busca de etiquetas em todos os
        // quadros a cada abertura do processo deixava o painel lento.
        await this.getBoardLabels(boardId);
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
      throw new TrelloError('not_configured', 'Escolha um quadro e uma lista antes de criar cartões.');
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

    // Criar um cartão em uma lista conta como "criar" e "entrar na lista" para as regras.
    created = await this.runRules(created, {
      kind: 'created',
      fromListId: null,
      toListId: created.idList,
    });
    await mergeSyncSnapshot([created]);

    return created;
  }

  async updateCard(
    cardId: string,
    patch: {
      name?: string;
      description?: string;
      start?: string | null;
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

    if (patch.start !== undefined) body.start = patch.start === null ? 'null' : patch.start;
    if (patch.due !== undefined) body.due = patch.due === null ? 'null' : patch.due;
    if (patch.dueComplete !== undefined) body.dueComplete = patch.dueComplete;
    if (patch.idBoard !== undefined) body.idBoard = patch.idBoard;
    if (patch.idList !== undefined) body.idList = patch.idList;

    if (Object.keys(body).length === 0) return current;

    await this.client.put(`/cards/${cardId}`, body);
    await this.invalidateCardCaches();

    let updated = await this.getCard(cardId, true);

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
    const syncedBoards = new Set(
      Object.values(snapshot)
        .map((entry) => entry.idBoard)
        .filter(Boolean),
    );
    const result: TrelloCard[] = [];

    for (const card of cards) {
      const previous = snapshot[card.id];
      if (!previous) {
        // Cartão novo para o histórico (criado ou vinculado fora da extensão):
        // se o quadro já era acompanhado, conta como entrada na lista atual.
        if (syncedBoards.has(card.idBoard)) {
          result.push(
            await this.applyRuleEvents(card, [{ kind: 'moved', fromListId: null, toListId: card.idList }]),
          );
        } else {
          result.push(card);
        }
        continue;
      }
      result.push(await this.applyRemoteEvents(card, previous));
    }

    if (replace) await replaceSyncSnapshot(result);
    else await mergeSyncSnapshot(result);
    return result;
  }

  private async applyRemoteEvents(card: TrelloCard, previous: CardSnapshot): Promise<TrelloCard> {
    const events: RuleEvent[] = [];
    if (previous.idList !== card.idList) {
      events.push({ kind: 'moved', fromListId: previous.idList, toListId: card.idList });
    }
    if (!previous.dueComplete && card.dueComplete) {
      events.push({ kind: 'completed' });
    }

    if (events.length === 0) return card;
    return this.applyRuleEvents(card, events);
  }

  private async applyRuleEvents(card: TrelloCard, events: RuleEvent[]): Promise<TrelloCard> {
    let current = card;
    const applied = new Set<string>();
    const counts = new Map<string, number>();
    const log: RuleLogEntry[] = [];
    for (const event of events) {
      const state = await this.executeRules(current, event, applied, 0, false, undefined, counts, log);
      current = state.card;
    }
    await recordRuleApplications(counts, 'auto');
    await pushRuleLog(log);
    return current;
  }

  /**
   * Regras com `requiresSeiLink: false` precisam do quadro inteiro, inclusive
   * cartões sem vínculo. Sincroniza esses quadros para que as regras também
   * reajam a cartões criados/movidos fora da extensão.
   */
  private async syncUnlinkedRuleBoards(): Promise<void> {
    const rules = await getRules();
    const boardIds = Array.from(
      new Set(
        rules
          .filter((rule) => rule.enabled && rule.requiresSeiLink === false && rule.boardId)
          .map((rule) => rule.boardId),
      ),
    );
    if (boardIds.length === 0) return;
    await mapLimit(boardIds, 2, async (boardId) => {
      try {
        await this.getBoardCards(boardId, true);
      } catch {
        // um quadro indisponível não interrompe a atualização dos demais
      }
    });
  }

  /**
   * Aplica as regras em cadeia a um cartão. Cada regra decide se exige vínculo
   * com o SEI (`requiresSeiLink`). Proteção contra loop: no máximo 5 níveis e
   * cada regra roda uma única vez na mesma cadeia.
   */
  private async runRules(card: TrelloCard, event: RuleEvent): Promise<TrelloCard> {
    const counts = new Map<string, number>();
    const log: RuleLogEntry[] = [];
    const comments: RuleRunComment[] = [];
    const { card: result } = await this.executeRules(
      card,
      event,
      new Set<string>(),
      0,
      false,
      undefined,
      counts,
      log,
      comments,
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
    comments?: RuleRunComment[],
  ): Promise<{ card: TrelloCard; touched: boolean }> {
    if (depth >= 5) return { card, touched: false };

    const rules = await getRules();
    let current = card;
    let touched = false;

    for (const rule of rules) {
      if (applied.has(rule.id)) continue;
      if (!rule.boardId || card.idBoard !== rule.boardId) continue;
      if (rule.requiresSeiLink !== false && card.links.length === 0) continue;
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
      if (comments) {
        for (const comment of appliedRule.comments) {
          comments.push({
            cardId: current.id,
            cardName: current.name,
            actionId: comment.actionId,
            text: comment.text,
          });
        }
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
          comments,
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
    comments: Array<{ text: string; actionId?: string }>;
  }> {
    const fromListId = card.idList;
    const moveCandidate = rule.actions.find((action) => action.type === 'moveToList' && action.listId);
    let targetListId = moveCandidate?.listId;
    let boardLists: Array<{ id: string; name: string }> | null = null;
    if (targetListId) {
      // Nunca move para uma lista de outro quadro: a regra é presa ao quadro dela.
      boardLists = await this.getLists(rule.boardId).catch(() => null);
      if (!Array.isArray(boardLists) || !boardLists.some((list) => list.id === targetListId)) {
        targetListId = undefined;
      }
    }
    const moveToTop = rule.actions.some((action) => action.type === 'moveToTop');
    const adds = rule.actions.filter((action) => action.type === 'addLabel' && Boolean(action.labelId));
    const removes = rule.actions.filter((action) => action.type === 'removeLabel' && Boolean(action.labelId));
    const startAction = rule.actions.find((action) => action.type === 'setStartDate');
    const dueAction = rule.actions.find((action) => action.type === 'setDueDate');
    const clearDates = rule.actions.some((action) => action.type === 'clearDates');
    const comments = rule.actions.filter(
      (action) => action.type === 'addComment' && Boolean(action.text?.trim()),
    );
    const checklistActions = rule.actions.filter(
      (action) => action.type === 'applyChecklist' && Boolean(action.templateId),
    );
    const markComplete = rule.actions.some((action) => action.type === 'markComplete');
    const reopen = rule.actions.some((action) => action.type === 'reopenCard');

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

    const body: Record<string, string | boolean> = {};
    const shouldMoveList = Boolean(targetListId && targetListId !== card.idList);
    if (shouldMoveList || moveToTop) {
      body.pos = moveToTop ? 'top' : 'bottom';
      if (shouldMoveList && targetListId) body.idList = targetListId;
    }

    const now = new Date();
    if (clearDates) {
      if (card.start || card.due) {
        body.start = 'null';
        body.due = 'null';
        touched = true;
        actions.push('Limpar início e término');
      }
    } else {
      const startChanged = Boolean(startAction && !ruleDateMatches(card.start, startAction.days, now));
      const dueChanged = Boolean(dueAction && !ruleDateMatches(card.due, dueAction.days, now));
      if (startChanged && startAction) {
        body.start = ruleDate(startAction.days ?? 0, now);
        touched = true;
        actions.push(`Definir início (${ruleDateLabel(startAction.days ?? 0)})`);
      }
      if (dueChanged && dueAction) {
        body.due = ruleDate(dueAction.days ?? 0, now);
        touched = true;
        actions.push(`Definir término (${ruleDateLabel(dueAction.days ?? 0)})`);
      }
    }

    if (markComplete && !card.dueComplete) {
      body.dueComplete = true;
      touched = true;
      actions.push('Marcar como concluído');
    } else if (reopen && card.dueComplete) {
      body.dueComplete = false;
      touched = true;
      actions.push('Reabrir cartão');
    }

    if (Object.keys(body).length > 0) {
      await this.client.put(`/cards/${card.id}`, body);
      touched = true;
      if (shouldMoveList) {
        const listName = boardLists?.find((list) => list.id === targetListId)?.name ?? 'lista';
        actions.push(`Mover para a lista "${listName}"${moveToTop ? ' no topo' : ''}`);
      } else if (moveToTop) {
        actions.push('Mover para o topo');
      }
    }

    const createdComments: Array<{ text: string; actionId?: string }> = [];
    if (comments.length > 0) {
      const finalListId = shouldMoveList && targetListId ? targetListId : card.idList;
      const listName = boardLists?.find((list) => list.id === finalListId)?.name ?? card.list?.name ?? '';
      for (const comment of comments) {
        const text = renderRuleComment(comment.text ?? '', {
          processNumber: card.links[0],
          cardName: card.name,
          boardName: card.board?.name ?? '',
          listName,
          ruleName: rule.name,
          now,
        });
        if (!text) continue;
        const response = await this.client.post<{ id?: string }>(`/cards/${card.id}/actions/comments`, {
          text,
        });
        touched = true;
        actions.push('Adicionar comentário');
        createdComments.push({ text, actionId: response?.id });
      }
    }

    if (checklistActions.length > 0) {
      const templates = await listChecklistTemplates().catch(() => []);
      const existing: TrelloChecklist[] = await this.getChecklists(card.id, true).catch(() => []);
      for (const action of checklistActions) {
        const template = templates.find((item) => item.id === action.templateId);
        if (!template) continue;
        const nameKey = template.name.trim().toLocaleLowerCase('pt-BR');
        if (existing.some((item) => item.name.trim().toLocaleLowerCase('pt-BR') === nameKey)) {
          continue;
        }
        await this.createChecklistWithItems(card.id, template.name, template.items);
        existing.push({ id: '', name: template.name, idCard: card.id, checkItems: [] });
        touched = true;
        actions.push(`Aplicar checklist "${template.name}"`);
      }
    }

    if (!touched) {
      return {
        card,
        touched: false,
        moved: false,
        fromListId,
        actions: [],
        comments: [],
      };
    }

    await this.invalidateCardCaches();
    const updated = await this.getCard(card.id, true);
    return {
      card: updated,
      touched: true,
      moved: updated.idList !== fromListId,
      fromListId,
      actions,
      comments: createdComments,
    };
  }

  async applyRuleNow(ruleId: string, dryRun = false): Promise<{ applied: number; total: number }> {
    const rules = await getRules();
    const rule = rules.find((item) => item.id === ruleId);
    if (!rule) {
      throw new TrelloError('validation', 'Regra não encontrada.');
    }
    if (ruleIssue(rule)) {
      throw new TrelloError('validation', ruleIssue(rule) ?? 'Regra incompleta.');
    }

    const allowsUnlinked = rule.requiresSeiLink === false;
    const cards = allowsUnlinked
      ? await this.getBoardCards(rule.boardId, true)
      : await this.getAllLinkedCards();
    const catalog = await getProcessCatalog();
    // Só entram cartões do quadro da regra e que ainda mudariam algo.
    const scoped = cards.filter(
      (card) => card.idBoard === rule.boardId && (allowsUnlinked || card.links.length > 0),
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
    const dates: RuleRunDate[] = [];
    const comments: RuleRunComment[] = [];
    const completes: RuleRunComplete[] = [];
    const counts = new Map<string, number>();
    const log: RuleLogEntry[] = [];

    for (const card of matching) {
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
          comments,
        );
        if (!result.touched) continue;

        applied += 1;
        touched.push(result.card);
        this.collectRuleRunDiff(card, result.card, moves, labels, dates, completes);
      } catch {
        // Uma falha isolada não interrompe a aplicação nas demais cartões.
      }
    }

    await this.invalidateCardCaches();
    if (touched.length > 0) await mergeSyncSnapshot(touched);
    await recordRuleApplications(counts, 'manual');
    await pushRuleLog(log);

    if (
      moves.length > 0 ||
      labels.length > 0 ||
      dates.length > 0 ||
      comments.length > 0 ||
      completes.length > 0
    ) {
      await pushRuleRun({
        id: `run_${Date.now().toString(36)}`,
        at: Date.now(),
        ruleId: rule.id,
        ruleName: rule.name,
        moves,
        labels,
        dates,
        comments,
        completes,
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

    const cards = await this.getAllLinkedCards(true);
    const relevant = cards.filter((card) => card.links.some((link) => processes.has(link)));
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
    before: TrelloCard,
    after: TrelloCard,
    moves: RuleRunMove[],
    labels: RuleRunLabel[],
    dates: RuleRunDate[],
    completes: RuleRunComplete[],
  ): void {
    if (after.idList !== before.idList) {
      moves.push({
        cardId: after.id,
        cardName: before.name,
        fromListId: before.idList,
        toListId: after.idList,
      });
    }

    const beforeLabels = new Set(before.labels.map((label) => label.id));
    const afterLabels = new Set(after.labels.map((label) => label.id));
    for (const label of afterLabels) {
      if (!beforeLabels.has(label)) {
        labels.push({ cardId: after.id, cardName: before.name, labelId: label, added: true });
      }
    }
    for (const label of beforeLabels) {
      if (!afterLabels.has(label)) {
        labels.push({ cardId: after.id, cardName: before.name, labelId: label, added: false });
      }
    }

    if ((before.start ?? null) !== (after.start ?? null) || (before.due ?? null) !== (after.due ?? null)) {
      dates.push({
        cardId: after.id,
        cardName: before.name,
        previousStart: before.start,
        previousDue: before.due,
        start: after.start,
        due: after.due,
      });
    }

    if (before.dueComplete !== after.dueComplete) {
      completes.push({
        cardId: after.id,
        cardName: before.name,
        previous: before.dueComplete,
        value: after.dueComplete,
      });
    }
  }

  /**
   * Desfaz a última aplicação manual ("Aplicar agora"): devolve cada cartão à
   * lista de origem, reverte etiquetas, datas, conclusão e remove os
   * comentários criados. Cartões alterados depois da aplicação são preservados.
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

    for (const change of run.dates) {
      try {
        const card = await this.getCard(change.cardId, true);
        if (card.links.length === 0) continue;
        if ((card.start ?? null) !== (change.start ?? null)) continue;
        if ((card.due ?? null) !== (change.due ?? null)) continue;
        const body: Record<string, string> = {};
        if ((change.previousStart ?? null) !== (card.start ?? null)) {
          body.start = change.previousStart ?? 'null';
        }
        if ((change.previousDue ?? null) !== (card.due ?? null)) {
          body.due = change.previousDue ?? 'null';
        }
        if (Object.keys(body).length === 0) continue;
        await this.client.put(`/cards/${card.id}`, body);
        touched.push(await this.getCard(card.id, true));
        reverted += 1;
      } catch {
        // cartão apagado ou data alterada depois: mantém como está
      }
    }

    for (const change of run.completes) {
      try {
        const card = await this.getCard(change.cardId, true);
        if (card.links.length === 0) continue;
        if (card.dueComplete !== change.value) continue;
        await this.client.put(`/cards/${card.id}`, { dueComplete: change.previous });
        touched.push(await this.getCard(card.id, true));
        reverted += 1;
      } catch {
        // cartão apagado ou conclusão alterada depois: mantém como está
      }
    }

    for (const comment of run.comments) {
      if (!comment.actionId) continue;
      try {
        await this.client.delete(`/actions/${comment.actionId}`);
        reverted += 1;
      } catch {
        // comentário apagado manualmente: mantém como está
      }
    }

    await this.invalidateCardCaches();
    if (touched.length > 0) await mergeSyncSnapshot(touched);
    await dropLastRuleRun();

    return {
      reverted,
      total: ruleRunChangeCount(run),
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

  async linkCardsToProcesses(cardIds: string[], processNumbers: string[]): Promise<BulkLinkResult[]> {
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

  async updateLabel(
    boardId: string,
    labelId: string,
    patch: { name?: string; color?: string },
  ): Promise<TrelloLabel> {
    const body: Record<string, string> = {};
    if (patch.name !== undefined) body.name = patch.name.trim();
    if (patch.color !== undefined) body.color = patch.color;
    const label = await this.client.put<TrelloLabel>(`/labels/${labelId}`, body);
    await cacheDelete(`labels:${boardId}`);
    await this.invalidateCardCaches();
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

  async getAttachments(cardId: string): Promise<TrelloAttachment[]> {
    const attachments = await this.client.get<TrelloAttachment[]>(`/cards/${cardId}/attachments`, {
      fields: ATTACHMENT_FIELDS,
    });
    return (attachments ?? []).filter((attachment) => Boolean(attachment?.id));
  }

  async addAttachmentUrl(cardId: string, url: string, name?: string): Promise<TrelloAttachment> {
    return this.client.post<TrelloAttachment>(`/cards/${cardId}/attachments`, {
      url,
      name: name?.trim() || undefined,
    });
  }

  async addAttachmentFile(
    cardId: string,
    bytes: Uint8Array,
    name: string,
    mimeType: string,
  ): Promise<TrelloAttachment> {
    return this.client.postMultipart<TrelloAttachment>(`/cards/${cardId}/attachments`, {
      bytes,
      name,
      mimeType,
    });
  }

  async deleteAttachment(cardId: string, attachmentId: string): Promise<void> {
    await this.client.delete(`/cards/${cardId}/attachments/${attachmentId}`);
  }

  async copyCard(cardId: string, listId: string): Promise<TrelloCard> {
    const raw = await this.client.post<TrelloCardApi>('/cards', {
      idCardSource: cardId,
      idList: listId,
      keepFromSource: 'all',
    });
    await this.invalidateCardCaches();
    await cacheDeleteByPrefix('boardcards:');
    return toCard(raw);
  }

  async createCardMirror(cardId: string, listId: string): Promise<{ card: TrelloCard; group: MirrorGroup }> {
    const card = await this.copyCard(cardId, listId);
    const group = await addMirror(cardId, card.id);
    return { card, group };
  }

  private mirrorSync: Promise<{ updated: number }> | null = null;

  private async syncMirrorGroup(group: MirrorGroup): Promise<number> {
    const cards: TrelloCard[] = [];
    for (const id of group.cardIds) {
      try {
        cards.push(await this.getCard(id, true));
      } catch (error) {
        // Só remove do grupo quando o Trello confirma que o cartão não existe.
        // Falhas de rede, limite ou credenciais não podem quebrar o espelho.
        if (error instanceof TrelloError && error.code === 'not_found') {
          await removeMirrorCard(id);
        }
      }
    }
    if (cards.length < 2) return 0;

    const activity = (card: TrelloCard) => {
      const value = card.lastActivity ? new Date(card.lastActivity).getTime() : 0;
      return Number.isFinite(value) ? value : 0;
    };
    const source = [...cards].sort((a, b) => activity(b) - activity(a))[0];
    if (!source) return 0;

    let updated = 0;
    for (const card of cards) {
      if (card.id === source.id) continue;
      if (card.name === source.name && card.desc === source.desc) continue;
      await this.client.put(`/cards/${card.id}`, {
        name: source.name,
        desc: source.desc,
      });
      updated += 1;
    }
    if (updated > 0) await this.invalidateCardCaches();
    return updated;
  }

  async syncMirrorsForCard(cardId: string): Promise<{ updated: number }> {
    const group = await getMirrorGroup(cardId);
    if (!group) return { updated: 0 };
    return { updated: await this.syncMirrorGroup(group) };
  }

  async syncMirrors(): Promise<{ updated: number }> {
    if (this.mirrorSync) return this.mirrorSync;
    this.mirrorSync = (async () => {
      const groups = await listMirrorGroups();
      let updated = 0;
      for (const group of groups) {
        try {
          updated += await this.syncMirrorGroup(group);
        } catch {
          // um grupo com problema não interrompe os demais
        }
      }
      return { updated };
    })().finally(() => {
      this.mirrorSync = null;
    });
    return this.mirrorSync;
  }

  async removeMirror(cardId: string): Promise<void> {
    await removeMirrorCard(cardId);
  }

  async deleteMirrorGroup(groupId: string): Promise<void> {
    await removeMirrorGroup(groupId);
  }

  async copyBoard(boardId: string, name: string): Promise<TrelloBoard> {
    const board = await this.client.post<TrelloBoard>('/boards', {
      name: name.trim(),
      idBoardSource: boardId,
      keepFromSource: 'cards',
      prefs_permissionLevel: 'private',
    });
    await cacheDeleteByPrefix('boards');
    await cacheDeleteByPrefix('lists:');
    await cacheDeleteByPrefix('boardcards:');
    return { id: board?.id ?? '', name: board?.name ?? name.trim() };
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

  /** Cria uma checklist já com os itens de um modelo (uma única invalidação). */
  async createChecklistWithItems(
    cardId: string,
    name: string,
    items: string[],
  ): Promise<TrelloChecklist[]> {
    const created = await this.client.post<TrelloChecklist>('/checklists', {
      idCard: cardId,
      name: name.trim() || 'Checklist',
      pos: 'bottom',
    });
    const checklistId = created?.id;
    if (checklistId) {
      try {
        for (const item of items) {
          const clean = item.trim();
          if (!clean) continue;
          await this.client.post(`/checklists/${checklistId}/checkItems`, {
            name: clean,
            pos: 'bottom',
          });
        }
      } catch (cause) {
        // Não deixa uma checklist vazia/parcial no cartão: a regra passaria a
        // considerá-la aplicada e os itens ficariam faltando para sempre.
        try {
          await this.client.delete(`/checklists/${checklistId}`);
        } catch {
          // melhor esforço: o erro original é o que importa para o usuário
        }
        await this.invalidateCardCaches();
        throw cause;
      }
    }
    await this.invalidateCardCaches();
    return this.getChecklists(cardId, true);
  }

  async getComments(cardId: string): Promise<TrelloComment[]> {
    type Action = {
      id: string;
      date: string;
      data?: { text?: string };
      memberCreator?: {
        id?: string;
        fullName?: string;
        username?: string;
        initials?: string;
        avatarUrl?: string | null;
      } | null;
    };
    const actions = await this.client.get<Action[]>(`/cards/${cardId}/actions`, {
      filter: 'commentCard',
      limit: 100,
      fields: 'id,date,data',
      memberCreator: 'true',
      memberCreator_fields: 'id,fullName,username,initials,avatarUrl',
    });
    return (actions ?? [])
      .filter((action) => typeof action.data?.text === 'string' && action.data.text.trim())
      .map((action) => ({
        id: action.id,
        date: action.date,
        text: action.data?.text ?? '',
        author: action.memberCreator
          ? {
              id: action.memberCreator.id,
              fullName: action.memberCreator.fullName || action.memberCreator.username || 'Membro',
              username: action.memberCreator.username,
              initials: action.memberCreator.initials,
              avatarUrl: action.memberCreator.avatarUrl ?? null,
            }
          : null,
      }))
      .reverse();
  }

  async addComment(cardId: string, text: string): Promise<TrelloComment> {
    const clean = text.trim();
    if (!clean) throw new TrelloError('validation', 'Escreva o comentário.');
    const action = await this.client.post<{
      id: string;
      date: string;
      data?: { text?: string };
      memberCreator?: {
        id?: string;
        fullName?: string;
        username?: string;
        initials?: string;
        avatarUrl?: string | null;
      } | null;
    }>(`/cards/${cardId}/actions/comments`, { text: clean });
    await this.invalidateCardCaches();
    return {
      id: action?.id ?? `comment_${Date.now().toString(36)}`,
      date: action?.date ?? new Date().toISOString(),
      text: action?.data?.text ?? clean,
      author: action?.memberCreator
        ? {
            id: action.memberCreator.id,
            fullName: action.memberCreator.fullName || action.memberCreator.username || 'Membro',
            username: action.memberCreator.username,
            initials: action.memberCreator.initials,
            avatarUrl: action.memberCreator.avatarUrl ?? null,
          }
        : null,
    };
  }

  async updateCheckItem(
    cardId: string,
    checkItemId: string,
    patch: { state?: 'complete' | 'incomplete'; name?: string; pos?: number },
  ): Promise<void> {
    const body: Record<string, string | number> = {};
    if (patch.state) body.state = patch.state;
    if (typeof patch.name === 'string' && patch.name.trim()) body.name = patch.name.trim();
    if (typeof patch.pos === 'number' && Number.isFinite(patch.pos)) body.pos = patch.pos;
    if (Object.keys(body).length === 0) return;
    await this.client.put(`/cards/${cardId}/checkItem/${checkItemId}`, body);
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
