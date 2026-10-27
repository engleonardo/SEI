import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import type { Settings, TrelloCard, TrelloLabel } from '../../core/domain/types';
import { callRpc, errorMessage } from '../../core/messaging/client';
import { openOptionsPage } from '../../core/messaging/actions';
import type { LastActionTab } from '../../core/storage/last-tab';
import type { ProcessCatalog, ProcessRecord } from '../../core/storage/processes';
import { BrandMark } from '../../ui/BrandMark';
import { CardItem } from '../../ui/components/CardItem';
import { Modal } from '../../ui/components/Modal';
import { Icon } from '../../ui/icons';
import { showToast } from '../../ui/toast';
import { setThemePreference } from '../../ui/theme';
import { ActivationCard } from './ActivationCard';
import { DashboardCard } from './DashboardCard';
import { DashboardFilters, type LabelFilterOption, type TypeFilterOption } from './DashboardFilters';
import {
  DEFAULT_FILTERS,
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
  const [editingId, setEditingId] = useState<string | null>(null);

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
    showToast('Novidades marcadas como vistas.', 'success');
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

  const summary = useMemo(() => summarize(cards, catalog), [cards, catalog]);

  const visibleCards = useMemo(
    () => cards.filter((card) => matchesFilters(card, filters, catalog, lastVisit)),
    [cards, catalog, filters, lastVisit],
  );

  const groups = useMemo(
    () => groupCards(visibleCards, filters.group, filters.sort, catalog),
    [visibleCards, filters.group, filters.sort, catalog],
  );

  const editingCard = editingId ? cards.find((card) => card.id === editingId) ?? null : null;

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
    if (editingId === cardId) setEditingId(null);
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

  return (
    <div className="sdo-page">
      <header className="sdo-header">
        <div className="sdo-brand">
          <BrandMark size={46} />
          <div>
            <h1>
              Painel SEI Flow <span className="sdo-version">v{version}</span>
            </h1>
            <p>Gestão eficiente de processos, prazos, etiquetas e cartões.</p>
          </div>
        </div>
        <div className="sdo-actions">
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
            <span>
              O painel mostra os cartões vinculados aos processos do SEI. Informe a APP-KEY e o
              TOKEN para começar.
            </span>
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

      {settings && (
        <ActivationCard
          settings={settings}
          lastTab={lastTab}
          onChanged={setSettings}
        />
      )}

      <section className="sdo-summary" aria-label="Resumo dos cartões">
        <button
          type="button"
          className="sdo-summary-card sdo-summary-card--danger"
          onClick={() => updateFilters({ due: 'overdue' })}
          title="Filtrar atrasados"
        >
          <span>Atrasados</span>
          <strong>{summary.overdue}</strong>
        </button>
        <button
          type="button"
          className="sdo-summary-card sdo-summary-card--warning"
          onClick={() => updateFilters({ due: 'today' })}
          title="Filtrar vencendo hoje"
        >
          <span>Vencem hoje</span>
          <strong>{summary.today}</strong>
        </button>
        <button
          type="button"
          className="sdo-summary-card sdo-summary-card--accent"
          onClick={() => updateFilters({ due: 'soon' })}
          title="Filtrar próximos 7 dias"
        >
          <span>Próximos 7 dias</span>
          <strong>{summary.soon}</strong>
        </button>
        <button
          type="button"
          className="sdo-summary-card"
          onClick={() => updateFilters({ due: 'none' })}
          title="Filtrar sem prazo"
        >
          <span>Sem prazo</span>
          <strong>{summary.none}</strong>
        </button>
        <button
          type="button"
          className="sdo-summary-card sdo-summary-card--success"
          onClick={() => updateFilters({ due: 'complete' })}
          title="Filtrar concluídos"
        >
          <span>Concluídos</span>
          <strong>{summary.done}</strong>
        </button>
        <button
          type="button"
          className="sdo-summary-card sdo-summary-card--accent"
          onClick={() => updateFilters({ activity: '7d' })}
          title="Filtrar atualizados nos últimos 7 dias"
        >
          <span>Atualizados · 7 dias</span>
          <strong>{summary.updated7d}</strong>
        </button>
        <button
          type="button"
          className="sdo-summary-card sdo-summary-card--danger"
          onClick={() => updateFilters({ processUpdate: 'unread' })}
          title="Filtrar processos com novidade no SEI"
        >
          <span>SEI com novidade</span>
          <strong>{summary.unread}</strong>
        </button>
        <button
          type="button"
          className="sdo-summary-card"
          onClick={clearFilters}
          title="Mostrar todos os cartões"
        >
          <span>Total vinculado</span>
          <strong>{summary.total}</strong>
        </button>
      </section>

      <div className="sdo-secondary">
        <span>
          <Icon name="link" size={13} /> {summary.processes} processo(s) vinculado(s)
        </span>
        <span>
          <Icon name="tag" size={13} /> {summary.labels} etiqueta(s)
        </span>
        <span>
          <Icon name="board" size={13} /> {boards.length} quadro(s)
        </span>
        {active > 0 && (
          <span className="sdo-secondary__active">
            <Icon name="filter" size={13} /> {active} filtro(s) ativo(s)
          </span>
        )}
      </div>

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
      />

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
                  onEdit={() => setEditingId(card.id)}
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

      {editingCard && (
        <Modal
          title="Detalhes e edição do cartão"
          subtitle={editingCard.name}
          onClose={() => setEditingId(null)}
          footer={
            <button
              type="button"
              className="sf-btn"
              onClick={() => setEditingId(null)}
            >
              Fechar
            </button>
          }
        >
          <CardItem
            card={editingCard}
            processNumber={editingCard.links[0] ?? ''}
            onChanged={handleChanged}
            onRemoved={handleRemoved}
          />
        </Modal>
      )}
    </div>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<Dashboard />);
