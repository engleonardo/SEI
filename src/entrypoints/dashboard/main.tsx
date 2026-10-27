import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import type { Settings, TrelloCard, TrelloLabel } from '../../core/domain/types';
import { callRpc, errorMessage } from '../../core/messaging/client';
import { openOptionsPage } from '../../core/messaging/actions';
import type { LastActionTab } from '../../core/storage/last-tab';
import type { ProcessCatalog, ProcessRecord } from '../../core/storage/processes';
import { isOriginActivated } from '../../core/storage/settings';
import { BrandMark } from '../../ui/BrandMark';
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

  const version = browser.runtime.getManifest().version;
  const connected = Boolean(settings?.appKey && settings?.appToken);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    setError(null);
    try {
      const nextSettings = await callRpc('settings:get', undefined);
      setSettings(nextSettings);

      const [processRecords, nextLastTab] = await Promise.all([
        callRpc('processes:list', undefined),
        callRpc('activation:last-tab', undefined),
      ]);
      const nextCatalog: ProcessCatalog = {};
      for (const record of processRecords as ProcessRecord[]) {
        nextCatalog[record.number] = record;
      }
      setCatalog(nextCatalog);
      setLastTab(nextLastTab);

      if (nextSettings.appKey && nextSettings.appToken) {
        const nextCards = await callRpc('trello:all-linked-cards', undefined);
        setCards(nextCards);
      } else {
        setCards([]);
      }
      writeLastVisit();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (settings) setThemePreference(settings.theme);
  }, [settings]);

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
      saveFilters(next);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    const next = { ...DEFAULT_FILTERS };
    setFilters(next);
    saveFilters(next);
  }, []);

  const markSeen = useCallback(() => {
    const now = Date.now();
    writeLastVisit(now);
    setLastVisit(now);
    showToast('Atualizações marcadas como vistas.', 'success');
  }, []);

  const boards = useMemo(() => {
    const map = new Map<string, string>();
    for (const card of cards) {
      if (card.idBoard && !map.has(card.idBoard)) {
        map.set(card.idBoard, card.board?.name ?? 'Quadro');
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [cards]);

  const lists = useMemo(() => {
    const map = new Map<string, { id: string; name: string; boardId: string }>();
    for (const card of cards) {
      if (filters.boardId && card.idBoard !== filters.boardId) continue;
      if (card.idList && !map.has(card.idList)) {
        map.set(card.idList, {
          id: card.idList,
          name: card.list?.name ?? 'Lista',
          boardId: card.idBoard,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (filters.boardId) return a.name.localeCompare(b.name, 'pt-BR');
      const boardA = cards.find((card) => card.idBoard === a.boardId)?.board?.name ?? '';
      const boardB = cards.find((card) => card.idBoard === b.boardId)?.board?.name ?? '';
      const boardCompare = boardA.localeCompare(boardB, 'pt-BR');
      return boardCompare !== 0 ? boardCompare : a.name.localeCompare(b.name, 'pt-BR');
    });
  }, [cards, filters.boardId]);

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

  const groups = useMemo(
    () => groupCards(visibleCards, filters.group, filters.sort, catalog),
    [visibleCards, filters.group, filters.sort, catalog],
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
  const active = activeFilterCount(filters);
  const lastTabWeb = Boolean(lastTab?.url && /^https?:\/\//i.test(lastTab.url));
  const siteActive = Boolean(
    lastTabWeb && lastTab?.url && settings && isOriginActivated(lastTab.url, settings),
  );

  const activeChips: string[] = [];
  if (filters.search.trim()) activeChips.push(`Busca: ${filters.search.trim()}`);
  if (filters.boardId) {
    const board = boards.find((item) => item.id === filters.boardId);
    if (board) activeChips.push(board.name);
  }
  if (filters.listId) {
    const list = lists.find((item) => item.id === filters.listId);
    if (list) activeChips.push(list.name);
  }
  if (filters.processType) {
    activeChips.push(
      filters.processType === '__none__'
        ? 'Sem tipo de processo'
        : types.find((item) => item.value === filters.processType)?.label ?? filters.processType,
    );
  }
  for (const labelId of filters.labelIds) {
    const label = labels.find((item) => item.label.id === labelId)?.label;
    if (label) activeChips.push(label.name || label.color || 'Etiqueta');
  }
  if (filters.withoutLabels) activeChips.push('Sem etiqueta');
  if (filters.due !== 'any') {
    activeChips.push(
      DUE_FILTER_OPTIONS.find((option) => option.value === filters.due)?.label ?? filters.due,
    );
  }
  if (filters.activity !== 'any') {
    activeChips.push(
      ACTIVITY_FILTER_OPTIONS.find((option) => option.value === filters.activity)?.label ??
        filters.activity,
    );
  }
  if (filters.processUpdate !== 'any') {
    activeChips.push(
      PROCESS_UPDATE_OPTIONS.find((option) => option.value === filters.processUpdate)?.label ??
        filters.processUpdate,
    );
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
              <span className={`sdo-status ${siteActive ? 'sdo-status--on' : 'sdo-status--off'}`}>
                <span className="sdo-status__dot" />
                Site {siteActive ? 'ativado' : 'não ativado'}
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
          {lastTab?.url && (
            <a className="sfo-btn sfo-btn--sm" href={lastTab.url} target="_blank" rel="noreferrer">
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

      {settings && !siteActive && lastTabWeb && (
        <ActivationCard settings={settings} lastTab={lastTab} onChanged={setSettings} />
      )}

      <section className="sdo-metrics" aria-label="Resumo dos cartões">
        <button
          type="button"
          className="sdo-metric sdo-metric--danger"
          onClick={() => updateFilters({ due: 'overdue' })}
          title="Filtrar atrasados"
        >
          <span className="sdo-metric__icon">
            <Icon name="alert" size={16} />
          </span>
          <span className="sdo-metric__body">
            <span>Atrasados</span>
            <strong>{summary.overdue}</strong>
            <small>precisam de atenção</small>
          </span>
        </button>
        <button
          type="button"
          className="sdo-metric sdo-metric--warning"
          onClick={() => updateFilters({ due: 'today' })}
          title="Filtrar vencendo hoje"
        >
          <span className="sdo-metric__icon">
            <Icon name="calendar" size={16} />
          </span>
          <span className="sdo-metric__body">
            <span>Vencem hoje</span>
            <strong>{summary.today}</strong>
            <small>prazos do dia</small>
          </span>
        </button>
        <button
          type="button"
          className="sdo-metric sdo-metric--accent"
          onClick={() => updateFilters({ due: 'soon' })}
          title="Filtrar próximos 7 dias"
        >
          <span className="sdo-metric__icon">
            <Icon name="clock" size={16} />
          </span>
          <span className="sdo-metric__body">
            <span>Próximos 7 dias</span>
            <strong>{summary.soon}</strong>
            <small>no radar</small>
          </span>
        </button>
        <button
          type="button"
          className="sdo-metric sdo-metric--updated"
          onClick={() => updateFilters({ processUpdate: 'unread' })}
          title="Filtrar processos atualizados no SEI"
        >
          <span className="sdo-metric__icon">
            <Icon name="refresh" size={16} />
          </span>
          <span className="sdo-metric__body">
            <span>Atualizados</span>
            <strong>{summary.unread}</strong>
            <small>atualizações no SEI</small>
          </span>
        </button>
        <button
          type="button"
          className="sdo-metric sdo-metric--total"
          onClick={clearFilters}
          title="Mostrar todos os cartões"
        >
          <span className="sdo-metric__icon">
            <Icon name="link" size={16} />
          </span>
          <span className="sdo-metric__body">
            <span>Total vinculado</span>
            <strong>{summary.total}</strong>
            <small>de {cards.length} cartões</small>
          </span>
        </button>
      </section>

      <div className="sdo-mini-metrics">
        <button type="button" onClick={() => updateFilters({ due: 'none' })}>
          <Icon name="calendar" size={12} /> Sem prazo <strong>{summary.none}</strong>
        </button>
        <button type="button" onClick={() => updateFilters({ due: 'complete' })}>
          <Icon name="check" size={12} /> Concluídos <strong>{summary.done}</strong>
        </button>
        <button type="button" onClick={() => updateFilters({ activity: '7d' })}>
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
        <button type="button" className="sdo-icon-action" onClick={exportCsv} title="Exportar CSV" aria-label="Exportar CSV">
          <Icon name="external" size={15} />
        </button>
      </section>

      {activeChips.length > 0 && (
        <div className="sdo-active-chips">
          <span className="sdo-active-chips__label">Filtros ativos</span>
          {activeChips.map((chip, index) => (
            <span key={`${chip}-${index}`} className="sdo-chip">
              {chip}
            </span>
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
              ? 'Vincule cartões aos processos do SEI para vê-los aqui.'
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
    </div>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<Dashboard />);
