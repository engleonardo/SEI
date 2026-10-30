import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import type {
  Settings,
  TrelloBoard,
  TrelloCard,
  TrelloLabel,
  TrelloList,
} from '../../core/domain/types';
import { callRpc, errorMessage } from '../../core/messaging/client';
import { openOptionsPage } from '../../core/messaging/actions';
import type { LastActionTab } from '../../core/storage/last-tab';
import type { ProcessCatalog, ProcessRecord } from '../../core/storage/processes';
import { isOriginActivated, watchSettings } from '../../core/storage/settings';
import { looksLikeSeiUrl } from '../../core/sei/detect';
import { BrandMark } from '../../ui/BrandMark';
import { CreateCardDialog } from '../../ui/components/CreateCardDialog';
import { Icon } from '../../ui/icons';
import { showToast } from '../../ui/toast';
import { setThemePreference } from '../../ui/theme';
import { ActivationCard } from './ActivationCard';
import { DashboardCard } from './DashboardCard';
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
  writeLastVisit,
  type DashboardFilters as Filters,
} from './model';
import '../options/style.css';
import './style.css';

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
    if (card.links.some((number) => catalog[number]?.unread)) unread += 1;
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

  const version = browser.runtime.getManifest().version;
  const connected = Boolean(settings?.appKey && settings?.appToken);
  const loadSeq = useRef(0);

  const load = useCallback(async (silent = false) => {
    const seq = ++loadSeq.current;
    if (!silent) setLoading(true);
    setRefreshing(true);
    setError(null);
    try {
      const nextSettings = await callRpc('settings:get', undefined);
      if (seq !== loadSeq.current) return;
      setSettings(nextSettings);

      const [processRecords, nextLastTab, nextBoards] = await Promise.all([
        callRpc('processes:list', undefined),
        callRpc('activation:last-tab', undefined),
        nextSettings.appKey && nextSettings.appToken
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

      if (nextSettings.appKey && nextSettings.appToken) {
        if (filters.link === 'unlinked') {
          const boardId = filters.boardId || nextSettings.defaultBoardId;
          if (!boardId) {
            if (seq === loadSeq.current) setCards([]);
          } else {
            const boardCards = await callRpc('trello:board-cards', {
              boardId,
              fresh: true,
            });
            if (seq === loadSeq.current) {
              setCards(boardCards.filter((card) => card.links.length === 0));
            }
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
  }, [filters.link, filters.boardId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (settings) setThemePreference(settings.theme);
  }, [settings]);

  useEffect(() => watchSettings((next) => setThemePreference(next.theme)), []);

  const defaultBoardApplied = useRef(false);
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
  }, [filters.boardId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.composedPath()[0];
      const editable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (editable) return;
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
    const base = cards.filter((card) =>
      matchesFilters(card, { ...filters, listId: '' }, catalog, lastVisit),
    );
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

  const handleToggleLabel = (labelId: string) => {
    updateFilters({
      labelIds: filters.labelIds.includes(labelId)
        ? filters.labelIds.filter((id) => id !== labelId)
        : [...filters.labelIds, labelId],
      withoutLabels: false,
    });
  };

  const toggleLinkFilter = () => {
    const link = filters.link === 'unlinked' ? 'linked' : 'unlinked';
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
  const hasActivatedSite = Boolean(
    settings && (settings.allSites || settings.autoSeiHosts || settings.activatedOrigins.length > 0),
  );
  const seiOriginActive = Boolean(
    seiTab?.url && settings && isOriginActivated(seiTab.url, settings),
  );

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
          : types.find((item) => item.value === filters.processType)?.label ?? filters.processType,
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
  if (filters.link === 'unlinked') {
    activeChips.push({ key: 'link', label: 'Sem vínculo SEI', clear: { link: 'linked' } });
  }

  return (
    <div className="sdo-page">
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
              <span className={`sdo-status ${connected ? 'sdo-status--on' : 'sdo-status--off'}`}>
                <span className="sdo-status__dot" />
                Trello {connected ? 'conectado' : 'não conectado'}
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
              {settings?.defaultListName && (
                <span className="sdo-status sdo-status--muted">
                  <Icon name="board" size={12} />
                  {settings.defaultBoardName} » {settings.defaultListName}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="sdo-hero__actions">
          <button
            type="button"
            className="sfo-btn sfo-btn--sm sfo-btn--primary"
            onClick={() => setShowCreate(true)}
            disabled={!connected}
            title="Criar cartão no Trello sem abrir o Trello"
          >
            <Icon name="plus" size={14} />
            Novo cartão
          </button>
          {seiTab?.url && (
            <a className="sfo-btn sfo-btn--sm" href={seiTab.url} target="_blank" rel="noreferrer">
              <Icon name="external" size={14} />
              Abrir SEI
            </a>
          )}
          <button
            type="button"
            className="sfo-btn sfo-btn--sm"
            onClick={() => void load(true)}
            disabled={refreshing}
          >
            {refreshing ? <span className="sfo-spinner" /> : <Icon name="refresh" size={14} />}
            Atualizar
          </button>
          <button
            type="button"
            className="sfo-btn sfo-btn--sm"
            onClick={() => void openOptionsPage()}
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
        <div className="sdo-alert sdo-alert--warning">
          <Icon name="settings" size={16} />
          <div>
            <strong>Conecte sua conta do Trello.</strong>
            <span>Informe a APP-KEY e o TOKEN para ver os cartões vinculados aos processos.</span>
          </div>
          <button
            type="button"
            className="sfo-btn sfo-btn--sm sfo-btn--primary"
            onClick={() => void openOptionsPage()}
          >
            Conectar ao Trello
          </button>
        </div>
      )}

      {connected && settings && !settings.defaultListId && !loading && (
        <div className="sdo-alert sdo-alert--info">
          <Icon name="info" size={16} />
          <div>
            <strong>Defina o destino padrão.</strong>
            <span>Escolha um quadro e uma lista para criar cartões diretamente pelo SEI.</span>
          </div>
          <button type="button" className="sfo-btn sfo-btn--sm" onClick={() => void openOptionsPage()}>
            Abrir opções
          </button>
        </div>
      )}

      {settings && !seiOriginActive && seiTab && (
        <ActivationCard settings={settings} lastTab={seiTab} onChanged={setSettings} />
      )}

      <section className="sdo-metrics" aria-label="Resumo dos cartões">
        <button
          type="button"
          className={`sdo-metric sdo-metric--danger${
            filters.due === 'overdue' ? ' sdo-metric--active' : ''
          }`}
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
          className={`sdo-metric sdo-metric--warning${
            filters.due === 'today' ? ' sdo-metric--active' : ''
          }`}
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
          className={`sdo-metric sdo-metric--accent${
            filters.due === 'soon' ? ' sdo-metric--active' : ''
          }`}
          onClick={() => toggleDue('soon')}
          aria-pressed={filters.due === 'soon'}
          title={filters.due === 'soon' ? 'Remover filtro dos próximos 7 dias' : 'Filtrar próximos 7 dias'}
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
            <span>{filters.link === 'unlinked' ? 'Total sem vínculo' : 'Total vinculado'}</span>
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
        <button type="button" className="sdo-icon-action" onClick={exportCsv} title="Exportar CSV" aria-label="Exportar CSV">
          <Icon name="external" size={15} />
        </button>
      </section>

      {filters.boardId && listCounts.length > 0 && (
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
                  filters.link === 'unlinked' ? ' sdo-unlinked-toggle--on' : ''
                }`}
                onClick={toggleLinkFilter}
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
                  filters.listId || filters.link === 'unlinked' ? ' sdo-lists__all--clear' : ''
                }`}
                onClick={() => updateFilters({ listId: '', link: 'linked' })}
                title={
                  filters.listId || filters.link === 'unlinked'
                    ? 'Mostrar todas as listas e remover o filtro “Sem vínculo”'
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
              return (
                <button
                  key={list.id}
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
              );
            })}
          </div>
        </section>
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
          showSearch={false}
        />
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
                : 'Vincule cartões aos processos do SEI para vê-los aqui.'
              : 'Ajuste os filtros para ampliar os resultados.'}
          </span>
          {active > 0 && (
            <button type="button" className="sfo-btn sfo-btn--sm" onClick={clearFilters}>
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        groups.map((group) => (
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
                  onChanged={handleChanged}
                  onRemoved={handleRemoved}
                  onToggleLabel={handleToggleLabel}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <footer className="sdo-footer">
        <span>SEI Flow · painel de controle · Desenvolvido por Engenheiro Leonardo Almeida de Oliveira</span>
        <span className="sdo-footer__links">Sem coleta de dados · suporte em Opções → Diagnóstico</span>
      </footer>

      {showCreate && (
        <CreateCardDialog
          defaultName=""
          initialBoardId={filters.boardId || settings?.defaultBoardId}
          initialListId={filters.listId || settings?.defaultListId}
          onClose={() => setShowCreate(false)}
          onCreated={(card) => {
            if (filters.link === 'unlinked') {
              if (card.idBoard && card.idBoard !== filters.boardId) {
                updateFilters({ boardId: card.idBoard, listId: '' });
              }
              setCards((previous) => [card, ...previous]);
            } else {
              updateFilters({ link: 'unlinked', boardId: card.idBoard });
            }
          }}
        />
      )}
    </div>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<Dashboard />);
