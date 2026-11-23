import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import type { Settings, TrelloBoard, TrelloCard, TrelloLabel, TrelloList } from '../../core/domain/types';
import { callRpc, errorMessage } from '../../core/messaging/client';
import { openOptions } from '../../core/messaging/actions';
import type { LastActionTab } from '../../core/storage/last-tab';
import type { ProcessCatalog, ProcessRecord } from '../../core/storage/processes';
import { isOriginActivated, watchSettings } from '../../core/storage/settings';
import { watchSyncChanges } from '../../core/storage/sync-tick';
import { looksLikeSeiUrl } from '../../core/sei/detect';
import { BrandMark } from '../../ui/BrandMark';
import { CreateCardDialog } from '../../ui/components/CreateCardDialog';
import { Icon } from '../../ui/icons';
import { showToast } from '../../ui/toast';
import { setThemePreference } from '../../ui/theme';
import { ActivationCard } from './ActivationCard';
import { DashboardCard } from './DashboardCard';
import { KanbanBoard } from './KanbanBoard';
import { DashboardFilters, type LabelFilterOption, type TypeFilterOption } from './DashboardFilters';
import {
  ACTIVITY_FILTER_OPTIONS,
  DEFAULT_FILTERS,
  DUE_FILTER_OPTIONS,
  PROCESS_UPDATE_OPTIONS,
  SORT_GROUPS,
  SORT_OPTIONS,
  activeFilterCount,
  cardsToCsv,
  dueBucket,
  groupCards,
  loadFilters,
  matchesFilters,
  processTypesFor,
  readLastVisit,
  saveFilters,
  sortCards,
  writeLastVisit,
  type DashboardFilters as Filters,
} from './model';
import '../options/style.css';
import './style.css';
import { usePinnedCards } from '../../ui/hooks/usePinnedCards';

function summarize(cards: TrelloCard[], catalog: ProcessCatalog) {
  let overdue = 0;
  let today = 0;
  let soon = 0;
  let none = 0;
  let done = 0;
  let updated7d = 0;
  let unread = 0;
  const processes = new Set<string>();
  const labels = new Set<string>();
  const boards = new Set<string>();
  const sevenDays = Date.now() - 7 * 86_400_000;

  for (const card of cards) {
    const bucket = dueBucket(card);
    if (bucket === 'overdue') overdue += 1;
    else if (bucket === 'today') today += 1;
    else if (bucket === 'soon') soon += 1;
    else if (bucket === 'none') none += 1;
    else if (bucket === 'done') done += 1;

    if (card.lastActivity && new Date(card.lastActivity).getTime() >= sevenDays) updated7d += 1;
    if (card.links.some((number) => catalog[number]?.unread && !catalog[number]?.acknowledged)) unread += 1;
    for (const process of card.links) processes.add(process);
    for (const label of card.labels) labels.add(label.id);
    if (card.idBoard) boards.add(card.idBoard);
  }

  return {
    total: cards.length,
    overdue,
    today,
    soon,
    none,
    done,
    updated7d,
    unread,
    processes: processes.size,
    labels: labels.size,
    boards: boards.size,
  };
}

interface MoveHistoryEntry {
  cardId: string;
  cardName: string;
  fromListId: string;
  fromListName: string;
  toListId: string;
  toListName: string;
}

function Dashboard() {
  const [cards, setCards] = useState<TrelloCard[]>([]);
  const [catalog, setCatalog] = useState<ProcessCatalog>({});
  const [settings, setSettings] = useState<Settings | null>(null);
  const [lastTab, setLastTab] = useState<LastActionTab | null>(null);
  const [filters, setFilters] = useState<Filters>(() => loadFilters());
  const [lastVisit, setLastVisit] = useState<number>(() => readLastVisit());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [trelloBoards, setTrelloBoards] = useState<TrelloBoard[]>([]);
  const [boardLists, setBoardLists] = useState<TrelloList[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createTarget, setCreateTarget] = useState<{ boardId: string; listId: string } | null>(null);
  const [view, setView] = useState<'list' | 'board'>(() => {
    try {
      return window.localStorage.getItem('sei-flow:dashboard:view:v1') === 'board' ? 'board' : 'list';
    } catch {
      return 'list';
    }
  });
  const [moveHistory, setMoveHistory] = useState<MoveHistoryEntry[]>([]);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingListName, setEditingListName] = useState('');
  const [addingList, setAddingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [listBusy, setListBusy] = useState(false);
  const undoRef = useRef<() => void>(() => undefined);

  const version = browser.runtime.getManifest().version;
  const [connected, setConnected] = useState(Boolean(settings?.appKey && settings?.appToken));
  const [authAccount, setAuthAccount] = useState<{
    fullName: string;
    username: string;
  } | null>(null);
  const [authMode, setAuthMode] = useState<'oauth' | 'token' | 'none' | null>(null);
  const loadSeq = useRef(0);
  const defaultBoardApplied = useRef(false);
  const mirrorSynced = useRef(false);
  const skipNextLoad = useRef(false);

  const load = useCallback(
    async (silent = false, quiet = false) => {
      const seq = ++loadSeq.current;
      if (!silent) setLoading(true);
      if (!quiet) setRefreshing(true);
      setError(null);
      try {
        const auth = await callRpc('auth:status', undefined).catch(() => null);
        if (auth?.connected) {
          // Puxa regras/destino em segundo plano; não bloqueia o painel.
          void callRpc('sync:config', { force: false }).catch(() => null);
        }
        const nextSettings = await callRpc('settings:get', undefined);
        if (seq !== loadSeq.current) return;
        setSettings(nextSettings);

        const hasCredentials = auth ? auth.connected : Boolean(nextSettings.appKey && nextSettings.appToken);
        setConnected(hasCredentials);
        setAuthMode(auth?.mode ?? (nextSettings.appKey && nextSettings.appToken ? 'token' : 'none'));
        setAuthAccount(
          auth?.account ? { fullName: auth.account.fullName, username: auth.account.username } : null,
        );

        const [processRecords, nextLastTab, nextBoards] = await Promise.all([
          callRpc('processes:list', undefined),
          callRpc('activation:last-tab', undefined),
          hasCredentials
            ? callRpc('trello:boards', { fresh: false }).catch(() => [] as TrelloBoard[])
            : Promise.resolve([] as TrelloBoard[]),
        ]);
        if (seq !== loadSeq.current) return;
        const nextCatalog: ProcessCatalog = {};
        for (const record of processRecords as ProcessRecord[]) {
          nextCatalog[record.number] = record;
        }
        setCatalog(nextCatalog);
        setTrelloBoards(Array.isArray(nextBoards) ? nextBoards : []);
        setLastTab(nextLastTab);

        if (hasCredentials) {
          // Na primeira carga, usa o quadro padrão direto para evitar uma busca
          // global por cartões vinculados antes de o filtro de quadro ser aplicado.
          const firstLoadBoardId = defaultBoardApplied.current ? '' : nextSettings.defaultBoardId;
          const effectiveBoardId = filters.boardId || firstLoadBoardId;
          // Sem vínculo só pode ser descoberto dentro de um quadro. Quando o
          // filtro é "Todos os quadros", usamos o quadro padrão para esses cartões.
          const unlinkedBoardId = effectiveBoardId || nextSettings.defaultBoardId;

          if (filters.link === 'unlinked') {
            if (!unlinkedBoardId) {
              if (seq === loadSeq.current) setCards([]);
            } else {
              const boardCards = await callRpc('trello:board-cards', {
                boardId: unlinkedBoardId,
                fresh: true,
              });
              if (seq === loadSeq.current) {
                setCards(boardCards.filter((card) => card.links.length === 0));
              }
            }
          } else if (effectiveBoardId) {
            // Com um quadro selecionado, buscar só esse quadro é muito mais rápido
            // do que procurar todos os cartões vinculados em todos os quadros.
            const boardCards = await callRpc('trello:board-cards', {
              boardId: effectiveBoardId,
              fresh: true,
            });
            if (seq === loadSeq.current) {
              setCards(
                filters.link === 'linked' ? boardCards.filter((card) => card.links.length > 0) : boardCards,
              );
            }
          } else if (filters.link === 'all' && unlinkedBoardId) {
            // Todos os quadros: vinculados de todo o Trello + sem vínculo do
            // quadro padrão (não há como descobrir sem vínculo fora dos quadros).
            const [linked, boardCards] = await Promise.all([
              callRpc('trello:all-linked-cards', { fresh: true }),
              callRpc('trello:board-cards', { boardId: unlinkedBoardId, fresh: true }).catch(
                () => [] as TrelloCard[],
              ),
            ]);
            if (seq === loadSeq.current) {
              const merged = new Map<string, TrelloCard>();
              for (const item of linked) merged.set(item.id, item);
              for (const item of boardCards) {
                if (item.links.length === 0) merged.set(item.id, item);
              }
              setCards(Array.from(merged.values()));
            }
          } else {
            const nextCards = await callRpc('trello:all-linked-cards', { fresh: true });
            if (seq === loadSeq.current) setCards(nextCards);
          }
        } else if (seq === loadSeq.current) {
          setCards([]);
        }
        if (seq === loadSeq.current) writeLastVisit();
      } catch (cause) {
        if (seq === loadSeq.current) setError(errorMessage(cause));
      } finally {
        if (seq === loadSeq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [filters.link, filters.boardId],
  );

  useEffect(() => {
    if (skipNextLoad.current) {
      skipNextLoad.current = false;
      return;
    }
    void load();
  }, [load]);

  // Ao desconectar, não deixa filtros/quadro do usuário anterior no painel.
  useEffect(() => {
    if (loading || connected) return;
    skipNextLoad.current = true;
    setShowFilters(false);
    setFilters(DEFAULT_FILTERS);
    saveFilters(DEFAULT_FILTERS);
    defaultBoardApplied.current = false;
  }, [connected, loading]);

  useEffect(() => {
    if (!connected || mirrorSynced.current) return;
    mirrorSynced.current = true;
    void callRpc('mirrors:sync', undefined)
      .then((result) => {
        if (result.updated > 0) void load(true, true);
      })
      .catch(() => undefined);
  }, [connected, load]);

  useEffect(() => {
    if (settings) setThemePreference(settings.theme);
  }, [settings]);

  useEffect(() => {
    let timer: number | null = null;
    const unwatch = watchSettings((next) => {
      setThemePreference(next.theme);
      setSettings((previous) => {
        if (previous && previous.defaultBoardId !== next.defaultBoardId) {
          defaultBoardApplied.current = false;
        }
        return next;
      });
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void load(true, true);
      }, 300);
    });
    return () => {
      unwatch();
      if (timer) window.clearTimeout(timer);
    };
  }, [load]);

  // Atualização sem clique: ao voltar ao painel e quando o SEI avisa que mudou algo.
  useEffect(() => {
    let timer: number | null = null;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void load(true, true);
      }, 700);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    const unwatch = watchSyncChanges(refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
      unwatch();
      if (timer) window.clearTimeout(timer);
    };
  }, [load]);

  useEffect(() => {
    if (defaultBoardApplied.current) return;
    if (!settings?.defaultBoardId) return;
    defaultBoardApplied.current = true;
    setFilters((previous) => {
      if (previous.boardId) return previous;
      const next = { ...previous, boardId: settings.defaultBoardId };
      saveFilters(next);
      return next;
    });
  }, [settings]);

  useEffect(() => {
    if (!connected) {
      setBoardLists([]);
      return;
    }
    const boardId = filters.boardId;
    if (!boardId) {
      setBoardLists([]);
      return;
    }
    let active = true;
    callRpc('trello:lists', { boardId, fresh: true })
      .then((value) => {
        if (active) setBoardLists(Array.isArray(value) ? value : []);
      })
      .catch(() => {
        if (active) setBoardLists([]);
      });
    return () => {
      active = false;
    };
  }, [connected, filters.boardId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.composedPath()[0];
      const editable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (editable) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undoRef.current();
        return;
      }
      const isShortcut =
        event.key === '/' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k');
      if (!isShortcut) return;
      const input = document.getElementById('sdo-search');
      if (!input) return;
      event.preventDefault();
      input.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const updateFilters = useCallback((patch: Partial<Filters>) => {
    setFilters((previous) => {
      let next = { ...previous, ...patch };
      if (patch.boardId !== undefined && patch.boardId !== previous.boardId) {
        next = { ...next, listId: '' };
      }
      if (patch.sort !== undefined) {
        next = { ...next, group: SORT_GROUPS[patch.sort] };
      }
      saveFilters(next);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    const next = {
      ...DEFAULT_FILTERS,
      boardId: filters.boardId,
      sort: filters.sort,
      group: SORT_GROUPS[filters.sort],
    };
    setFilters(next);
    saveFilters(next);
  }, [filters.boardId, filters.sort]);

  const markSeen = useCallback(() => {
    const now = Date.now();
    writeLastVisit(now);
    setLastVisit(now);
    showToast('Atualizações marcadas como vistas.', 'success');
  }, []);

  const boards = useMemo(() => {
    const map = new Map<string, string>();
    for (const board of trelloBoards) {
      if (board.id) map.set(board.id, board.name);
    }
    for (const card of cards) {
      if (card.idBoard && !map.has(card.idBoard)) {
        map.set(card.idBoard, card.board?.name ?? 'Quadro');
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [cards, trelloBoards]);

  const lists = useMemo(() => {
    if (filters.boardId && boardLists.length > 0) {
      return boardLists.map((list) => ({
        id: list.id,
        name: list.name,
        boardId: filters.boardId,
        pos: list.pos,
      }));
    }

    const map = new Map<string, { id: string; name: string; boardId: string; pos?: number }>();
    for (const card of cards) {
      if (filters.boardId && card.idBoard !== filters.boardId) continue;
      if (card.idList && !map.has(card.idList)) {
        map.set(card.idList, {
          id: card.idList,
          name: card.list?.name ?? 'Lista',
          boardId: card.idBoard,
          pos: card.list?.pos,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const boardA = cards.find((card) => card.idBoard === a.boardId)?.board?.name ?? '';
      const boardB = cards.find((card) => card.idBoard === b.boardId)?.board?.name ?? '';
      const boardCompare = boardA.localeCompare(boardB, 'pt-BR');
      if (boardCompare !== 0) return boardCompare;
      if (typeof a.pos === 'number' && typeof b.pos === 'number' && a.pos !== b.pos) {
        return a.pos - b.pos;
      }
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }, [cards, filters.boardId, boardLists]);

  const listOrder = useMemo(() => {
    const map = new Map<string, number>();
    for (const list of boardLists) {
      if (filters.boardId && typeof list.pos === 'number') {
        map.set(`${filters.boardId}:${list.id}`, list.pos);
      }
    }
    for (const card of cards) {
      if (typeof card.list?.pos === 'number') {
        map.set(`${card.idBoard}:${card.idList}`, card.list.pos);
      }
    }
    return map;
  }, [boardLists, cards, filters.boardId]);

  const labels = useMemo<LabelFilterOption[]>(() => {
    const map = new Map<string, { label: TrelloLabel; count: number }>();
    for (const card of cards) {
      for (const label of card.labels) {
        const current = map.get(label.id);
        if (current) current.count += 1;
        else map.set(label.id, { label, count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const nameA = a.label.name || a.label.color || '';
      const nameB = b.label.name || b.label.color || '';
      return nameA.localeCompare(nameB, 'pt-BR');
    });
  }, [cards]);

  const types = useMemo<TypeFilterOption[]>(() => {
    const map = new Map<string, number>();
    for (const card of cards) {
      for (const type of processTypesFor(card, catalog)) {
        map.set(type, (map.get(type) ?? 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [cards, catalog]);

  const visibleCards = useMemo(
    () => cards.filter((card) => matchesFilters(card, filters, catalog, lastVisit)),
    [cards, catalog, filters, lastVisit],
  );

  const summary = useMemo(() => summarize(visibleCards, catalog), [visibleCards, catalog]);

  const scopeCards = useMemo(
    () => (filters.boardId ? cards.filter((card) => card.idBoard === filters.boardId) : cards),
    [cards, filters.boardId],
  );
  const scopeTotal = scopeCards.length;
  const scopeName = filters.boardId
    ? (boards.find((board) => board.id === filters.boardId)?.name ?? 'Quadro selecionado')
    : 'Todos os quadros';

  const listCounts = useMemo(() => {
    if (!filters.boardId) return [];
    const base = cards.filter((card) => matchesFilters(card, { ...filters, listId: '' }, catalog, lastVisit));
    const counts = new Map<string, number>();
    for (const card of base) counts.set(card.idList, (counts.get(card.idList) ?? 0) + 1);
    return lists
      .filter((list) => list.boardId === filters.boardId)
      .map((list) => ({ id: list.id, name: list.name, count: counts.get(list.id) ?? 0 }));
  }, [cards, filters, catalog, lastVisit, lists]);

  const listTotal = listCounts.reduce((sum, item) => sum + item.count, 0);

  const groups = useMemo(
    () => groupCards(visibleCards, SORT_GROUPS[filters.sort], filters.sort, catalog, listOrder),
    [visibleCards, filters.sort, catalog, listOrder],
  );
  const { pinned, togglePin } = usePinnedCards();
  // Fixados sobem ao topo de cada grupo, preservando a ordenação escolhida.
  const orderedGroups = useMemo(
    () =>
      groups.map((group) => ({
        ...group,
        cards: [...group.cards].sort((a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id))),
      })),
    [groups, pinned],
  );

  const kanbanGroups = useMemo(() => {
    const sortPinned = (a: TrelloCard, b: TrelloCard) => Number(pinned.has(b.id)) - Number(pinned.has(a.id));
    if (filters.boardId && listCounts.length > 0) {
      const boardName =
        boards.find((board) => board.id === filters.boardId)?.name ?? settings?.defaultBoardName ?? 'Quadro';
      return listCounts.map((list) => ({
        key: `${filters.boardId}:${list.id}`,
        title: list.name,
        subtitle: boardName,
        cards: sortCards(
          visibleCards.filter((card) => card.idList === list.id),
          filters.sort,
          catalog,
          listOrder,
        ).sort(sortPinned),
      }));
    }
    const base = groupCards(visibleCards, 'list', filters.sort, catalog, listOrder);
    return base.map((group) => ({
      ...group,
      cards: [...group.cards].sort(sortPinned),
    }));
  }, [
    filters.boardId,
    listCounts,
    visibleCards,
    filters.sort,
    catalog,
    listOrder,
    pinned,
    boards,
    settings?.defaultBoardName,
  ]);

  const renameListById = async (listId: string, name: string) => {
    const boardId = filters.boardId;
    if (!boardId) return;
    const updated = await callRpc('trello:rename-list', { boardId, listId, name });
    setBoardLists((previous) =>
      previous.map((list) => (list.id === updated.id ? { ...list, ...updated } : list)),
    );
    await load(true, true);
  };

  const createListByName = async (name: string) => {
    const boardId = filters.boardId;
    if (!boardId) return;
    const created = await callRpc('trello:create-list', { boardId, name });
    setBoardLists((previous) => [...previous, created]);
    await load(true, true);
  };

  const startRenameList = (list: { id: string; name: string }) => {
    setEditingListId(list.id);
    setEditingListName(list.name);
  };

  const renameList = async () => {
    const name = editingListName.trim();
    if (!editingListId || !name) return;
    setListBusy(true);
    try {
      await renameListById(editingListId, name);
      setEditingListId(null);
      showToast('Lista renomeada.', 'success');
    } catch (cause) {
      showToast(errorMessage(cause), 'error');
    } finally {
      setListBusy(false);
    }
  };

  const createList = async () => {
    const name = newListName.trim();
    if (!name) return;
    setListBusy(true);
    try {
      await createListByName(name);
      setNewListName('');
      setAddingList(false);
      showToast('Lista criada.', 'success');
    } catch (cause) {
      showToast(errorMessage(cause), 'error');
    } finally {
      setListBusy(false);
    }
  };

  const continueWithoutTrello = async () => {
    try {
      const next = await callRpc('settings:save', { skipTrello: true });
      setSettings(next);
      showToast('Modo sem Trello ativado. Você pode conectar quando quiser.', 'success');
    } catch (cause) {
      showToast(errorMessage(cause), 'error');
    }
  };

  const exportCsv = () => {
    if (visibleCards.length === 0) {
      showToast('Não há cartões para exportar com os filtros atuais.', 'error');
      return;
    }
    const csv = `\uFEFF${cardsToCsv(visibleCards, catalog)}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sei-flow-cartoes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast(`${visibleCards.length} cartão(ões) exportado(s).`, 'success');
  };

  const handleChanged = (updated: TrelloCard) => {
    setCards((previous) => previous.map((card) => (card.id === updated.id ? updated : card)));
  };

  const handleRemoved = (cardId: string) => {
    setCards((previous) => previous.filter((card) => card.id !== cardId));
  };

  const changeView = (next: 'list' | 'board') => {
    setView(next);
    try {
      window.localStorage.setItem('sei-flow:dashboard:view:v1', next);
    } catch {
      // visualização é preferência local
    }
  };

  const openCreate = (target: { boardId: string; listId: string } | null = null) => {
    setCreateTarget(target);
    setShowCreate(true);
  };

  const closeCreate = () => {
    setShowCreate(false);
    setCreateTarget(null);
  };

  const moveCardToList = async (cardId: string, targetListId: string) => {
    const card = cards.find((item) => item.id === cardId);
    if (!card || card.idList === targetListId) return;
    const group = kanbanGroups.find((item) => {
      const index = item.key.indexOf(':');
      return (index >= 0 ? item.key.slice(index + 1) : item.key) === targetListId;
    });
    const listName = group?.title ?? 'outra lista';
    const fromListName = card.list?.name ?? 'lista atual';
    const optimistic: TrelloCard = {
      ...card,
      idList: targetListId,
      list: { id: targetListId, name: listName, pos: card.list?.pos },
    };
    setCards((previous) => previous.map((item) => (item.id === cardId ? optimistic : item)));
    try {
      const updated = await callRpc('trello:update-card', {
        cardId,
        patch: { idList: targetListId },
      });
      handleChanged(updated);
      setMoveHistory((previous) => [
        ...previous.slice(-19),
        {
          cardId,
          cardName: card.name,
          fromListId: card.idList,
          fromListName,
          toListId: targetListId,
          toListName: listName,
        },
      ]);
      showToast(`Cartão movido para ${listName}.`, 'success');
    } catch (cause) {
      setCards((previous) => previous.map((item) => (item.id === cardId ? card : item)));
      showToast(errorMessage(cause), 'error');
    }
  };

  const moveColumn = async (listId: string, direction: 'left' | 'right') => {
    if (!filters.boardId) return;
    const index = boardLists.findIndex((list) => list.id === listId);
    if (index < 0) return;
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= boardLists.length) return;
    const current = boardLists[index];
    const target = boardLists[targetIndex];
    if (!current || !target) return;
    const neighbor = boardLists[direction === 'left' ? index - 2 : index + 2];
    const targetPos = target.pos ?? targetIndex;
    const neighborPos = neighbor?.pos ?? (direction === 'left' ? targetPos - 1 : targetPos + 1);
    const newPos =
      direction === 'left'
        ? neighbor
          ? (neighborPos + targetPos) / 2
          : targetPos - 1
        : neighbor
          ? (targetPos + neighborPos) / 2
          : targetPos + 1;
    const previous = boardLists;
    const moved = { ...current, pos: newPos };
    const reordered = boardLists.filter((list) => list.id !== listId);
    reordered.splice(targetIndex, 0, moved);
    setBoardLists(reordered);
    try {
      await callRpc('trello:update-list', { listId, pos: newPos });
      showToast('Ordem das listas atualizada.', 'success');
    } catch (cause) {
      setBoardLists(previous);
      showToast(errorMessage(cause), 'error');
    }
  };

  const undoLastMove = async () => {
    const entry = moveHistory[moveHistory.length - 1];
    if (!entry) return;
    const card = cards.find((item) => item.id === entry.cardId);
    if (!card) {
      setMoveHistory((previous) => previous.slice(0, -1));
      return;
    }
    const optimistic: TrelloCard = {
      ...card,
      idList: entry.fromListId,
      list: { id: entry.fromListId, name: entry.fromListName, pos: card.list?.pos },
    };
    setCards((previous) => previous.map((item) => (item.id === entry.cardId ? optimistic : item)));
    try {
      const updated = await callRpc('trello:update-card', {
        cardId: entry.cardId,
        patch: { idList: entry.fromListId },
      });
      handleChanged(updated);
      setMoveHistory((previous) => previous.slice(0, -1));
      showToast(`Movimentação desfeita: ${entry.cardName} voltou para ${entry.fromListName}.`, 'success');
    } catch (cause) {
      setCards((previous) => previous.map((item) => (item.id === entry.cardId ? card : item)));
      showToast(errorMessage(cause), 'error');
    }
  };

  useEffect(() => {
    undoRef.current = () => void undoLastMove();
  });

  useEffect(() => {
    setMoveHistory([]);
  }, [filters.boardId]);

  const handleProcessesRead = (numbers: string[]) => {
    setCatalog((previous) => {
      let changed = false;
      const next = { ...previous };
      for (const number of numbers) {
        const record = next[number];
        if (!record?.unread || record.acknowledged) continue;
        next[number] = { ...record, acknowledged: true };
        changed = true;
      }
      return changed ? next : previous;
    });
  };

  const handleToggleLabel = (labelId: string) => {
    updateFilters({
      labelIds: filters.labelIds.includes(labelId)
        ? filters.labelIds.filter((id) => id !== labelId)
        : [...filters.labelIds, labelId],
      withoutLabels: false,
    });
  };

  const toggleLinkFilter = (target: 'linked' | 'unlinked') => {
    const link = filters.link === target ? 'all' : target;
    updateFilters({
      link,
      boardId: filters.boardId || settings?.defaultBoardId || '',
    });
  };

  const toggleDue = (value: Filters['due']) => {
    updateFilters({ due: filters.due === value ? 'any' : value });
  };

  const toggleProcessUpdate = (value: Filters['processUpdate']) => {
    updateFilters({ processUpdate: filters.processUpdate === value ? 'any' : value });
  };

  const toggleActivity = (value: Filters['activity']) => {
    updateFilters({ activity: filters.activity === value ? 'any' : value });
  };

  const resetToScope = () => {
    updateFilters({
      search: '',
      listId: '',
      processType: '',
      labelIds: [],
      withoutLabels: false,
      due: 'any',
      activity: 'any',
      processUpdate: 'any',
    });
  };

  const toggleTheme = async () => {
    const next = settings?.theme === 'dark' ? 'light' : 'dark';
    setThemePreference(next);
    try {
      const updated = await callRpc('settings:save', { theme: next });
      setSettings(updated);
    } catch (cause) {
      setThemePreference(settings?.theme ?? 'light');
      showToast(errorMessage(cause), 'error');
    }
  };
  const active = activeFilterCount(filters);
  const seiTab = lastTab?.url && looksLikeSeiUrl(lastTab.url) ? lastTab : null;
  const catalogSeiUrl = useMemo(() => {
    return (
      Object.values(catalog)
        .filter((record) => Boolean(record.url))
        .sort((a, b) => b.updatedAt - a.updatedAt)[0]?.url ?? null
    );
  }, [catalog]);
  const seiUrl = seiTab?.url ?? catalogSeiUrl;
  const trelloBoardId = filters.boardId || settings?.defaultBoardId || '';
  const trelloUrl = trelloBoardId ? `https://trello.com/b/${trelloBoardId}` : 'https://trello.com/';
  const hasActivatedSite = Boolean(
    settings && (settings.allSites || settings.autoSeiHosts || settings.activatedOrigins.length > 0),
  );
  const seiOriginActive = Boolean(seiTab?.url && settings && isOriginActivated(seiTab.url, settings));

  const activeChips: Array<{ key: string; label: string; clear: Partial<Filters> }> = [];
  if (filters.search.trim()) {
    activeChips.push({
      key: 'search',
      label: `Busca: ${filters.search.trim()}`,
      clear: { search: '' },
    });
  }
  if (filters.boardId) {
    const board = boards.find((item) => item.id === filters.boardId);
    if (board) {
      activeChips.push({
        key: 'board',
        label: board.name,
        clear: { boardId: '', listId: '' },
      });
    }
  }
  if (filters.listId) {
    const list = lists.find((item) => item.id === filters.listId);
    if (list) {
      activeChips.push({ key: 'list', label: list.name, clear: { listId: '' } });
    }
  }
  if (filters.processType) {
    activeChips.push({
      key: 'type',
      label:
        filters.processType === '__none__'
          ? 'Sem tipo de processo'
          : (types.find((item) => item.value === filters.processType)?.label ?? filters.processType),
      clear: { processType: '' },
    });
  }
  for (const labelId of filters.labelIds) {
    const label = labels.find((item) => item.label.id === labelId)?.label;
    if (label) {
      activeChips.push({
        key: `label:${labelId}`,
        label: label.name || label.color || 'Etiqueta',
        clear: { labelIds: filters.labelIds.filter((id) => id !== labelId) },
      });
    }
  }
  if (filters.withoutLabels) {
    activeChips.push({ key: 'withoutLabels', label: 'Sem etiqueta', clear: { withoutLabels: false } });
  }
  if (filters.due !== 'any') {
    activeChips.push({
      key: 'due',
      label: DUE_FILTER_OPTIONS.find((option) => option.value === filters.due)?.label ?? filters.due,
      clear: { due: 'any' },
    });
  }
  if (filters.activity !== 'any') {
    activeChips.push({
      key: 'activity',
      label:
        ACTIVITY_FILTER_OPTIONS.find((option) => option.value === filters.activity)?.label ??
        filters.activity,
      clear: { activity: 'any' },
    });
  }
  if (filters.processUpdate !== 'any') {
    activeChips.push({
      key: 'processUpdate',
      label:
        PROCESS_UPDATE_OPTIONS.find((option) => option.value === filters.processUpdate)?.label ??
        filters.processUpdate,
      clear: { processUpdate: 'any' },
    });
  }
  if (filters.link === 'linked') {
    activeChips.push({ key: 'link', label: 'Com vínculo SEI', clear: { link: 'all' } });
  }
  if (filters.link === 'unlinked') {
    activeChips.push({ key: 'link', label: 'Sem vínculo SEI', clear: { link: 'all' } });
  }

  return (
    <div className={`sdo-page${view === 'board' ? ' sdo-page--kanban' : ''}`}>
      <header className="sdo-hero">
        <div className="sdo-hero__brand">
          <div className="sdo-hero__mark">
            <BrandMark size={46} />
          </div>
          <div className="sdo-hero__copy">
            <div className="sdo-hero__title">
              <h1>Painel SEI Flow</h1>
              <span className="sdo-version">v{version}</span>
            </div>
            <p>Gestão eficiente de processos, prazos, etiquetas e cartões.</p>
            <div className="sdo-hero__status">
              <span
                className={`sdo-status ${connected ? 'sdo-status--on' : 'sdo-status--off'}`}
                title={
                  authAccount
                    ? `Conectado como ${authAccount.fullName} (@${authAccount.username})`
                    : undefined
                }
              >
                <span className="sdo-status__dot" />
                <span className="sdo-status__label">
                  Trello {connected ? 'conectado' : 'não conectado'}
                  {connected && authAccount
                    ? ` · ${authAccount.fullName}`
                    : connected && authMode === 'token'
                      ? ' · manual'
                      : ''}
                </span>
              </span>
              <span
                className={`sdo-status ${hasActivatedSite ? 'sdo-status--on' : 'sdo-status--off'}`}
                title={
                  settings?.allSites
                    ? 'SEI Flow ativo em todos os sites'
                    : settings?.autoSeiHosts
                      ? 'SEI Flow ativo em qualquer site que comece com “sei”'
                      : settings?.activatedOrigins.join(', ') || 'Nenhum site autorizado'
                }
              >
                <span className="sdo-status__dot" />
                Site {hasActivatedSite ? 'ativado' : 'não ativado'}
              </span>
              {connected && settings?.defaultListName && (
                <span className="sdo-status sdo-status--muted">
                  <Icon name="board" size={12} />
                  {settings.defaultBoardName} » {settings.defaultListName}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="sdo-hero__actions">
          {connected && (
            <button
              type="button"
              className="sfo-btn sfo-btn--sm sfo-btn--primary"
              onClick={() => openCreate()}
              title="Criar cartão no Trello sem abrir o Trello"
            >
              <Icon name="plus" size={14} />
              Novo cartão
            </button>
          )}
          {seiUrl ? (
            <a
              className="sfo-btn sfo-btn--sm"
              href={seiUrl}
              target="_blank"
              rel="noreferrer"
              title="Abrir o SEI"
            >
              <Icon name="external" size={14} />
              SEI
            </a>
          ) : (
            <button
              type="button"
              className="sfo-btn sfo-btn--sm"
              disabled
              title="Abra uma página do SEI para habilitar este atalho"
            >
              <Icon name="external" size={14} />
              SEI
            </button>
          )}
          {connected && (
            <a
              className="sfo-btn sfo-btn--sm"
              href={trelloUrl}
              target="_blank"
              rel="noreferrer"
              title="Abrir o Trello"
            >
              <Icon name="board" size={14} />
              Trello
            </a>
          )}
          {connected && (
            <button
              type="button"
              className="sfo-btn sfo-btn--sm"
              onClick={() => void load(true)}
              disabled={refreshing}
            >
              {refreshing ? <span className="sfo-spinner" /> : <Icon name="refresh" size={14} />}
              Atualizar
            </button>
          )}
          <button
            type="button"
            className="sfo-btn sfo-btn--sm"
            onClick={() => void openOptions('connection')}
          >
            <Icon name="settings" size={14} />
            Opções
          </button>
          <button
            type="button"
            className="sfo-btn sfo-btn--sm sdo-theme-toggle"
            onClick={() => void toggleTheme()}
            title={settings?.theme === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
            aria-label={settings?.theme === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
          >
            <Icon name={settings?.theme === 'dark' ? 'sun' : 'moon'} size={14} />
          </button>
        </div>
      </header>

      {error && (
        <div className="sdo-alert sdo-alert--error">
          <Icon name="alert" size={16} />
          <div>
            <strong>Não foi possível carregar os cartões.</strong>
            <span>{error}</span>
          </div>
          <button type="button" className="sfo-btn sfo-btn--sm" onClick={() => void load()}>
            Tentar novamente
          </button>
        </div>
      )}

      {!connected && !loading && (
        <div className={`sdo-alert ${settings?.skipTrello ? 'sdo-alert--info' : 'sdo-alert--warning'}`}>
          <Icon name={settings?.skipTrello ? 'info' : 'settings'} size={16} />
          <div>
            <strong>{settings?.skipTrello ? 'Modo sem Trello.' : 'Conecte sua conta do Trello.'}</strong>
            <span>
              {settings?.skipTrello
                ? 'A extensão está pronta para usar; os quadros e cartões ficam vazios até você conectar.'
                : 'Entre com sua conta do Trello para ver seus quadros e cartões. Você também pode continuar sem conectar.'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`sfo-btn sfo-btn--sm ${settings?.skipTrello ? '' : 'sfo-btn--primary'}`}
              onClick={() => void openOptions('connection')}
            >
              {settings?.skipTrello ? 'Conectar quando quiser' : 'Conectar com Trello'}
            </button>
            {!settings?.skipTrello && (
              <button
                type="button"
                className="sfo-btn sfo-btn--sm"
                onClick={() => void continueWithoutTrello()}
              >
                Continuar sem Trello
              </button>
            )}
          </div>
        </div>
      )}

      {connected && settings && !settings.defaultListId && !loading && (
        <div className="sdo-alert sdo-alert--info">
          <Icon name="info" size={16} />
          <div>
            <strong>Defina o destino padrão.</strong>
            <span>Escolha um quadro e uma lista para criar cartões diretamente pelo SEI.</span>
          </div>
          <button
            type="button"
            className="sfo-btn sfo-btn--sm"
            onClick={() => void openOptions('destination')}
          >
            Abrir opções
          </button>
        </div>
      )}

      {connected && settings && !seiOriginActive && seiTab && (
        <ActivationCard settings={settings} lastTab={seiTab} onChanged={setSettings} />
      )}

      {connected && (
        <>
          <section className="sdo-metrics" aria-label="Resumo dos cartões">
            <button
              type="button"
              className={`sdo-metric sdo-metric--danger${filters.due === 'overdue' ? ' sdo-metric--active' : ''}`}
              onClick={() => toggleDue('overdue')}
              aria-pressed={filters.due === 'overdue'}
              title={filters.due === 'overdue' ? 'Remover filtro de atrasados' : 'Filtrar atrasados'}
            >
              <span className="sdo-metric__icon">
                <Icon name="alert" size={16} />
              </span>
              <span className="sdo-metric__body">
                <span>Atrasados</span>
                <strong>{summary.overdue}</strong>
                <small>precisam de atenção</small>
              </span>
              {filters.due === 'overdue' && (
                <span className="sdo-metric__flag" aria-hidden="true">
                  <Icon name="check" size={11} />
                </span>
              )}
            </button>
            <button
              type="button"
              className={`sdo-metric sdo-metric--warning${filters.due === 'today' ? ' sdo-metric--active' : ''}`}
              onClick={() => toggleDue('today')}
              aria-pressed={filters.due === 'today'}
              title={filters.due === 'today' ? 'Remover filtro de vencendo hoje' : 'Filtrar vencendo hoje'}
            >
              <span className="sdo-metric__icon">
                <Icon name="calendar" size={16} />
              </span>
              <span className="sdo-metric__body">
                <span>Vencem hoje</span>
                <strong>{summary.today}</strong>
                <small>prazos do dia</small>
              </span>
              {filters.due === 'today' && (
                <span className="sdo-metric__flag" aria-hidden="true">
                  <Icon name="check" size={11} />
                </span>
              )}
            </button>
            <button
              type="button"
              className={`sdo-metric sdo-metric--accent${filters.due === 'soon' ? ' sdo-metric--active' : ''}`}
              onClick={() => toggleDue('soon')}
              aria-pressed={filters.due === 'soon'}
              title={
                filters.due === 'soon' ? 'Remover filtro dos próximos 7 dias' : 'Filtrar próximos 7 dias'
              }
            >
              <span className="sdo-metric__icon">
                <Icon name="clock" size={16} />
              </span>
              <span className="sdo-metric__body">
                <span>Próximos 7 dias</span>
                <strong>{summary.soon}</strong>
                <small>no radar</small>
              </span>
              {filters.due === 'soon' && (
                <span className="sdo-metric__flag" aria-hidden="true">
                  <Icon name="check" size={11} />
                </span>
              )}
            </button>
            <button
              type="button"
              className={`sdo-metric sdo-metric--updated${
                filters.processUpdate === 'unread' ? ' sdo-metric--active' : ''
              }`}
              onClick={() => toggleProcessUpdate('unread')}
              aria-pressed={filters.processUpdate === 'unread'}
              title={
                filters.processUpdate === 'unread'
                  ? 'Remover filtro de atualizações no SEI'
                  : 'Filtrar processos atualizados no SEI'
              }
            >
              <span className="sdo-metric__icon">
                <Icon name="refresh" size={16} />
              </span>
              <span className="sdo-metric__body">
                <span>Atualizados</span>
                <strong>{summary.unread}</strong>
                <small>atualizações no SEI</small>
              </span>
              {filters.processUpdate === 'unread' && (
                <span className="sdo-metric__flag" aria-hidden="true">
                  <Icon name="check" size={11} />
                </span>
              )}
            </button>
            <button
              type="button"
              className="sdo-metric sdo-metric--total"
              onClick={resetToScope}
              title={
                filters.boardId
                  ? `Mostrar todos os cartões do quadro ${scopeName}`
                  : 'Mostrar todos os cartões de todos os quadros'
              }
            >
              <span className="sdo-metric__icon">
                <Icon name="link" size={16} />
              </span>
              <span className="sdo-metric__body">
                <span>
                  {filters.link === 'all'
                    ? 'Total de cartões'
                    : filters.link === 'unlinked'
                      ? 'Total sem vínculo'
                      : 'Total vinculado'}
                </span>
                <strong>{scopeTotal}</strong>
                <small>{scopeName}</small>
              </span>
            </button>
          </section>

          <div className="sdo-mini-metrics">
            <button
              type="button"
              className={filters.due === 'none' ? 'sdo-mini--active' : undefined}
              onClick={() => toggleDue('none')}
              aria-pressed={filters.due === 'none'}
            >
              <Icon name="calendar" size={12} /> Sem prazo <strong>{summary.none}</strong>
            </button>
            <button
              type="button"
              className={filters.due === 'complete' ? 'sdo-mini--active' : undefined}
              onClick={() => toggleDue('complete')}
              aria-pressed={filters.due === 'complete'}
            >
              <Icon name="check" size={12} /> Concluídos <strong>{summary.done}</strong>
            </button>
            <button
              type="button"
              className={filters.activity === '7d' ? 'sdo-mini--active' : undefined}
              onClick={() => toggleActivity('7d')}
              aria-pressed={filters.activity === '7d'}
            >
              <Icon name="refresh" size={12} /> Trello 7 dias <strong>{summary.updated7d}</strong>
            </button>
            <span>
              <Icon name="link" size={12} /> {summary.processes} processos
            </span>
            <span>
              <Icon name="tag" size={12} /> {summary.labels} etiquetas
            </span>
            <span>
              <Icon name="board" size={12} /> {summary.boards} quadros
            </span>
          </div>

          <section className="sdo-command" aria-label="Busca e filtros">
            <label className="sdo-board-picker" title="Escolher o quadro exibido no painel">
              <Icon name="board" size={15} />
              <span className="sdo-board-picker__label">Quadro</span>
              <select
                className="sdo-board-picker__select"
                value={filters.boardId}
                onChange={(event) => updateFilters({ boardId: event.target.value, listId: '' })}
                aria-label="Quadro"
              >
                <option value="">Todos os quadros</option>
                {boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.name}
                  </option>
                ))}
                {filters.boardId && !boards.some((board) => board.id === filters.boardId) && (
                  <option value={filters.boardId}>
                    {settings?.defaultBoardId === filters.boardId && settings.defaultBoardName
                      ? settings.defaultBoardName
                      : 'Quadro selecionado'}
                  </option>
                )}
              </select>
            </label>
            <div className="sdo-search">
              <Icon name="search" size={16} />
              <input
                id="sdo-search"
                className="sdo-search__input"
                value={filters.search}
                onChange={(event) => updateFilters({ search: event.target.value })}
                placeholder="Buscar cartão, processo, tipo, etiqueta, quadro ou lista…"
                aria-label="Buscar cartão, processo, tipo, etiqueta, quadro ou lista"
                title="Atalho: / ou Ctrl+K"
              />
              {filters.search && (
                <button
                  type="button"
                  className="sdo-search__clear"
                  onClick={() => updateFilters({ search: '' })}
                  aria-label="Limpar busca"
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </div>
            <button
              type="button"
              className={`sdo-filter-toggle${showFilters ? ' sdo-filter-toggle--open' : ''}`}
              onClick={() => setShowFilters((current) => !current)}
              aria-expanded={showFilters}
            >
              <Icon name="filter" size={15} />
              Filtros
              {active > 0 && <span className="sdo-filter-count">{active}</span>}
            </button>
            <label className="sdo-sort" title="Ordenar cartões">
              <Icon name="list" size={15} />
              <select
                id="sdo-sort"
                className="sdo-sort__select"
                value={filters.sort}
                onChange={(event) => updateFilters({ sort: event.target.value as Filters['sort'] })}
                aria-label="Ordenar cartões"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="sdo-view-toggle" role="group" aria-label="Modo de visualização">
              <button
                type="button"
                className={view === 'list' ? 'is-active' : ''}
                onClick={() => changeView('list')}
                aria-pressed={view === 'list'}
                title="Visão em lista"
                aria-label="Visão em lista"
              >
                <Icon name="list" size={14} />
              </button>
              <button
                type="button"
                className={view === 'board' ? 'is-active' : ''}
                onClick={() => changeView('board')}
                aria-pressed={view === 'board'}
                title="Visão em quadro (Kanban)"
                aria-label="Visão em quadro (Kanban)"
              >
                <Icon name="columns" size={14} />
              </button>
            </div>
            {view === 'board' && moveHistory.length > 0 && (
              <button
                type="button"
                className="sdo-icon-action"
                onClick={() => void undoLastMove()}
                title="Desfazer última movimentação (Ctrl+Z)"
                aria-label="Desfazer última movimentação"
              >
                <Icon name="undo" size={15} />
              </button>
            )}
            <button
              type="button"
              className="sdo-icon-action"
              onClick={exportCsv}
              title="Exportar CSV"
              aria-label="Exportar CSV"
            >
              <Icon name="external" size={15} />
            </button>
          </section>

          {showFilters && (
            <DashboardFilters
              filters={filters}
              boards={boards}
              lists={lists}
              labels={labels}
              types={types}
              visibleCount={visibleCards.length}
              totalCount={cards.length}
              lastVisit={lastVisit}
              onChange={updateFilters}
              onClear={clearFilters}
              onMarkSeen={markSeen}
              onExport={exportCsv}
              onCollapse={() => setShowFilters(false)}
              showSearch={false}
            />
          )}

          {activeChips.length > 0 && (
            <div className="sdo-active-chips">
              <span className="sdo-active-chips__label">Filtros ativos</span>
              {activeChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  className="sdo-chip sdo-chip--removable"
                  onClick={() => updateFilters(chip.clear)}
                  title={`Remover filtro: ${chip.label}`}
                >
                  {chip.label}
                  <Icon name="close" size={10} />
                </button>
              ))}
              <button type="button" className="sdo-chip sdo-chip--clear" onClick={clearFilters}>
                <Icon name="close" size={11} /> Limpar
              </button>
            </div>
          )}

          {view === 'list' && filters.boardId && (
            <section className="sdo-lists" aria-label="Cartões por lista">
              <div className="sdo-lists__head">
                <span className="sdo-lists__title">
                  <Icon name="list" size={14} />
                  Listas do quadro
                </span>
                <div className="sdo-lists__tools">
                  <button
                    type="button"
                    className={`sdo-unlinked-toggle${
                      filters.link === 'linked' ? ' sdo-unlinked-toggle--on' : ''
                    }`}
                    onClick={() => toggleLinkFilter('linked')}
                    aria-pressed={filters.link === 'linked'}
                    title="Mostrar apenas cartões com vínculo com o SEI"
                  >
                    <Icon name="link" size={13} />
                    Com vínculo
                    {filters.link === 'linked' && (
                      <span className="sdo-unlinked-toggle__count">{cards.length}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className={`sdo-unlinked-toggle${
                      filters.link === 'unlinked' ? ' sdo-unlinked-toggle--on' : ''
                    }`}
                    onClick={() => toggleLinkFilter('unlinked')}
                    aria-pressed={filters.link === 'unlinked'}
                    title="Mostrar apenas cartões sem vínculo com o SEI"
                  >
                    <Icon name="unlink" size={13} />
                    Sem vínculo
                    {filters.link === 'unlinked' && (
                      <span className="sdo-unlinked-toggle__count">{cards.length}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className={`sdo-lists__all${
                      filters.listId || filters.link !== 'all' ? ' sdo-lists__all--clear' : ''
                    }`}
                    onClick={() => updateFilters({ listId: '', link: 'all' })}
                    title={
                      filters.listId || filters.link !== 'all'
                        ? 'Mostrar todas as listas e remover o filtro de vínculo'
                        : 'Mostrar todas as listas do quadro'
                    }
                  >
                    {filters.listId ? <Icon name="close" size={12} /> : null}
                    Todas as listas
                    <span className="sdo-lists__all-count">{listTotal}</span>
                  </button>
                </div>
              </div>
              <div className="sdo-lists__grid">
                {listCounts.map((list) => {
                  const selected = filters.listId === list.id;
                  if (editingListId === list.id) {
                    return (
                      <div key={list.id} className="sdo-list-card sdo-list-card--editing">
                        <span className="sdo-list-card__body">
                          <span className="sdo-list-card__name">Renomear lista</span>
                          <input
                            className="sdo-inline-input"
                            value={editingListName}
                            onChange={(event) => setEditingListName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                void renameList();
                              }
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                setEditingListId(null);
                              }
                            }}
                            autoFocus
                            disabled={listBusy}
                            aria-label="Novo nome da lista"
                          />
                        </span>
                        <div className="sdo-list-card__edit-actions">
                          <button
                            type="button"
                            className="sfo-btn sfo-btn--sm sfo-btn--primary"
                            onClick={() => void renameList()}
                            disabled={listBusy || !editingListName.trim()}
                          >
                            {listBusy ? <span className="sfo-spinner" /> : <Icon name="check" size={12} />}
                            Salvar
                          </button>
                          <button
                            type="button"
                            className="sfo-btn sfo-btn--sm"
                            onClick={() => setEditingListId(null)}
                            disabled={listBusy}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={list.id} className="sdo-list-card-wrap">
                      <button
                        type="button"
                        className={`sdo-list-card${selected ? ' sdo-list-card--on' : ''}`}
                        onClick={() => updateFilters({ listId: selected ? '' : list.id })}
                        aria-pressed={selected}
                        title={`Filtrar por ${list.name}`}
                      >
                        <span className="sdo-list-card__icon">
                          <Icon name="list" size={16} />
                        </span>
                        <span className="sdo-list-card__body">
                          <span className="sdo-list-card__name">{list.name}</span>
                          <strong>{list.count}</strong>
                          <small>{list.count === 1 ? 'cartão' : 'cartões'}</small>
                        </span>
                        {selected && (
                          <span className="sdo-list-card__check" aria-hidden="true">
                            <Icon name="check" size={12} />
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="sdo-list-card__edit"
                        onClick={() => startRenameList(list)}
                        title={`Renomear lista ${list.name}`}
                        aria-label={`Renomear lista ${list.name}`}
                      >
                        <Icon name="edit" size={12} />
                      </button>
                    </div>
                  );
                })}
                {addingList ? (
                  <div className="sdo-list-card sdo-list-card--editing">
                    <span className="sdo-list-card__body">
                      <span className="sdo-list-card__name">Nova lista</span>
                      <input
                        className="sdo-inline-input"
                        value={newListName}
                        onChange={(event) => setNewListName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void createList();
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            setAddingList(false);
                            setNewListName('');
                          }
                        }}
                        placeholder="Nome da lista"
                        autoFocus
                        disabled={listBusy}
                        aria-label="Nome da nova lista"
                      />
                    </span>
                    <div className="sdo-list-card__edit-actions">
                      <button
                        type="button"
                        className="sfo-btn sfo-btn--sm sfo-btn--primary"
                        onClick={() => void createList()}
                        disabled={listBusy || !newListName.trim()}
                      >
                        {listBusy ? <span className="sfo-spinner" /> : <Icon name="plus" size={12} />}
                        Criar
                      </button>
                      <button
                        type="button"
                        className="sfo-btn sfo-btn--sm"
                        onClick={() => {
                          setAddingList(false);
                          setNewListName('');
                        }}
                        disabled={listBusy}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="sdo-list-card sdo-list-card--add"
                    onClick={() => {
                      setAddingList(true);
                      setNewListName('');
                    }}
                    title="Adicionar lista neste quadro"
                  >
                    <span className="sdo-list-card__icon">
                      <Icon name="plus" size={16} />
                    </span>
                    <span className="sdo-list-card__body">
                      <span className="sdo-list-card__name">Nova lista</span>
                      <small>Adicionar neste quadro</small>
                    </span>
                  </button>
                )}
              </div>
            </section>
          )}

          {loading ? (
            <div className="sdo-loading">
              <span className="sfo-spinner" />
              <span>Carregando cartões do Trello…</span>
            </div>
          ) : visibleCards.length === 0 ? (
            <div className="sdo-empty">
              <Icon name="search" size={26} />
              <strong>Nenhum cartão encontrado</strong>
              <span>
                {cards.length === 0
                  ? filters.link === 'unlinked'
                    ? 'Nenhum cartão sem vínculo neste quadro. Crie um em "Novo cartão".'
                    : filters.link === 'linked'
                      ? 'Vincule cartões aos processos do SEI para vê-los aqui.'
                      : 'Nenhum cartão neste quadro. Crie um em "Novo cartão".'
                  : 'Ajuste os filtros para ampliar os resultados.'}
              </span>
              {active > 0 && (
                <button type="button" className="sfo-btn sfo-btn--sm" onClick={clearFilters}>
                  Limpar filtros
                </button>
              )}
            </div>
          ) : view === 'board' ? (
            <KanbanBoard
              groups={kanbanGroups}
              catalog={catalog}
              pinned={pinned}
              onChanged={handleChanged}
              onRemoved={handleRemoved}
              onToggleLabel={handleToggleLabel}
              onProcessesRead={handleProcessesRead}
              onTogglePin={togglePin}
              onMoveCard={moveCardToList}
              onMoveColumn={moveColumn}
              canMoveColumns={Boolean(filters.boardId)}
              onAddCard={(boardId, listId) => openCreate({ boardId, listId })}
              canManageLists={Boolean(filters.boardId)}
              onRenameList={async (listId, name) => {
                try {
                  await renameListById(listId, name);
                  showToast('Lista renomeada.', 'success');
                } catch (cause) {
                  showToast(errorMessage(cause), 'error');
                }
              }}
              onCreateList={async (name) => {
                try {
                  await createListByName(name);
                  showToast('Lista criada.', 'success');
                } catch (cause) {
                  showToast(errorMessage(cause), 'error');
                }
              }}
            />
          ) : (
            orderedGroups.map((group) => (
              <section key={group.key} className="sdo-section">
                {group.title && (
                  <h2>
                    <span className={`sdo-dot sdo-dot--${group.tone ?? 'accent'}`} />
                    {group.title}
                    <span className="sdo-count">{group.cards.length}</span>
                    {group.subtitle && <span className="sdo-section__subtitle">{group.subtitle}</span>}
                  </h2>
                )}
                <div className="sdo-list">
                  {group.cards.map((card) => (
                    <DashboardCard
                      key={`${group.key}:${card.id}`}
                      card={card}
                      catalog={catalog}
                      pinned={pinned.has(card.id)}
                      onChanged={handleChanged}
                      onRemoved={handleRemoved}
                      onToggleLabel={handleToggleLabel}
                      onProcessesRead={handleProcessesRead}
                      onTogglePin={togglePin}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </>
      )}

      <footer className="sdo-footer">
        <span>SEI Flow · painel de controle · Desenvolvido por Engenheiro Leonardo Almeida de Oliveira</span>
        <span className="sdo-footer__links">Sem coleta de dados · suporte em Opções → Diagnóstico</span>
      </footer>

      {showCreate && (
        <CreateCardDialog
          defaultName=""
          initialBoardId={createTarget?.boardId || filters.boardId || settings?.defaultBoardId}
          initialListId={createTarget?.listId || filters.listId || settings?.defaultListId}
          onClose={closeCreate}
          onCreated={(card) => {
            if (card.idBoard && card.idBoard !== filters.boardId) {
              updateFilters({ boardId: card.idBoard, listId: '' });
            }
            const linkMismatch =
              (filters.link === 'linked' && card.links.length === 0) ||
              (filters.link === 'unlinked' && card.links.length > 0);
            if (linkMismatch) updateFilters({ link: 'all' });
            setCards((previous) => [card, ...previous]);
            closeCreate();
          }}
        />
      )}
    </div>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<Dashboard />);
